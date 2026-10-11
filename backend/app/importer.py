"""CSV statement import: read any bank's file, map its columns, skip duplicates.

No FastAPI in here, so the logic is easy to test. The flow is:
  decode -> read_table (find header row) -> guess_mapping (user can change it)
  -> analyze (parse every row, flag new / duplicate / invalid) -> insert the new ones.
"""
import csv
import io
import re
import sqlite3
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel

from .autotag import load_rules, match_tag
from .models import PaymentMethod

MAX_BYTES = 5_000_000
MAX_ROWS = 20_000


class ImportMapping(BaseModel):
    """Which CSV column means what. Column values are header names from the file."""
    date: str
    date_format: str = "auto"  # "auto" tries the common Indian formats, day first
    # signed: one amount column, negative = money out.  typed: amount + a Dr/Cr column.
    # split: separate debit and credit columns.
    amount_mode: Literal["signed", "typed", "split"] = "signed"
    amount: str | None = None
    debit: str | None = None
    credit: str | None = None
    type: str | None = None
    payee: str
    method: str | None = None
    note: str | None = None
    default_method: PaymentMethod = "bank_transfer"
    invert_sign: bool = False  # credit-card statements list purchases as positive
    clean_payee: bool = True   # turn "UPI/DR/123/SWIGGY/..." into "Swiggy"


# ---- reading the file -------------------------------------------------------

def decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")  # older Excel exports


def read_table(text: str) -> tuple[list[str], list[list[str]], str]:
    """Return (headers, data rows, delimiter). Skips the account-details lines many
    banks put above the real header, by looking for the first row that is as wide
    as the typical data row."""
    sample = text[:4096]
    try:
        delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        delim = ","
    rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text), delimiter=delim)]
    rows = [r for r in rows if sum(1 for c in r if c) >= 2]
    if not rows:
        return [], [], delim
    widths = Counter(sum(1 for c in r if c) for r in rows)
    typical = widths.most_common(1)[0][0]
    start = next((i for i, r in enumerate(rows) if sum(1 for c in r if c) >= 0.7 * typical), 0)
    headers = [h or f"Column {i + 1}" for i, h in enumerate(rows[start])]
    seen: Counter = Counter()  # make repeated header names unique
    for i, h in enumerate(headers):
        seen[h] += 1
        if seen[h] > 1:
            headers[i] = f"{h} ({seen[h]})"
    return headers, rows[start + 1:], delim


# ---- guessing the mapping ---------------------------------------------------

def _tokens(header: str) -> set[str]:
    return set(re.split(r"[^a-z0-9]+", header.lower())) - {""}


def _find(headers: list[str], exact: set[str], contains: tuple[str, ...] = ()) -> str | None:
    """First header whose words include one of `exact` or whose text has one of `contains`."""
    for h in headers:
        if _tokens(h) & exact or any(c in h.lower() for c in contains):
            return h
    return None


def guess_mapping(headers: list[str]) -> dict:
    date = (_find([h for h in headers if "value" not in h.lower()], {"date", "dt"}, ("date",))
            or _find(headers, {"date", "dt"}, ("date",)))
    payee = _find(headers, {"payee", "merchant", "name", "remarks"},
                  ("narration", "description", "particulars", "details"))
    # A single "Dr/Cr" column holds the direction of each row; it is not a debit or credit amount.
    combined = [h for h in headers if {"dr", "cr"} <= _tokens(h)]
    split_cols = [h for h in headers if h not in combined]
    debit = _find(split_cols, {"debit", "dr", "withdrawal", "withdrawals"}, ("withdrawal", "debit"))
    credit = _find(split_cols, {"credit", "cr", "deposit", "deposits"}, ("deposit", "credit"))
    amount = _find([h for h in headers if h not in (debit, credit)], {"amount", "amt"}, ("amount",))
    type_col = combined[0] if combined else _find(headers, {"type"})
    method = _find(headers, {"mode", "method", "channel"})
    note = _find([h for h in headers if h != payee], {"note", "notes", "memo", "reference", "ref"}, ())
    if debit and credit:
        mode = "split"
    elif amount and type_col:
        mode = "typed"
    else:
        mode = "signed"
    return {"date": date, "payee": payee, "amount_mode": mode, "amount": amount, "debit": debit,
            "credit": credit, "type": type_col, "method": method, "note": note}


# ---- parsing single values --------------------------------------------------

DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y", "%d-%b-%Y", "%d %b %Y",
    "%d-%b-%y", "%d %b %y", "%d %B %Y", "%b %d, %Y",
    "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%d-%b-%Y %H:%M:%S", "%d %b %Y %H:%M",
    "%m/%d/%Y",  # US order last: day-first wins when a date fits both
]


def parse_date(raw: str, fmt: str = "auto") -> datetime | None:
    s = raw.strip()
    for f in ([fmt] if fmt != "auto" else DATE_FORMATS):
        try:
            return datetime.strptime(s, f)
        except ValueError:
            continue
    return None


def parse_amount(raw: str) -> tuple[Decimal, bool, str | None] | None:
    """Return (absolute value, was_negative, dr/cr hint) or None if it isn't a number.
    Handles ₹, Rs, commas (also lakh style 1,23,456), (500) and 500-, and a trailing Dr/Cr."""
    s = raw.strip()
    if not s:
        return None
    hint = None
    m = re.search(r"\b(cr|dr)\.?$", s, re.I)
    if m:
        hint = "credit" if m.group(1).lower() == "cr" else "debit"
        s = s[:m.start()].strip()
    negative = (s.startswith("(") and s.endswith(")")) or s.startswith("-") or s.endswith("-")
    s = re.sub(r"(?i)\b(rs|inr)\b\.?", "", s)  # "Rs. 99": drop the label and its dot
    digits = re.sub(r"[^\d.]", "", s).strip(".")
    try:
        value = Decimal(digits)
    except InvalidOperation:
        return None
    return value, negative, hint


DEBIT_WORDS = {"dr", "debit", "withdrawal", "w", "d", "paid", "sent", "out", "purchase", "sale"}
CREDIT_WORDS = {"cr", "credit", "deposit", "c", "received", "in", "refund", "payment received"}


def parse_type(raw: str) -> str | None:
    s = raw.strip().lower().rstrip(".")
    if s in DEBIT_WORDS:
        return "debit"
    if s in CREDIT_WORDS:
        return "credit"
    return None


def guess_method(text: str, fallback: str) -> str:
    t = text.lower()
    if "upi" in t:
        return "upi"
    if any(w in t for w in ("neft", "imps", "rtgs", "transfer", "bank")):
        return "bank_transfer"
    if any(w in t for w in ("card", "pos ", "visa", "master", "rupay")):
        return "card"
    if any(w in t for w in ("cash", "atm")):
        return "cash"
    return fallback


def clean_payee(narration: str) -> str:
    """Pull the merchant out of UPI narrations; tidy ALL CAPS. Anything else is left alone."""
    s = re.sub(r"\b\d{4}[Xx*]+\d{4}\b", "", narration)  # masked card number: 4567XXXXXXXX1234
    s = re.sub(r"^\s*(POS|ECOM)\b", "", s, flags=re.I)  # card-terminal prefixes
    s = re.sub(r"\s+", " ", s).strip()
    parts = re.split(r"[/-]", s)
    if re.match(r"^UPI[/-]", s, re.I):
        # UPI/DR/412345678901/SWIGGY/okaxis/...  or  UPI-SWIGGY-swiggy@axis-AXIS...
        if len(parts) > 3 and parts[1].upper() in ("DR", "CR") and parts[3].strip():
            s = parts[3].strip()
        elif len(parts) > 1 and parts[1].strip():
            s = parts[1].strip()
    return (s.title() if s.isupper() else s)[:120] or "Unknown"


# ---- analysing a whole file -------------------------------------------------

def _cell(row: list[str], headers: list[str], column: str | None) -> str:
    if not column or column not in headers:
        return ""
    i = headers.index(column)
    return row[i].strip() if i < len(row) else ""


def parse_row(row: list[str], headers: list[str], m: ImportMapping) -> dict:
    """One CSV row -> a transaction dict, or raises ValueError with a readable reason."""
    when = parse_date(_cell(row, headers, m.date), m.date_format)
    if not when:
        raise ValueError(f"Can't read the date '{_cell(row, headers, m.date)}'")

    if m.amount_mode == "split":
        out = parse_amount(_cell(row, headers, m.debit))
        inc = parse_amount(_cell(row, headers, m.credit))
        if out and out[0] > 0:
            value, kind = out[0], "debit"
        elif inc and inc[0] > 0:
            value, kind = inc[0], "credit"
        else:
            raise ValueError("No debit or credit amount")
    else:
        parsed = parse_amount(_cell(row, headers, m.amount))
        if not parsed:
            raise ValueError(f"Can't read the amount '{_cell(row, headers, m.amount)}'")
        value, negative, hint = parsed
        if m.amount_mode == "typed":
            kind = parse_type(_cell(row, headers, m.type)) or hint
            if not kind:
                raise ValueError(f"Can't tell debit from credit in '{_cell(row, headers, m.type)}'")
        else:
            kind = hint or ("debit" if negative else "credit")
            if m.invert_sign and not hint:
                kind = "credit" if kind == "debit" else "debit"
    if value <= 0:
        raise ValueError("Amount is zero")

    raw_payee = _cell(row, headers, m.payee)
    payee = clean_payee(raw_payee) if m.clean_payee else (raw_payee[:120] or "Unknown")
    method_text = _cell(row, headers, m.method)
    return {
        "date_time": when.replace(microsecond=0).isoformat(timespec="seconds"),
        "paise": int((value * 100).to_integral_value()),
        "type": kind,
        "payee": payee,
        "payment_method": guess_method(method_text or raw_payee, m.default_method),
        "note": _cell(row, headers, m.note)[:500],
    }


def _key(t: dict) -> tuple:
    # Banks often give only a date, so a duplicate = same day, amount, direction and payee.
    return (t["date_time"][:10], t["paise"], t["type"], t["payee"].casefold())


def analyze(conn: sqlite3.Connection, headers: list[str], rows: list[list[str]],
            m: ImportMapping) -> list[dict]:
    """Parse every row and say whether it is new, a duplicate, or invalid.

    Duplicates are counted, not just detected: if you already have 1 transaction with a given
    day/amount/payee and the file has 2, one is a duplicate and one is new. Two genuine
    identical purchases in one file are both kept, and importing the same file twice adds nothing.
    """
    results, parsed = [], []
    for line, row in enumerate(rows, start=1):
        try:
            tx = parse_row(row, headers, m)
            results.append({"line": line, "status": "new", "reason": "", "tx": tx})
            parsed.append(tx)
        except ValueError as e:
            results.append({"line": line, "status": "invalid", "reason": str(e), "tx": None})

    existing: Counter = Counter()
    if parsed:
        lo, hi = min(t["date_time"][:10] for t in parsed), max(t["date_time"][:10] for t in parsed)
        for r in conn.execute("SELECT date_time, amount, type, payee FROM transactions "
                              "WHERE substr(date_time, 1, 10) BETWEEN ? AND ?", (lo, hi)):
            existing[(r["date_time"][:10], r["amount"], r["type"], r["payee"].casefold())] += 1

    seen: Counter = Counter()
    for res in results:
        if res["tx"]:
            k = _key(res["tx"])
            seen[k] += 1
            if seen[k] <= existing[k]:
                res["status"], res["reason"] = "duplicate", "Already in Paisa"
    return results


def insert_new(conn: sqlite3.Connection, results: list[dict]) -> dict:
    """Insert the rows marked new; the auto-tag rules tag what they can."""
    rules = load_rules(conn)
    new = [r["tx"] for r in results if r["status"] == "new"]
    values = [(t["date_time"], t["paise"], t["type"], t["payee"], t["payment_method"],
               match_tag(t["payee"], rules), t["note"]) for t in new]
    conn.executemany(
        "INSERT INTO transactions (date_time, amount, type, payee, payment_method, tag_id, note)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)", values)
    conn.commit()
    return {"imported": len(new),
            "untagged": sum(1 for v in values if v[5] is None),
            "duplicates": sum(1 for r in results if r["status"] == "duplicate"),
            "invalid": sum(1 for r in results if r["status"] == "invalid")}
