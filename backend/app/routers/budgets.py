"""Optional monthly budget per tag, with progress and a warning near the limit."""
import sqlite3
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import get_conn, to_paise
from .tags import require_tag

router = APIRouter(prefix="/budgets", tags=["budgets"])

WARN_AT = 0.8  # "close to the limit"


class BudgetIn(BaseModel):
    monthly_limit: float = Field(gt=0, le=10_00_00_000)


def level(spent: int, limit: int) -> str:
    if spent > limit:
        return "over"
    return "warning" if spent >= limit * WARN_AT else "ok"


@router.get("")
def list_budgets(month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
                 conn: sqlite3.Connection = Depends(get_conn)):
    """Each budget with what has been spent on that tag in `month` (default: this month).
    Only completed spending counts."""
    month = month or datetime.now().strftime("%Y-%m")
    rows = conn.execute(
        "SELECT g.id AS tag_id, g.name AS tag_name, g.color AS tag_color, b.monthly_limit AS lim,"
        " COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.tag_id = g.id AND t.type = 'debit'"
        "           AND t.status = 'completed' AND substr(t.date_time, 1, 7) = ?), 0) AS spent"
        " FROM budgets b JOIN tags g ON g.id = b.tag_id ORDER BY g.name", (month,)).fetchall()
    items = [{
        "tag_id": r["tag_id"], "tag_name": r["tag_name"], "tag_color": r["tag_color"],
        "limit": r["lim"] / 100, "spent": r["spent"] / 100, "remaining": (r["lim"] - r["spent"]) / 100,
        "percent": round(r["spent"] / r["lim"] * 100, 1), "level": level(r["spent"], r["lim"]),
    } for r in rows]
    return {"month": month, "items": items,
            "total_limit": sum(i["limit"] for i in items), "total_spent": sum(i["spent"] for i in items)}


@router.put("/{tag_id}")
def set_budget(tag_id: int, body: BudgetIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_tag(conn, tag_id)
    conn.execute("INSERT INTO budgets (tag_id, monthly_limit) VALUES (?, ?) "
                 "ON CONFLICT(tag_id) DO UPDATE SET monthly_limit = excluded.monthly_limit",
                 (tag_id, to_paise(body.monthly_limit)))
    conn.commit()
    return {"tag_id": tag_id, "monthly_limit": body.monthly_limit}


@router.delete("/{tag_id}", status_code=204)
def remove_budget(tag_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    if conn.execute("DELETE FROM budgets WHERE tag_id = ?", (tag_id,)).rowcount == 0:
        raise HTTPException(404, "No budget for this tag")
    conn.commit()
