import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

from . import config

_lock = threading.Lock()
_conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row

_conn.executescript(
    """
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_number TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transactional',
  status TEXT NOT NULL DEFAULT 'queued',   -- queued|sent|failed|skipped
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL,
  send_after REAL NOT NULL,
  sent_at REAL
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, send_after);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  received_at REAL NOT NULL,
  modem_date TEXT,
  webhook_ok INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS optouts (
  number TEXT PRIMARY KEY,
  created_at REAL NOT NULL
);
"""
)


def _add_column(table: str, ddl: str) -> None:
    name = ddl.split()[0]
    if name not in {r[1] for r in _conn.execute("PRAGMA table_info(%s)" % table)}:
        _conn.execute("ALTER TABLE %s ADD COLUMN %s" % (table, ddl))


# Orderly bridge columns. orderly_id links a local row to Orderly's sms_outbox;
# *_reported / orderly_ok mean Orderly has acknowledged it (retried until then).
_add_column("outbox", "orderly_id TEXT")
_add_column("outbox", "orderly_reported INTEGER NOT NULL DEFAULT 0")
_add_column("inbox", "orderly_ok INTEGER NOT NULL DEFAULT 0")
_conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_orderly ON outbox(orderly_id)")
_conn.commit()


def _all(sql: str, args: tuple = ()) -> List[Dict[str, Any]]:
    with _lock:
        return [dict(r) for r in _conn.execute(sql, args).fetchall()]


def _exec(sql: str, args: tuple = ()) -> int:
    with _lock:
        cur = _conn.execute(sql, args)
        _conn.commit()
        return cur.lastrowid


def enqueue(
    to: str, text: str, kind: str, send_after: Optional[float], orderly_id: Optional[str] = None
) -> int:
    now = time.time()
    return _exec(
        "INSERT OR IGNORE INTO outbox(to_number,text,kind,created_at,send_after,orderly_id)"
        " VALUES(?,?,?,?,?,?)",
        (to, text, kind, now, send_after or now, orderly_id),
    )


def orderly_unreported() -> List[Dict[str, Any]]:
    """Orderly messages that reached a final state Orderly hasn't been told about."""
    return _all(
        "SELECT * FROM outbox WHERE orderly_id IS NOT NULL AND orderly_reported=0"
        " AND status IN ('sent','failed','skipped') ORDER BY id"
    )


def orderly_in_flight() -> int:
    return _all(
        "SELECT COUNT(*) c FROM outbox WHERE orderly_id IS NOT NULL AND status='queued'"
    )[0]["c"]


def set_orderly_reported(id_: int) -> None:
    _exec("UPDATE outbox SET orderly_reported=1 WHERE id=?", (id_,))


def orderly_unforwarded() -> List[Dict[str, Any]]:
    return _all("SELECT * FROM inbox WHERE orderly_ok=0 ORDER BY id LIMIT 50")


def set_orderly_ok(id_: int) -> None:
    _exec("UPDATE inbox SET orderly_ok=1 WHERE id=?", (id_,))


def next_due() -> Optional[Dict[str, Any]]:
    rows = _all(
        "SELECT * FROM outbox WHERE status='queued' AND send_after<=? ORDER BY id LIMIT 1",
        (time.time(),),
    )
    return rows[0] if rows else None


def mark(id_: int, status: str, error: Optional[str] = None, bump: bool = False) -> None:
    _exec(
        "UPDATE outbox SET status=?, error=?, attempts=attempts+?, sent_at=? WHERE id=?",
        (status, error, 1 if bump else 0, time.time() if status == "sent" else None, id_),
    )


def retry_later(id_: int, error: str, delay: float) -> None:
    _exec(
        "UPDATE outbox SET error=?, attempts=attempts+1, send_after=? WHERE id=?",
        (error, time.time() + delay, id_),
    )


def sent_today() -> int:
    midnight = time.time() - (time.time() % 86400)
    return _all(
        "SELECT COUNT(*) c FROM outbox WHERE status='sent' AND sent_at>=?", (midnight,)
    )[0]["c"]


def is_optout(number: str) -> bool:
    return bool(_all("SELECT 1 FROM optouts WHERE number=?", (number,)))


def add_optout(number: str) -> None:
    _exec("INSERT OR IGNORE INTO optouts(number,created_at) VALUES(?,?)", (number, time.time()))


def remove_optout(number: str) -> None:
    _exec("DELETE FROM optouts WHERE number=?", (number,))


def list_optouts() -> List[Dict[str, Any]]:
    return _all("SELECT * FROM optouts ORDER BY created_at DESC")


def add_inbound(sender: str, text: str, modem_date: str) -> int:
    return _exec(
        "INSERT INTO inbox(sender,text,received_at,modem_date) VALUES(?,?,?,?)",
        (sender, text, time.time(), modem_date),
    )


def set_webhook_ok(id_: int) -> None:
    _exec("UPDATE inbox SET webhook_ok=1 WHERE id=?", (id_,))


def list_outbox(limit: int, status: Optional[str]) -> List[Dict[str, Any]]:
    if status:
        return _all("SELECT * FROM outbox WHERE status=? ORDER BY id DESC LIMIT ?", (status, limit))
    return _all("SELECT * FROM outbox ORDER BY id DESC LIMIT ?", (limit,))


def list_inbox(limit: int) -> List[Dict[str, Any]]:
    return _all("SELECT * FROM inbox ORDER BY id DESC LIMIT ?", (limit,))
