"""Dashboard numbers. Every endpoint takes the same filters as the transaction list.

Only *completed* transactions count here: a pending payment has not happened yet.
"debit" is money spent, "credit" is money received.
"""
import sqlite3
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query

from ..db import get_conn
from ..filters import Filters, filter_params

router = APIRouter(prefix="/reports", tags=["reports"])


def _where(f: Filters) -> tuple[str, list]:
    where, params = f.where()
    return where + (" AND " if where else "WHERE ") + "t.status = 'completed'", params


@router.get("/summary")
def summary(f: Filters = Depends(filter_params), conn: sqlite3.Connection = Depends(get_conn)):
    """Total spent, received and net for the filtered period."""
    where, params = _where(f)
    row = conn.execute(
        "SELECT COALESCE(SUM(CASE WHEN t.type = 'debit'  THEN t.amount END), 0) AS spent,"
        "       COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount END), 0) AS received,"
        f"      COUNT(*) AS count FROM transactions t {where}", params).fetchone()
    return {"spent": row["spent"] / 100, "received": row["received"] / 100,
            "net": (row["received"] - row["spent"]) / 100, "count": row["count"]}


# What to group by: (label expression, colour expression, group-by expression)
GROUPS = {
    "tag": ("COALESCE(g.name, 'Untagged')", "COALESCE(g.color, '#94a3b8')", "t.tag_id"),
    "payee": ("t.payee", "'#6366f1'", "t.payee"),
    "method": ("t.payment_method", "'#6366f1'", "t.payment_method"),
}


@router.get("/breakdown")
def breakdown(
    by: Literal["tag", "payee", "method"],
    limit: int = Query(10, ge=1, le=100),
    f: Filters = Depends(filter_params),
    conn: sqlite3.Connection = Depends(get_conn),
):
    """Spend (or income, if you filter type=credit) split by tag, payee or payment method."""
    label, color, group = GROUPS[by]
    where, params = _where(f)
    rows = conn.execute(
        f"SELECT {label} AS label, {color} AS color, SUM(t.amount) AS total, COUNT(*) AS count "
        f"FROM transactions t LEFT JOIN tags g ON g.id = t.tag_id {where} AND t.type = ? "
        f"GROUP BY {group} ORDER BY total DESC LIMIT ?",
        [*params, f.type or "debit", limit]).fetchall()
    return [{"label": r["label"], "color": r["color"], "total": r["total"] / 100, "count": r["count"]}
            for r in rows]


BUCKET_LEN = {"day": 10, "month": 7, "year": 4}


def _next_period(period: str, granularity: str) -> str:
    if granularity == "year":
        return f"{int(period) + 1:04d}"
    if granularity == "month":
        y, m = int(period[:4]), int(period[5:7])
        return f"{y + (m == 12):04d}-{(m % 12) + 1:02d}"
    return (date.fromisoformat(period) + timedelta(days=1)).isoformat()


@router.get("/trend")
def trend(
    granularity: Literal["day", "month", "year"] = "month",
    f: Filters = Depends(filter_params),
    conn: sqlite3.Connection = Depends(get_conn),
):
    """Spent and received per day, month or year. Empty periods are included as zeros
    so charts and the calendar heatmap have no gaps."""
    n = BUCKET_LEN[granularity]
    where, params = _where(f)
    rows = conn.execute(
        f"SELECT substr(t.date_time, 1, {n}) AS period,"
        "  COALESCE(SUM(CASE WHEN t.type = 'debit'  THEN t.amount END), 0) AS spent,"
        "  COALESCE(SUM(CASE WHEN t.type = 'credit' THEN t.amount END), 0) AS received,"
        f" COUNT(*) AS count FROM transactions t {where} GROUP BY period ORDER BY period",
        params).fetchall()
    found = {r["period"]: r for r in rows}

    start = f.date_from[:n] if f.date_from else (rows[0]["period"] if rows else None)
    end = f.date_to[:n] if f.date_to else (rows[-1]["period"] if rows else None)
    out, period = [], start
    while period and end and period <= end and len(out) < 4000:
        r = found.get(period)
        out.append({"period": period, "spent": r["spent"] / 100 if r else 0,
                    "received": r["received"] / 100 if r else 0, "count": r["count"] if r else 0})
        period = _next_period(period, granularity)
    return out
