"""Untagged inbox: tag a whole payee at once, and optionally remember it as a rule."""
import sqlite3

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..db import get_conn
from .tags import require_tag

router = APIRouter(prefix="/inbox", tags=["inbox"])


class InboxTag(BaseModel):
    payee: str = Field(min_length=1)
    tag_id: int
    remember: bool = False  # also create an auto-tag rule for this payee


@router.get("")
def inbox(conn: sqlite3.Connection = Depends(get_conn)):
    """Untagged transactions grouped by payee, biggest groups first."""
    rows = conn.execute(
        "SELECT MIN(payee) AS payee, COUNT(*) AS count,"
        " COALESCE(SUM(CASE WHEN type = 'debit'  THEN amount END), 0) AS spent,"
        " COALESCE(SUM(CASE WHEN type = 'credit' THEN amount END), 0) AS received,"
        " MAX(date_time) AS latest FROM transactions WHERE tag_id IS NULL"
        " GROUP BY payee COLLATE NOCASE ORDER BY count DESC, latest DESC LIMIT 300").fetchall()
    total = conn.execute("SELECT COUNT(*) FROM transactions WHERE tag_id IS NULL").fetchone()[0]
    return {"total": total, "groups": [
        {"payee": r["payee"], "count": r["count"], "spent": r["spent"] / 100,
         "received": r["received"] / 100, "latest": r["latest"]} for r in rows]}


@router.post("/tag")
def tag_payee(body: InboxTag, conn: sqlite3.Connection = Depends(get_conn)):
    require_tag(conn, body.tag_id)
    cur = conn.execute("UPDATE transactions SET tag_id = ? WHERE tag_id IS NULL AND payee = ? COLLATE NOCASE",
                       (body.tag_id, body.payee))
    rule_added = False
    if body.remember and not conn.execute(
            "SELECT 1 FROM tag_rules WHERE pattern = ? COLLATE NOCASE AND tag_id = ?",
            (body.payee, body.tag_id)).fetchone():
        conn.execute("INSERT INTO tag_rules (pattern, tag_id) VALUES (?, ?)", (body.payee, body.tag_id))
        rule_added = True
    conn.commit()
    return {"tagged": cur.rowcount, "rule_added": rule_added}
