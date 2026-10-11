"""Auto-tag rules: "if payee contains X, tag as Y".

Kept free of FastAPI so it is easy to test and reuse from seeding and import.
"""
import sqlite3


def match_tag(payee: str, rules: list[tuple[str, int]]) -> int | None:
    """Return the tag id of the first matching rule, or None.

    `rules` is a list of (pattern, tag_id), already ordered best-first.
    Matching is a case-insensitive substring test; blank patterns never match.
    """
    text = payee.casefold()
    for pattern, tag_id in rules:
        pattern = pattern.strip().casefold()
        if pattern and pattern in text:
            return tag_id
    return None


def load_rules(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    """Rules ordered by priority (high first), then newest first."""
    rows = conn.execute(
        "SELECT pattern, tag_id FROM tag_rules ORDER BY priority DESC, id DESC"
    ).fetchall()
    return [(r["pattern"], r["tag_id"]) for r in rows]


def tag_for_payee(conn: sqlite3.Connection, payee: str) -> int | None:
    return match_tag(payee, load_rules(conn))
