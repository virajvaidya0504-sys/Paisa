"""One place that turns filter options into SQL, shared by the transaction
list, the CSV export and (later) the dashboards, so they always agree.

All values go in as `?` parameters, never into the SQL text.
"""
from dataclasses import dataclass

from fastapi import Query

from .db import to_paise


@dataclass
class Filters:
    date_from: str | None = None      # YYYY-MM-DD, inclusive
    date_to: str | None = None        # YYYY-MM-DD, inclusive
    tag_id: int | None = None
    untagged: bool = False
    payee: str | None = None          # substring match
    type: str | None = None
    payment_method: str | None = None
    status: str | None = None
    min_amount: float | None = None   # rupees
    max_amount: float | None = None
    q: str | None = None              # free-text search over payee and note

    def where(self) -> tuple[str, list]:
        """Return ("WHERE ...", params) using the alias `t` for transactions."""
        clauses, params = [], []
        if self.date_from:
            clauses.append("substr(t.date_time, 1, 10) >= ?")
            params.append(self.date_from)
        if self.date_to:
            clauses.append("substr(t.date_time, 1, 10) <= ?")
            params.append(self.date_to)
        if self.untagged:
            clauses.append("t.tag_id IS NULL")
        elif self.tag_id is not None:
            clauses.append("t.tag_id = ?")
            params.append(self.tag_id)
        if self.payee:
            clauses.append("t.payee LIKE ? ESCAPE '\\'")
            params.append(like(self.payee))
        if self.type:
            clauses.append("t.type = ?")
            params.append(self.type)
        if self.payment_method:
            clauses.append("t.payment_method = ?")
            params.append(self.payment_method)
        if self.status:
            clauses.append("t.status = ?")
            params.append(self.status)
        if self.min_amount is not None:
            clauses.append("t.amount >= ?")
            params.append(to_paise(self.min_amount))
        if self.max_amount is not None:
            clauses.append("t.amount <= ?")
            params.append(to_paise(self.max_amount))
        if self.q:
            clauses.append("(t.payee LIKE ? ESCAPE '\\' OR t.note LIKE ? ESCAPE '\\')")
            params += [like(self.q)] * 2
        return ("WHERE " + " AND ".join(clauses)) if clauses else "", params


def like(text: str) -> str:
    """Contains-match pattern with LIKE wildcards in the user's text escaped."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def filter_params(
    date_from: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    tag_id: int | None = None,
    untagged: bool = False,
    payee: str | None = None,
    type: str | None = Query(None, pattern="^(debit|credit)$"),
    payment_method: str | None = Query(None, pattern="^(upi|card|cash|bank_transfer|other)$"),
    status: str | None = Query(None, pattern="^(completed|pending)$"),
    min_amount: float | None = None,
    max_amount: float | None = None,
    q: str | None = None,
) -> Filters:
    """FastAPI dependency: read the filter query string into a Filters object."""
    return Filters(date_from, date_to, tag_id, untagged, payee, type, payment_method,
                   status, min_amount, max_amount, q)
