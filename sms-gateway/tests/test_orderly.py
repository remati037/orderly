"""Bridge tests: a fake Orderly (httpx.MockTransport) and the fake modem."""
import importlib
import json
import os
import sys
import tempfile

import httpx
import pytest

os.environ["MODEM_FAKE"] = "1"


@pytest.fixture()
def gw(monkeypatch):
    monkeypatch.setenv("DB_PATH", os.path.join(tempfile.mkdtemp(), "sms.db"))
    for m in [m for m in sys.modules if m.startswith("app")]:
        del sys.modules[m]
    from app import config, db, orderly, workers  # fresh sqlite per test

    importlib.reload(config)
    return {"db": db, "orderly": orderly, "workers": workers, "config": config}


class FakeOrderly:
    def __init__(self, messages=None, result_status=200):
        self.messages = list(messages or [])
        self.results, self.inbound = [], []
        self.result_status = result_status
        self.down = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            return httpx.Response(503)
        assert request.headers["authorization"] == "Bearer tok"
        body = json.loads(request.content or b"{}")
        if request.url.path == "/api/sms/gateway/claim":
            out, self.messages = self.messages, []
            return httpx.Response(200, json={"messages": out})
        if request.url.path == "/api/sms/gateway/result":
            self.results.append(body)
            return httpx.Response(self.result_status, json={})
        if request.url.path == "/api/sms/gateway/inbound":
            self.inbound.append(body)
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(404)

    def client(self) -> httpx.Client:
        return httpx.Client(
            base_url="https://orderly.test",
            headers={"Authorization": "Bearer tok"},
            transport=httpx.MockTransport(self.handler),
        )


def send_due(db, workers):
    """One pass of the sender loop, without its sleeps."""
    from app.modem import modem

    while (msg := db.next_due()) is not None:
        modem.send(msg["to_number"], msg["text"])
        db.mark(msg["id"], "sent", bump=True)


def test_claimed_messages_are_queued_sent_and_reported(gw):
    db, orderly = gw["db"], gw["orderly"]
    fake = FakeOrderly([{"id": "u1", "to": "065 638 4599", "text": "Podsetnik"}])
    c = fake.client()

    assert orderly.claim(c) == 1
    row = db.list_outbox(10, None)[0]
    assert (row["to_number"], row["orderly_id"], row["status"]) == ("+381656384599", "u1", "queued")

    send_due(db, gw["workers"])
    assert orderly.report_results(c) == 1
    assert fake.results == [{"id": "u1", "ok": True, "error": None}]
    assert orderly.report_results(c) == 0  # reported once


def test_no_new_claims_while_orderly_messages_are_still_queued(gw):
    fake = FakeOrderly([{"id": "u1", "to": "0656384599", "text": "a"}])
    c = fake.client()
    gw["orderly"].claim(c)
    fake.messages = [{"id": "u2", "to": "0656384599", "text": "b"}]
    assert gw["orderly"].claim(c) == 0
    assert fake.messages  # left in Orderly, untouched


def test_invalid_number_is_reported_as_failed(gw):
    fake = FakeOrderly([{"id": "u1", "to": "abc", "text": "x"}])
    c = fake.client()
    assert gw["orderly"].claim(c) == 0
    gw["orderly"].report_results(c)
    assert fake.results[0]["id"] == "u1" and fake.results[0]["ok"] is False
    assert "invalid phone number" in fake.results[0]["error"]


def test_results_are_retried_until_orderly_answers(gw):
    db, orderly = gw["db"], gw["orderly"]
    fake = FakeOrderly([{"id": "u1", "to": "0656384599", "text": "x"}])
    c = fake.client()
    orderly.claim(c)
    send_due(db, gw["workers"])

    fake.down = True
    orderly.tick(c)  # must not raise
    assert fake.results == []
    fake.down = False
    orderly.tick(c)
    assert [r["id"] for r in fake.results] == ["u1"]


def test_conflict_on_result_counts_as_settled(gw):
    db, orderly = gw["db"], gw["orderly"]
    fake = FakeOrderly([{"id": "u1", "to": "0656384599", "text": "x"}], result_status=409)
    c = fake.client()
    orderly.claim(c)
    send_due(db, gw["workers"])
    assert orderly.report_results(c) == 1
    assert orderly.report_results(c) == 0


def test_inbound_is_forwarded_once_with_a_stable_id(gw):
    db, orderly = gw["db"], gw["orderly"]
    fake = FakeOrderly()
    c = fake.client()
    db.add_inbound("+381656384599", "STOP", "2026-10-16 12:00:00")

    fake.down = True
    orderly.tick(c)
    fake.down = False
    assert orderly.forward_inbound(c) == 1
    assert orderly.forward_inbound(c) == 0
    msg = fake.inbound[0]
    assert msg["from"] == "+381656384599" and msg["text"] == "STOP"
    assert msg["id"].startswith("1-") and msg["date"].endswith("+00:00")


def test_bridge_is_off_without_url_and_token(gw):
    assert gw["orderly"].enabled() is False
