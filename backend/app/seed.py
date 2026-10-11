"""Sample data so every dashboard has something to show on first run.

Deterministic (fixed random seed) and relative to today, so the last six
months always look "current". Runs once; the `meta` table remembers it.
"""
import random
import sqlite3
from datetime import datetime, timedelta

from .autotag import tag_for_payee
from .db import to_paise

TAGS = {
    "Food": "#f97316", "Groceries": "#22c55e", "Transport": "#0ea5e9",
    "Bills": "#eab308", "Shopping": "#ec4899", "Entertainment": "#a855f7",
    "Health": "#ef4444", "Business": "#14b8a6", "Personal": "#6366f1",
    "Income": "#16a34a",
}

# pattern -> tag. These become real auto-tag rules, so new payees containing
# these words get tagged automatically too.
RULES = {
    "swiggy": "Food", "zomato": "Food", "starbucks": "Food", "domino": "Food",
    "bigbasket": "Groceries", "blinkit": "Groceries", "dmart": "Groceries",
    "uber": "Transport", "ola": "Transport", "metro": "Transport", "irctc": "Transport",
    "electricity": "Bills", "airtel": "Bills", "jio": "Bills", "broadband": "Bills",
    "amazon": "Shopping", "flipkart": "Shopping", "myntra": "Shopping",
    "netflix": "Entertainment", "bookmyshow": "Entertainment", "spotify": "Entertainment",
    "apollo": "Health", "pharmeasy": "Health", "cult.fit": "Health",
    "aws": "Business", "godaddy": "Business",
}

# (payee, low rupees, high rupees, methods, weight)
SPEND = [
    ("Swiggy", 150, 650, ["upi", "card"], 14), ("Zomato", 180, 700, ["upi", "card"], 10),
    ("Starbucks", 250, 600, ["card", "upi"], 4), ("Domino's Pizza", 300, 900, ["card", "upi"], 3),
    ("Chai Point", 40, 180, ["upi", "cash"], 6),
    ("BigBasket", 600, 2800, ["upi", "card"], 7), ("Blinkit", 200, 900, ["upi"], 9),
    ("DMart", 900, 3500, ["card", "upi"], 3),
    ("Uber", 120, 650, ["upi", "card"], 10), ("Ola", 90, 450, ["upi"], 4),
    ("Delhi Metro", 30, 120, ["upi", "card"], 5), ("IRCTC", 400, 2600, ["upi", "card"], 2),
    ("Amazon", 300, 6500, ["card", "upi"], 7), ("Flipkart", 400, 4500, ["card", "upi"], 4),
    ("Myntra", 600, 3500, ["card"], 2),
    ("Netflix", 199, 649, ["card"], 1), ("BookMyShow", 400, 1400, ["upi", "card"], 2),
    ("Apollo Pharmacy", 150, 1800, ["upi", "cash"], 3), ("PharmEasy", 250, 1500, ["upi"], 1),
    ("Cult.fit", 1200, 3000, ["card"], 1),
    ("AWS", 800, 4200, ["card"], 1), ("GoDaddy", 700, 2200, ["card"], 1),
    ("Rohan (dinner split)", 300, 1500, ["upi"], 3), ("Mom", 1000, 5000, ["upi", "bank_transfer"], 1),
    # Payees no rule matches -> end up Untagged, to try the inbox with.
    ("Sharma General Store", 60, 400, ["cash", "upi"], 3),
    ("Shree Ganesh Traders", 200, 1800, ["upi"], 2),
    ("Raju Auto", 40, 220, ["cash"], 2),
]

# Bills and income that repeat every month: (payee, rupees, day, type, method)
MONTHLY = [
    ("Acme Technologies Salary", 85000, 1, "credit", "bank_transfer"),
    ("Landlord - Mr. Mehta (rent)", 22000, 3, "debit", "bank_transfer"),
    ("Electricity Board", 1650, 8, "debit", "upi"),
    ("Airtel Broadband", 999, 10, "debit", "upi"),
    ("Jio Recharge", 299, 12, "debit", "upi"),
]
MONTHLY_TAG = {"Acme Technologies Salary": "Income", "Landlord - Mr. Mehta (rent)": "Bills"}

DAYS_BACK = 180


def seed(conn: sqlite3.Connection, today: datetime | None = None) -> int:
    """Insert tags, rules and sample transactions once. Returns rows added."""
    if conn.execute("SELECT 1 FROM meta WHERE key = 'seeded'").fetchone():
        return 0

    rng = random.Random(7)
    today = today or datetime.now().replace(microsecond=0)

    tag_ids = {}
    for name, color in TAGS.items():
        cur = conn.execute("INSERT INTO tags (name, color) VALUES (?, ?)", (name, color))
        tag_ids[name] = cur.lastrowid
    for pattern, tag in RULES.items():
        conn.execute("INSERT INTO tag_rules (pattern, tag_id) VALUES (?, ?)", (pattern, tag_ids[tag]))

    rows = []  # (date_time, rupees, type, payee, method, tag_id, note, status)

    def add(when, rupees, kind, payee, method, note="", status="completed"):
        # Explicit tag first (monthly items), otherwise let the rules decide.
        tag = tag_ids[MONTHLY_TAG[payee]] if payee in MONTHLY_TAG else tag_for_payee(conn, payee)
        rows.append((when.isoformat(timespec="seconds"), rupees, kind, payee, method, tag, note, status))

    start = today - timedelta(days=DAYS_BACK)

    # Monthly items, for each month that falls in the window.
    month = start.replace(day=1, hour=0, minute=0, second=0)
    while month <= today:
        for payee, rupees, day, kind, method in MONTHLY:
            when = month.replace(day=day, hour=9, minute=rng.randint(0, 59))
            if start <= when <= today:
                add(when, rupees, kind, payee, method)
        month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)

    # Everyday spending, weighted so food/transport dominate.
    weights = [s[4] for s in SPEND]
    for _ in range(165):
        payee, lo, hi, methods, _w = rng.choices(SPEND, weights)[0]
        when = start + timedelta(days=rng.randint(0, DAYS_BACK), hours=rng.randint(8, 22),
                                 minutes=rng.randint(0, 59))
        if when > today:
            when = today - timedelta(hours=rng.randint(1, 48))
        amount = round(rng.uniform(lo, hi) / (10 if hi > 1000 else 1)) * (10 if hi > 1000 else 1)
        add(when, max(amount, 10), "debit", payee, rng.choice(methods))

    # A few credits: refunds, friends paying back, freelance income.
    for payee, lo, hi, tag in [("Amazon refund", 300, 2500, None), ("Rohan", 300, 1500, None),
                               ("Freelance - Kapoor Design", 8000, 25000, "Business")]:
        for _ in range(3):
            when = start + timedelta(days=rng.randint(5, DAYS_BACK - 1), hours=rng.randint(9, 20))
            add(when, round(rng.uniform(lo, hi)), "credit", payee, "bank_transfer" if tag else "upi")
            if tag:
                rows[-1] = rows[-1][:5] + (tag_ids[tag],) + rows[-1][6:]

    # Two recent payments still waiting for confirmation.
    add(today - timedelta(hours=3), 450, "debit", "Swiggy", "upi", "waiting for UPI app", "pending")
    add(today - timedelta(days=1), 1200, "debit", "Raju Auto", "upi", "", "pending")

    conn.executemany(
        "INSERT INTO transactions (date_time, amount, type, payee, payment_method, tag_id, note, status)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(r[0], to_paise(r[1]), *r[2:]) for r in rows],
    )

    # Starter budgets so the Budgets screen has progress bars.
    for tag, limit in {"Food": 6000, "Groceries": 8000, "Transport": 3000, "Shopping": 5000,
                       "Entertainment": 1500}.items():
        conn.execute("INSERT INTO budgets (tag_id, monthly_limit) VALUES (?, ?)",
                     (tag_ids[tag], to_paise(limit)))

    conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
    conn.commit()
    return len(rows)
