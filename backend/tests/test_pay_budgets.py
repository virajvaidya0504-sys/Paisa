"""Pay hand-off (pending -> confirm / cancel) and budgets."""
from datetime import datetime
from urllib.parse import parse_qs, urlparse

from app.routers.pay import upi_link


def tag_id(client, name):
    return next(t["id"] for t in client.get("/api/tags").json() if t["name"] == name)


# ---- pay ----

def test_upi_link_format():
    link = upi_link("ravi@okhdfc", "Ravi Kumar", 249.5, "lunch & chai")
    assert link.startswith("upi://pay?")
    q = parse_qs(urlparse(link).query)
    assert q == {"pa": ["ravi@okhdfc"], "pn": ["Ravi Kumar"], "am": ["249.50"], "cu": ["INR"],
                 "tn": ["lunch & chai"]}
    assert " " not in link and "&chai" not in link  # spaces and & are encoded


def test_pay_creates_pending_and_confirm_completes(client):
    r = client.post("/api/pay", json={"upi_id": "ravi@okhdfc", "amount": 500, "payee_name": "Ravi",
                                      "tag_id": tag_id(client, "Personal")})
    assert r.status_code == 201
    tx = r.json()["transaction"]
    assert tx["status"] == "pending" and tx["amount"] == 500 and tx["tag_name"] == "Personal"
    assert tx["upi_id"] == "ravi@okhdfc" and r.json()["link"].startswith("upi://pay?pa=ravi@okhdfc")

    before = client.get("/api/reports/summary").json()["spent"]
    assert client.post(f"/api/pay/{tx['id']}/confirm").status_code == 200
    assert client.get("/api/reports/summary").json()["spent"] == before + 500  # now it counts
    assert client.post(f"/api/pay/{tx['id']}/confirm").status_code == 409      # only once


def test_pending_does_not_count_and_cancel_removes_it(client):
    before = client.get("/api/reports/summary").json()["spent"]
    tx = client.post("/api/pay", json={"upi_id": "a.b@ybl", "amount": 999}).json()["transaction"]
    assert client.get("/api/reports/summary").json()["spent"] == before
    assert client.get(f"/api/pay/{tx['id']}/link").json()["link"].startswith("upi://pay?")
    assert client.post(f"/api/pay/{tx['id']}/cancel").status_code == 200
    assert client.get(f"/api/transactions/{tx['id']}").status_code == 404


def test_pay_applies_rules_and_validates(client):
    tx = client.post("/api/pay", json={"upi_id": "x@ybl", "amount": 10, "payee_name": "Swiggy Instamart"}).json()
    assert tx["transaction"]["tag_name"] == "Food"
    for bad in ("nobank", "a@", "@ybl", "has space@ybl", ""):
        assert client.post("/api/pay", json={"upi_id": bad, "amount": 10}).status_code == 422
    assert client.post("/api/pay", json={"upi_id": "x@ybl", "amount": 0}).status_code == 422
    assert client.post("/api/pay", json={"upi_id": "x@ybl", "amount": 5, "tag_id": 9999}).status_code == 400


def test_cannot_confirm_a_completed_transaction(client):
    done = client.get("/api/transactions", params={"status": "completed", "limit": 1}).json()["items"][0]
    assert client.post(f"/api/pay/{done['id']}/confirm").status_code == 409
    assert client.post("/api/pay/999999/cancel").status_code == 404


# ---- budgets ----

def month_now():
    return datetime.now().strftime("%Y-%m")


def test_budget_progress_and_levels(client):
    tag = client.post("/api/tags", json={"name": "Gadgets"}).json()["id"]
    m = month_now()
    assert client.put(f"/api/budgets/{tag}", json={"monthly_limit": 1000}).status_code == 200

    def level():
        b = client.get("/api/budgets", params={"month": m}).json()
        return next(i for i in b["items"] if i["tag_id"] == tag)

    def spend(amount, **kw):
        client.post("/api/transactions", json={"amount": amount, "payee": "Shop", "tag_id": tag,
                                               "date_time": f"{m}-01T10:00:00", **kw})

    assert level()["level"] == "ok" and level()["spent"] == 0
    spend(700)
    assert level()["level"] == "ok" and level()["percent"] == 70
    spend(150)
    assert level()["level"] == "warning" and level()["remaining"] == 150  # 85%: close to the limit
    spend(500, status="pending")                                          # pending is ignored
    assert level()["spent"] == 850
    spend(200)
    assert level()["level"] == "over" and level()["spent"] == 1050
    spend(300, type="credit")                                             # money received is not spend
    assert level()["spent"] == 1050


def test_budget_other_months_dont_leak(client):
    tag = client.post("/api/tags", json={"name": "Trips"}).json()["id"]
    client.put(f"/api/budgets/{tag}", json={"monthly_limit": 500})
    client.post("/api/transactions", json={"amount": 400, "payee": "Hotel", "tag_id": tag,
                                           "date_time": "2020-01-15T10:00:00"})
    jan = next(i for i in client.get("/api/budgets", params={"month": "2020-01"}).json()["items"] if i["tag_id"] == tag)
    now = next(i for i in client.get("/api/budgets").json()["items"] if i["tag_id"] == tag)
    assert jan["spent"] == 400 and now["spent"] == 0


def test_budget_update_delete_and_validation(client):
    tag = tag_id(client, "Health")
    client.put(f"/api/budgets/{tag}", json={"monthly_limit": 2000})
    client.put(f"/api/budgets/{tag}", json={"monthly_limit": 3000})  # replaces, not duplicates
    items = [i for i in client.get("/api/budgets").json()["items"] if i["tag_id"] == tag]
    assert len(items) == 1 and items[0]["limit"] == 3000
    assert client.put(f"/api/budgets/{tag}", json={"monthly_limit": 0}).status_code == 422
    assert client.put("/api/budgets/99999", json={"monthly_limit": 5}).status_code == 400
    assert client.delete(f"/api/budgets/{tag}").status_code == 204
    assert client.delete(f"/api/budgets/{tag}").status_code == 404
    assert client.get("/api/budgets", params={"month": "bad"}).status_code == 422
