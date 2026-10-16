"""Thin wrapper over the Huawei HiLink API (E3372h). MODEM_FAKE=1 swaps in a stub."""
import threading
from typing import Any, Dict, List

from . import config


class RealModem:
    def __init__(self) -> None:
        self._lock = threading.Lock()

    def _client(self):
        from huawei_lte_api.Client import Client
        from huawei_lte_api.Connection import Connection

        conn = Connection(config.MODEM_URL, timeout=15)
        return conn, Client(conn)

    def send(self, to: str, text: str) -> None:
        with self._lock:
            conn, client = self._client()
            try:
                ok = client.sms.send_sms([to], text)
                if ok != "OK":
                    raise RuntimeError("modem replied: %r" % (ok,))
            finally:
                conn.close()

    def fetch_inbox(self) -> List[Dict[str, Any]]:
        """Return inbox messages and delete them from the modem (keeps its small storage free)."""
        from huawei_lte_api.enums.sms import BoxTypeEnum

        with self._lock:
            conn, client = self._client()
            try:
                data = client.sms.get_sms_list(1, BoxTypeEnum.LOCAL_INBOX, 50, 0, 0, 1)
                msgs = (data.get("Messages") or {}).get("Message") or []
                if isinstance(msgs, dict):
                    msgs = [msgs]
                out = [
                    {
                        "index": m["Index"],
                        "sender": m.get("Phone", ""),
                        "text": m.get("Content") or "",
                        "date": m.get("Date", ""),
                    }
                    for m in msgs
                ]
                return out
            finally:
                conn.close()

    def delete(self, index: str) -> None:
        with self._lock:
            conn, client = self._client()
            try:
                client.sms.delete_sms([int(index)])
            finally:
                conn.close()

    def status(self) -> Dict[str, Any]:
        with self._lock:
            conn, client = self._client()
            try:
                sig = client.device.signal()
                net = client.net.current_plmn()
                return {
                    "connected": True,
                    "operator": net.get("FullName"),
                    "signal": {k: sig.get(k) for k in ("rssi", "rsrp", "sinr", "mode")},
                }
            finally:
                conn.close()


class FakeModem:
    """Records sends in memory; lets you inject inbound SMS via /debug/inject (fake mode only)."""

    def __init__(self) -> None:
        self.sent: List[Dict[str, str]] = []
        self._inbox: List[Dict[str, Any]] = []
        self._n = 0
        self._lock = threading.Lock()

    def send(self, to: str, text: str) -> None:
        self.sent.append({"to": to, "text": text})
        print("[fake modem] SMS -> %s: %s" % (to, text))

    def inject(self, sender: str, text: str) -> None:
        with self._lock:
            self._n += 1
            self._inbox.append(
                {"index": str(self._n), "sender": sender, "text": text, "date": "2026-10-06 12:00:00"}
            )

    def fetch_inbox(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._inbox)

    def delete(self, index: str) -> None:
        with self._lock:
            self._inbox = [m for m in self._inbox if m["index"] != index]

    def status(self) -> Dict[str, Any]:
        return {"connected": True, "operator": "FAKE", "signal": {}}


modem = FakeModem() if config.MODEM_FAKE else RealModem()
