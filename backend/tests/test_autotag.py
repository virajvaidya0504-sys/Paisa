"""Auto-tag logic and the seed data it feeds."""
from app.autotag import match_tag, tag_for_payee
from app.seed import seed


def test_contains_match_ignores_case():
    assert match_tag("SWIGGY INSTAMART", [("swiggy", 1)]) == 1


def test_first_rule_wins():
    # Rules arrive best-first, so the earlier one decides.
    assert match_tag("Amazon Prime", [("prime", 2), ("amazon", 1)]) == 2


def test_no_match_and_blank_pattern():
    assert match_tag("Local chai stall", [("swiggy", 1)]) is None
    assert match_tag("anything", [("  ", 1)]) is None  # blank must not match everything


def test_priority_orders_rules(conn):
    conn.execute("INSERT INTO tags (id, name) VALUES (1, 'Food'), (2, 'Shopping')")
    conn.execute("INSERT INTO tag_rules (pattern, tag_id, priority) VALUES ('amazon', 2, 0), ('amazon fresh', 1, 5)")
    assert tag_for_payee(conn, "Amazon Fresh") == 1  # higher priority beats the general rule
    assert tag_for_payee(conn, "Amazon") == 2


def test_seed_runs_once_and_is_realistic(conn):
    added = seed(conn)
    assert 190 <= added <= 230
    assert seed(conn) == 0  # second call does nothing
    count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    assert count == added
    untagged = conn.execute("SELECT COUNT(*) FROM transactions WHERE tag_id IS NULL").fetchone()[0]
    assert 0 < untagged < count  # some for the inbox, but most are tagged by rules
