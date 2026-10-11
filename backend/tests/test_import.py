"""CSV parsing, column mapping, duplicate detection and the Untagged inbox."""
import json
from decimal import Decimal

from app.importer import clean_payee, guess_mapping, parse_amount, parse_date, parse_type, read_table

HDFC = (
    "Account Statement,,,,\n"
    "Customer: Test User,,,,\n"
    "Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
    "05/03/2025,UPI/DR/412345678901/SWIGGY/okaxis/Payment,450.00,,10000.00\n"
    "06/03/2025,UPI/DR/412345678902/SHARMA TEA STALL/ybl/Chai,40.00,,9960.00\n"
    "07/03/2025,NEFT-ACME LTD SALARY,,\"85,000.00\",94960.00\n"
    "08/03/2025,POS AMAZON,\"1,23,456.50\",,0\n"
)
MAPPING = {"date": "Date", "payee": "Narration", "amount_mode": "split",
           "debit": "Withdrawal Amt.", "credit": "Deposit Amt."}


def upload(client, path, text, mapping=None):
    files = {"file": ("s.csv", text.encode(), "text/csv")}
    data = {"mapping": json.dumps(mapping)} if mapping else None
    return client.post(f"/api/import/{path}", files=files, data=data)


# ---- pure parsing ----

def test_amounts():
    assert parse_amount("₹1,23,456.50") == (Decimal("123456.50"), False, None)
    assert parse_amount("(500.00)") == (Decimal("500.00"), True, None)
    assert parse_amount("-75") == (Decimal("75"), True, None)
    assert parse_amount("1,200.00 Dr") == (Decimal("1200.00"), False, "debit")
    assert parse_amount("Rs. 99 CR") == (Decimal("99"), False, "credit")
    assert parse_amount("abc") is None and parse_amount("") is None


def test_dates_day_first_by_default():
    assert parse_date("05/03/2025").month == 3          # 5 March, not 3 May
    assert parse_date("5-Mar-2025").day == 5
    assert parse_date("2025-03-05 14:30:00").hour == 14
    assert parse_date("31/12/25").year == 2025
    assert parse_date("nonsense") is None
    assert parse_date("03/05/2025", "%m/%d/%Y").month == 3  # explicit US format


def test_type_words():
    assert parse_type("DR") == "debit" and parse_type("Withdrawal") == "debit"
    assert parse_type("cr.") == "credit" and parse_type("???") is None


def test_clean_payee():
    assert clean_payee("UPI/DR/412345678901/SWIGGY/okaxis/Payment") == "Swiggy"
    assert clean_payee("UPI-ZOMATO-zomato@hdfcbank-HDFC-123") == "Zomato"
    assert clean_payee("POS 4567XXXXXXXX1234 AMAZON PAY") == "Amazon Pay"
    assert clean_payee("Amazon Pay India") == "Amazon Pay India"
    assert clean_payee("   ") == "Unknown"


def test_header_row_found_below_preamble_and_mapping_guessed():
    headers, rows, _ = read_table(HDFC)
    assert headers[0] == "Date" and len(rows) == 4
    g = guess_mapping(headers)
    assert (g["date"], g["payee"], g["amount_mode"]) == ("Date", "Narration", "split")
    assert (g["debit"], g["credit"]) == ("Withdrawal Amt.", "Deposit Amt.")


def test_guess_other_layouts():
    g = guess_mapping(["Txn Date", "Value Date", "Description", "Amount", "Dr/Cr"])
    assert g["date"] == "Txn Date" and g["amount_mode"] == "typed" and g["type"] == "Dr/Cr"
    g = guess_mapping(["Date", "Merchant", "Amount"])
    assert g["amount_mode"] == "signed" and g["payee"] == "Merchant"


# ---- through the API ----

def test_inspect(client):
    r = upload(client, "inspect", HDFC).json()
    assert r["row_count"] == 4 and r["guess"]["amount_mode"] == "split"


def test_preview_writes_nothing_then_commit_imports(client):
    before = client.get("/api/transactions", params={"limit": 1}).json()["total"]
    p = upload(client, "preview", HDFC, MAPPING).json()
    assert p["counts"] == {"new": 4, "duplicate": 0, "invalid": 0}
    assert client.get("/api/transactions", params={"limit": 1}).json()["total"] == before

    c = upload(client, "commit", HDFC, MAPPING).json()
    assert c["imported"] == 4 and c["duplicates"] == 0
    got = client.get("/api/transactions", params={"date_from": "2025-03-05", "date_to": "2025-03-08",
                                                   "limit": 50}).json()["items"]
    by_payee = {t["payee"]: t for t in got}
    assert by_payee["Swiggy"]["amount"] == 450 and by_payee["Swiggy"]["tag_name"] == "Food"  # rule applied
    assert by_payee["Sharma Tea Stall"]["tag_id"] is None                                     # -> inbox
    assert by_payee["Neft-Acme Ltd Salary"]["type"] == "credit"
    assert by_payee["Amazon"]["amount"] == 123456.5


def test_importing_same_file_twice_adds_nothing(client):
    upload(client, "commit", HDFC, MAPPING)
    again = upload(client, "commit", HDFC, MAPPING).json()
    assert again["imported"] == 0 and again["duplicates"] == 4


def test_identical_rows_in_one_file_are_both_kept_once(client):
    csv = "Date,Payee,Amount\n01/04/2025,Chai Point,-50\n01/04/2025,Chai Point,-50\n"
    m = {"date": "Date", "payee": "Payee", "amount": "Amount", "amount_mode": "signed"}
    assert upload(client, "commit", csv, m).json()["imported"] == 2   # two real cups of chai
    assert upload(client, "commit", csv, m).json()["imported"] == 0   # re-import: both are dupes
    three = csv + "01/04/2025,Chai Point,-50\n"
    r = upload(client, "commit", three, m).json()                     # a genuine third one appears
    assert r["imported"] == 1 and r["duplicates"] == 2


def test_duplicate_of_a_manually_added_transaction(client):
    client.post("/api/transactions", json={"amount": 50, "payee": "chai point",
                                           "date_time": "2025-04-01T09:00:00"})
    csv = "Date,Payee,Amount\n01/04/2025,Chai Point,-50\n"
    m = {"date": "Date", "payee": "Payee", "amount": "Amount", "amount_mode": "signed"}
    assert upload(client, "commit", csv, m).json()["duplicates"] == 1


def test_bad_rows_are_reported_not_fatal(client):
    csv = "Date,Payee,Amount\n01/04/2025,Good,-10\nnot a date,Bad,-10\n02/04/2025,Bad2,abc\n"
    m = {"date": "Date", "payee": "Payee", "amount": "Amount", "amount_mode": "signed"}
    p = upload(client, "preview", csv, m).json()
    assert p["counts"] == {"new": 1, "duplicate": 0, "invalid": 2}
    assert "date" in [r["reason"] for r in p["rows"] if r["status"] == "invalid"][0].lower()
    assert upload(client, "commit", csv, m).json()["imported"] == 1


def test_typed_and_inverted_modes(client):
    csv = "Date,Payee,Amount,Type\n01/05/2025,Shop,100,DR\n02/05/2025,Refund,40,CR\n"
    m = {"date": "Date", "payee": "Payee", "amount": "Amount", "type": "Type", "amount_mode": "typed"}
    upload(client, "commit", csv, m)
    got = {t["payee"]: t["type"] for t in client.get("/api/transactions", params={"date_from": "2025-05-01",
           "date_to": "2025-05-02"}).json()["items"]}
    assert got == {"Shop": "debit", "Refund": "credit"}
    card = "Date,Payee,Amount\n03/05/2025,Cafe,250\n"  # credit-card style: purchase is positive
    mm = {"date": "Date", "payee": "Payee", "amount": "Amount", "amount_mode": "signed", "invert_sign": True}
    upload(client, "commit", card, mm)
    assert client.get("/api/transactions", params={"payee": "Cafe"}).json()["items"][0]["type"] == "debit"


def test_mapping_errors(client):
    m = {"date": "Nope", "payee": "Payee", "amount": "Amount"}
    assert upload(client, "preview", "Date,Payee,Amount\n01/01/2025,A,1\n", m).status_code == 422
    assert upload(client, "preview", "Date,Payee,Amount\n01/01/2025,A,1\n",
                  {"date": "Date", "payee": "Payee", "amount_mode": "split"}).status_code == 422
    assert upload(client, "inspect", "just one line").status_code == 400


# ---- inbox ----

def test_inbox_groups_and_tags_by_payee(client):
    csv = "Date,Payee,Amount\n01/06/2025,Mystery Shop,-10\n02/06/2025,mystery shop,-20\n03/06/2025,Other Place,-5\n"
    upload(client, "commit", csv, {"date": "Date", "payee": "Payee", "amount": "Amount", "amount_mode": "signed"})
    inbox = client.get("/api/inbox").json()
    g = next(x for x in inbox["groups"] if x["payee"].lower() == "mystery shop")
    assert g["count"] == 2 and g["spent"] == 30
    tag = next(t["id"] for t in client.get("/api/tags").json() if t["name"] == "Shopping")
    r = client.post("/api/inbox/tag", json={"payee": "Mystery Shop", "tag_id": tag, "remember": True}).json()
    assert r == {"tagged": 2, "rule_added": True}
    assert all(x["payee"].lower() != "mystery shop" for x in client.get("/api/inbox").json()["groups"])
    # remembered: the next import of this payee is tagged automatically
    upload(client, "commit", "Date,Payee,Amount\n09/06/2025,MYSTERY SHOP,-1\n",
           {"date": "Date", "payee": "Payee", "amount": "Amount", "amount_mode": "signed"})
    assert client.get("/api/transactions", params={"date_from": "2025-06-09", "date_to": "2025-06-09"}
                      ).json()["items"][0]["tag_name"] == "Shopping"
    assert client.post("/api/inbox/tag", json={"payee": "x", "tag_id": 99999}).status_code == 400
