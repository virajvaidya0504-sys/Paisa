"""SQLite access: one file, plain `sqlite3`, no ORM.

Money is stored as integer paise (1 rupee = 100 paise) so sums are exact.
The API converts to/from rupees at the edge (see `to_api`).
"""
import os
import sqlite3
from pathlib import Path

# The database lives next to the code unless PAISA_DB points elsewhere
# (the tests use that to get a throwaway database).
DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "paisa.db"


def db_path() -> Path:
    return Path(os.environ.get("PAISA_DB", DEFAULT_DB))


SCHEMA = """
CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#6366f1'
);

CREATE TABLE IF NOT EXISTS transactions (
    id             INTEGER PRIMARY KEY,
    date_time      TEXT NOT NULL,                       -- ISO 8601, local time: 2025-03-14T19:30:00
    amount         INTEGER NOT NULL CHECK (amount > 0), -- paise, always positive; `type` gives the sign
    type           TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
    payee          TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'other'
                   CHECK (payment_method IN ('upi', 'card', 'cash', 'bank_transfer', 'other')),
    tag_id         INTEGER REFERENCES tags(id) ON DELETE SET NULL,  -- NULL = untagged
    note           TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'pending')),
    upi_id         TEXT,                                -- set for Pay-screen transactions
    import_hash    TEXT UNIQUE,                         -- duplicate detection for CSV imports
    created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date  ON transactions(date_time);
CREATE INDEX IF NOT EXISTS idx_tx_tag   ON transactions(tag_id);
CREATE INDEX IF NOT EXISTS idx_tx_payee ON transactions(payee);

-- "if payee contains <pattern>, tag as <tag>"; higher priority wins.
CREATE TABLE IF NOT EXISTS tag_rules (
    id       INTEGER PRIMARY KEY,
    pattern  TEXT NOT NULL COLLATE NOCASE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 0
);

-- One optional monthly limit per tag.
CREATE TABLE IF NOT EXISTS budgets (
    id            INTEGER PRIMARY KEY,
    tag_id        INTEGER NOT NULL UNIQUE REFERENCES tags(id) ON DELETE CASCADE,
    monthly_limit INTEGER NOT NULL CHECK (monthly_limit > 0)  -- paise
);

-- Small key/value store, e.g. "seeded" so sample data is only added once.
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def get_conn():
    """FastAPI dependency: one connection per request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


# ---- paise <-> rupees -------------------------------------------------------

def to_paise(rupees: float) -> int:
    return int(round(float(rupees) * 100))


def to_api(row: sqlite3.Row) -> dict:
    """Row -> dict with money fields converted to rupees."""
    d = dict(row)
    for key in ("amount", "monthly_limit"):
        if key in d and d[key] is not None:
            d[key] = d[key] / 100
    d.pop("import_hash", None)
    return d
