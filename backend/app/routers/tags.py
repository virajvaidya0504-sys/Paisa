"""Tags (create, rename, recolor, delete) and auto-tag rules."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from ..autotag import load_rules, match_tag
from ..db import get_conn
from ..models import RuleIn, TagIn

router = APIRouter(tags=["tags"])


def _tag(conn: sqlite3.Connection, tag_id: int) -> dict:
    row = conn.execute(
        "SELECT g.id, g.name, g.color, COUNT(t.id) AS tx_count FROM tags g "
        "LEFT JOIN transactions t ON t.tag_id = g.id WHERE g.id = ? GROUP BY g.id", (tag_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Tag not found")
    return dict(row)


def require_tag(conn: sqlite3.Connection, tag_id: int | None) -> None:
    """400 if a tag id is given but does not exist."""
    if tag_id is not None and not conn.execute("SELECT 1 FROM tags WHERE id = ?", (tag_id,)).fetchone():
        raise HTTPException(400, f"Tag {tag_id} does not exist")


@router.get("/tags")
def list_tags(conn: sqlite3.Connection = Depends(get_conn)):
    rows = conn.execute(
        "SELECT g.id, g.name, g.color, COUNT(t.id) AS tx_count FROM tags g "
        "LEFT JOIN transactions t ON t.tag_id = g.id GROUP BY g.id ORDER BY g.name"
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/tags", status_code=201)
def create_tag(body: TagIn, conn: sqlite3.Connection = Depends(get_conn)):
    try:
        cur = conn.execute("INSERT INTO tags (name, color) VALUES (?, ?)", (body.name, body.color))
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"A tag named '{body.name}' already exists")
    conn.commit()
    return _tag(conn, cur.lastrowid)


@router.put("/tags/{tag_id}")
def update_tag(tag_id: int, body: TagIn, conn: sqlite3.Connection = Depends(get_conn)):
    _tag(conn, tag_id)
    try:
        conn.execute("UPDATE tags SET name = ?, color = ? WHERE id = ?", (body.name, body.color, tag_id))
    except sqlite3.IntegrityError:
        raise HTTPException(409, f"A tag named '{body.name}' already exists")
    conn.commit()
    return _tag(conn, tag_id)


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    """Transactions keep existing and become untagged; its rules and budget are removed."""
    _tag(conn, tag_id)
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.commit()


# ---- auto-tag rules ---------------------------------------------------------

RULE_SQL = ("SELECT r.id, r.pattern, r.tag_id, r.priority, g.name AS tag_name, g.color AS tag_color "
            "FROM tag_rules r JOIN tags g ON g.id = r.tag_id")


@router.get("/rules")
def list_rules(conn: sqlite3.Connection = Depends(get_conn)):
    return [dict(r) for r in conn.execute(RULE_SQL + " ORDER BY r.priority DESC, r.pattern")]


@router.post("/rules", status_code=201)
def create_rule(body: RuleIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_tag(conn, body.tag_id)
    cur = conn.execute("INSERT INTO tag_rules (pattern, tag_id, priority) VALUES (?, ?, ?)",
                       (body.pattern, body.tag_id, body.priority))
    conn.commit()
    return dict(conn.execute(RULE_SQL + " WHERE r.id = ?", (cur.lastrowid,)).fetchone())


@router.put("/rules/{rule_id}")
def update_rule(rule_id: int, body: RuleIn, conn: sqlite3.Connection = Depends(get_conn)):
    require_tag(conn, body.tag_id)
    cur = conn.execute("UPDATE tag_rules SET pattern = ?, tag_id = ?, priority = ? WHERE id = ?",
                       (body.pattern, body.tag_id, body.priority, rule_id))
    if cur.rowcount == 0:
        raise HTTPException(404, "Rule not found")
    conn.commit()
    return dict(conn.execute(RULE_SQL + " WHERE r.id = ?", (rule_id,)).fetchone())


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, conn: sqlite3.Connection = Depends(get_conn)):
    if conn.execute("DELETE FROM tag_rules WHERE id = ?", (rule_id,)).rowcount == 0:
        raise HTTPException(404, "Rule not found")
    conn.commit()


@router.post("/rules/apply")
def apply_rules(conn: sqlite3.Connection = Depends(get_conn)):
    """Run the rules over transactions that have no tag. Never changes a tag already set."""
    rules = load_rules(conn)
    untagged = conn.execute("SELECT id, payee FROM transactions WHERE tag_id IS NULL").fetchall()
    updates = [(tag, r["id"]) for r in untagged if (tag := match_tag(r["payee"], rules)) is not None]
    conn.executemany("UPDATE transactions SET tag_id = ? WHERE id = ?", updates)
    conn.commit()
    return {"tagged": len(updates), "still_untagged": len(untagged) - len(updates)}
