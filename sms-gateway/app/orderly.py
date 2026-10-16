"""Bridge to Orderly's /api/sms/gateway/* (claim -> send -> result, inbound).

Orderly decides *what* to send (only messages a person approved, only 08-21h);
this gateway decides *how*: its own queue, pacing and daily limit. Every call is
safe to repeat, so anything that fails is simply retried on the next tick:
- claim hands each message out once; it is stored locally before anything else,
- result is reported until Orderly acknowledges it (409 = already settled there),
- inbound carries a stable id, so a re-sent message is stored once.
"""
import datetime
import time
from typing import Optional

import httpx

from . import config, db, workers


def _client() -> httpx.Client:
    return httpx.Client(
        base_url=config.ORDERLY_URL,
        headers={"Authorization": "Bearer %s" % config.ORDERLY_TOKEN},
        timeout=20,
    )


def claim(client: httpx.Client) -> int:
    """Pull approved, due reminders into the local queue. Returns how many."""
    # Don't hold claims we can't send today, nor pile up a backlog: Orderly shows
    # claimed messages as "sending" until we report back.
    if db.sent_today() >= config.DAILY_LIMIT or db.orderly_in_flight() > 0:
        return 0
    r = client.post("/api/sms/gateway/claim")
    r.raise_for_status()
    n = 0
    for m in r.json().get("messages", []):
        try:
            number = workers.normalize(m["to"])
        except ValueError as e:
            # Store it as failed so the result loop tells Orderly why.
            id_ = db.enqueue(m["to"], m["text"], "transactional", None, orderly_id=m["id"])
            db.mark(id_, "failed", str(e))
            continue
        db.enqueue(number, m["text"], "transactional", None, orderly_id=m["id"])
        n += 1
    return n


def report_results(client: httpx.Client) -> int:
    n = 0
    for row in db.orderly_unreported():
        ok = row["status"] == "sent"
        r = client.post(
            "/api/sms/gateway/result",
            json={"id": row["orderly_id"], "ok": ok, "error": None if ok else (row["error"] or row["status"])},
        )
        # 409: Orderly no longer has it as "sending" (e.g. timed out there) — nothing to fix.
        if r.status_code != 409:
            r.raise_for_status()
        db.set_orderly_reported(row["id"])
        n += 1
    return n


def _iso(ts: float) -> str:
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).isoformat()


def forward_inbound(client: httpx.Client) -> int:
    n = 0
    for row in db.orderly_unforwarded():
        r = client.post(
            "/api/sms/gateway/inbound",
            # The receive time keeps the id unique even if sms.db is ever recreated.
            json={
                "id": "%d-%d" % (row["id"], int(row["received_at"])),
                "from": row["sender"],
                "text": row["text"],
                "date": _iso(row["received_at"]),
            },
        )
        r.raise_for_status()
        db.set_orderly_ok(row["id"])
        n += 1
    return n


def tick(client: Optional[httpx.Client] = None) -> None:
    own = client is None
    client = client or _client()
    try:
        # Each step on its own: Orderly being down for one call mustn't block the rest.
        for step in (report_results, forward_inbound, claim):
            try:
                step(client)
            except Exception as e:  # noqa: BLE001
                print("orderly %s failed: %s" % (step.__name__, e))
    finally:
        if own:
            client.close()


def _loop() -> None:
    while True:
        tick()
        time.sleep(config.ORDERLY_POLL_SEC)


def enabled() -> bool:
    return bool(config.ORDERLY_URL and config.ORDERLY_TOKEN)
