"""Transactions: list with filters, create, edit, delete, CSV export."""
import csv
import io
import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from ..autotag import tag_for_payee
from ..db import get_conn, to_api, to_paise
from ..filters import Filters, filter_params
from ..models import TransactionIn
from .tags import require_tag

router = APIRouter(tags=["transactions"])

SELECT = ("SELECT t.*, g.name AS tag_name, g.color AS tag_color FROM transactions t "
          "LEFT JOIN tags g ON g.id = t.tag_id ")


def _get(conn: sqlite3.Connection, tx_id: int) -> dict:
    row = conn.execute(SELECT + "WHERE t.id = ?", (tx_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Transaction not found")
    return to_api(row)


def _values(conn: sqlite3.Connection, body: TransactionIn) -> tuple:
    """Validate the body and turn it into the column values we store."""
    require_tag(conn, body.tag_id)
    when = (body.date_time or datetime.now()).replace(tzinfo=None, microsecond=0)
    # No tag chosen -> let the auto-tag rules try. A tag you pick is never overridden.
    tag_id = body.tag_id if body.tag_id is not None else tag_for_payee(conn, body.payee)
    return (when.isoformat(timespec="seconds"), to_paise(body.amount), body.type, body.payee,
            body.payment_method, tag_id, body.note, body.status, body.upi_id)


@router.get("/transactions")
def list_transactions(
    f: Filters = Depends(filter_params),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_conn),
):
    where, params = f.where()
    total = conn.execute(f"SELECT COUNT(*) FROM transactions t {where}", params).fetchone()[0]
    rows = conn.execute(
        SELECT + where + " ORDER BY t.date_time DESC, t.id DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    ).fetchall()
    return {"total": total, "items": [to_api(r) for r in rows]}


def _safe(text: str) -> str:
    """Stop spreadsheets treating text like '=SUM(...)' as a formula."""
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


@router.get("/transactions/export.csv")
def export_csv(f: Filters = Depends(filter_params), conn: sqlite3.Connection = Depends(get_conn)):
    """Everything matching the current filters, as a CSV download."""
    where, params = f.where()
    rows = conn.execute(SELECT + where + " ORDER BY t.date_time DESC, t.id DESC", params).fetchall()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["date_time", "type", "amount", "payee", "payment_method", "tag", "status", "note"])
    for r in rows:
        w.writerow([r["date_time"], r["type"], f"{r['amount'] / 100:.2f}", _safe(r["payee"]),
                    r["payment_method"], r["tag_name"] or "", r["status"], _safe(r["note"])])
    return Response(
        "﻿" + out.getvalue(),  # BOM so Excel reads ₹ and other text as UTF-8
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="paisa-transactions.csv"'},
    )


@router.get("/transactions/{tx_id}")
def get_transaction(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    return _get(conn, tx_id)


@router.post("/transactions", status_code=201)
def create_transaction(body: TransactionIn, conn: sqlite3.Connection = Depends(get_conn)):
    cur = conn.execute(
        "INSERT INTO transactions (date_time, amount, type, payee, payment_method, tag_id, note,"
        " status, upi_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", _values(conn, body))
    conn.commit()
    return _get(conn, cur.lastrowid)


@router.put("/transactions/{tx_id}")
def update_transaction(tx_id: int, body: TransactionIn, conn: sqlite3.Connection = Depends(get_conn)):
    _get(conn, tx_id)
    conn.execute(
        "UPDATE transactions SET date_time = ?, amount = ?, type = ?, payee = ?, payment_method = ?,"
        " tag_id = ?, note = ?, status = ?, upi_id = ? WHERE id = ?", (*_values(conn, body), tx_id))
    conn.commit()
    return _get(conn, tx_id)


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    if conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,)).rowcount == 0:
        raise HTTPException(404, "Transaction not found")
    conn.commit()
