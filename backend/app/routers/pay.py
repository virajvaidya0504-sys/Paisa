"""Pay screen: save a pending transaction, hand off to a UPI app, confirm afterwards.

Nothing here moves money. A upi://pay link only does something on a phone with a UPI app;
on a computer the screen shows the link and a QR code to scan with your phone.
"""
import re
import sqlite3
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from ..autotag import tag_for_payee
from ..db import get_conn, to_api, to_paise
from .tags import require_tag

router = APIRouter(prefix="/pay", tags=["pay"])

UPI_ID = re.compile(r"^[A-Za-z0-9._\-]{1,256}@[A-Za-z][A-Za-z0-9]{1,63}$")


def upi_link(upi_id: str, name: str, rupees: float, note: str = "") -> str:
    """Build the standard UPI deep link. Values are percent-encoded (spaces as %20)."""
    params = {"pa": upi_id, "pn": name or upi_id, "am": f"{rupees:.2f}", "cu": "INR"}
    if note:
        params["tn"] = note
    return "upi://pay?" + "&".join(f"{k}={quote(str(v), safe='@.')}" for k, v in params.items())


class PayIn(BaseModel):
    upi_id: str
    amount: float = Field(gt=0, le=1_00_00_000)
    payee_name: str = Field(default="", max_length=120)
    tag_id: int | None = None
    note: str = Field(default="", max_length=80)

    @field_validator("upi_id")
    @classmethod
    def valid_upi(cls, v: str) -> str:
        v = v.strip()
        if not UPI_ID.match(v):
            raise ValueError("That doesn't look like a UPI ID (expected name@bank)")
        return v


def _pending(conn: sqlite3.Connection, tx_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Transaction not found")
    if row["status"] != "pending":
        raise HTTPException(409, "This transaction is not pending")
    return row


@router.post("", status_code=201)
def start_payment(body: PayIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_tag(conn, body.tag_id)
    payee = body.payee_name.strip() or body.upi_id
    tag_id = body.tag_id if body.tag_id is not None else tag_for_payee(conn, payee)
    cur = conn.execute(
        "INSERT INTO transactions (date_time, amount, type, payee, payment_method, tag_id, note, status, upi_id)"
        " VALUES (datetime('now', 'localtime'), ?, 'debit', ?, 'upi', ?, ?, 'pending', ?)",
        (to_paise(body.amount), payee, tag_id, body.note, body.upi_id))
    conn.commit()
    row = conn.execute("SELECT t.*, g.name AS tag_name, g.color AS tag_color FROM transactions t "
                       "LEFT JOIN tags g ON g.id = t.tag_id WHERE t.id = ?", (cur.lastrowid,)).fetchone()
    return {"transaction": to_api(row), "link": upi_link(body.upi_id, payee, body.amount, body.note)}


@router.get("/{tx_id}/link")
def link_for(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    """The link for a pending payment, so you can show the QR code again."""
    row = _pending(conn, tx_id)
    if not row["upi_id"]:
        raise HTTPException(400, "This pending transaction has no UPI ID")
    return {"link": upi_link(row["upi_id"], row["payee"], row["amount"] / 100, row["note"])}


@router.post("/{tx_id}/confirm")
def confirm(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    """"Yes, it went through": the payment becomes a normal completed transaction."""
    _pending(conn, tx_id)
    conn.execute("UPDATE transactions SET status = 'completed' WHERE id = ?", (tx_id,))
    conn.commit()
    return {"ok": True}


@router.post("/{tx_id}/cancel")
def cancel(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    """"No, it didn't": the pending record is removed so it never counts as spend."""
    _pending(conn, tx_id)
    conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    return {"ok": True}
