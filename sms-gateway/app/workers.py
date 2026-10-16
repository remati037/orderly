import re
import threading
import time

import httpx

from . import config, db
from .modem import modem


def normalize(number: str) -> str:
    n = re.sub(r"[^\d+]", "", number)
    if n.startswith("00"):
        n = "+" + n[2:]
    elif n.startswith("0"):
        n = config.DEFAULT_COUNTRY_PREFIX + n[1:]
    elif not n.startswith("+"):
        n = "+" + n
    if not re.fullmatch(r"\+\d{8,15}", n):
        raise ValueError("invalid phone number: %r" % number)
    return n


def segments(text: str) -> int:
    """GSM-7 = 160/153 chars per part; any non-GSM char (č ć š ž đ, emoji) => UCS-2 = 70/67."""
    gsm = set(
        "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
        "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€"
    )
    single, multi = (160, 153) if all(c in gsm for c in text) else (70, 67)
    n = len(text)
    return 1 if n <= single else -(-n // multi)


def _sender_loop() -> None:
    while True:
        try:
            msg = db.next_due()
            if not msg:
                time.sleep(1)
                continue
            if msg["kind"] == "marketing" and db.is_optout(msg["to_number"]):
                db.mark(msg["id"], "skipped", "recipient opted out")
                continue
            if db.sent_today() >= config.DAILY_LIMIT:
                time.sleep(30)
                continue
            try:
                modem.send(msg["to_number"], msg["text"])
                db.mark(msg["id"], "sent", bump=True)
            except Exception as e:  # noqa: BLE001
                if msg["attempts"] + 1 >= config.MAX_ATTEMPTS:
                    db.mark(msg["id"], "failed", str(e), bump=True)
                else:
                    db.retry_later(msg["id"], str(e), delay=30 * (msg["attempts"] + 1))
            time.sleep(config.SEND_INTERVAL)
        except Exception as e:  # noqa: BLE001
            print("sender loop error:", e)
            time.sleep(5)


def _inbox_loop() -> None:
    while True:
        try:
            for m in modem.fetch_inbox():
                try:
                    sender = normalize(m["sender"])
                except ValueError:
                    sender = m["sender"]  # alphanumeric sender IDs (operator messages)
                row_id = db.add_inbound(sender, m["text"], m["date"])
                modem.delete(m["index"])  # only after it is safely stored
                if m["text"].strip().lower() in config.STOP_WORDS:
                    db.add_optout(sender)
                if config.WEBHOOK_URL:
                    try:
                        httpx.post(
                            config.WEBHOOK_URL,
                            json={"id": row_id, "from": sender, "text": m["text"], "date": m["date"]},
                            timeout=10,
                        ).raise_for_status()
                        db.set_webhook_ok(row_id)
                    except Exception as e:  # noqa: BLE001
                        print("webhook failed:", e)
        except Exception as e:  # noqa: BLE001
            print("inbox loop error:", e)
        time.sleep(config.INBOX_POLL_SEC)


def start() -> None:
    from . import orderly

    threading.Thread(target=_sender_loop, daemon=True).start()
    threading.Thread(target=_inbox_loop, daemon=True).start()
    if orderly.enabled():
        threading.Thread(target=orderly._loop, daemon=True).start()
