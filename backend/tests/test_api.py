"""Transactions, tags, rules and filters through the real HTTP API."""


def tag_id(client, name):
    return next(t["id"] for t in client.get("/api/tags").json() if t["name"] == name)


def new_tx(client, **over):
    body = {"amount": 249.5, "payee": "Test Cafe", "type": "debit", **over}
    return client.post("/api/transactions", json=body)


def test_create_stores_exact_amount_and_untagged_when_no_rule(client):
    r = new_tx(client, payee="Nobody Matches Me")
    assert r.status_code == 201
    tx = r.json()
    assert tx["amount"] == 249.5 and tx["tag_id"] is None and tx["status"] == "completed"


def test_create_applies_auto_tag_rule(client):
    tx = new_tx(client, payee="Zomato Order 42").json()
    assert tx["tag_name"] == "Food"


def test_explicit_tag_is_not_overridden_by_rules(client):
    business = tag_id(client, "Business")
    tx = new_tx(client, payee="Zomato client lunch", tag_id=business).json()
    assert tx["tag_name"] == "Business"


def test_validation(client):
    assert new_tx(client, amount=0).status_code == 422
    assert new_tx(client, payee="   ").status_code == 422
    assert new_tx(client, tag_id=99999).status_code == 400


def test_edit_and_delete(client):
    tx = new_tx(client).json()
    r = client.put(f"/api/transactions/{tx['id']}", json={"amount": 300, "payee": "Edited", "type": "credit"})
    assert r.status_code == 200 and r.json()["amount"] == 300 and r.json()["type"] == "credit"
    assert client.delete(f"/api/transactions/{tx['id']}").status_code == 204
    assert client.get(f"/api/transactions/{tx['id']}").status_code == 404


def test_tag_crud_and_duplicate_names(client):
    t = client.post("/api/tags", json={"name": "Travel", "color": "#112233"}).json()
    assert client.post("/api/tags", json={"name": "travel"}).status_code == 409  # case-insensitive
    r = client.put(f"/api/tags/{t['id']}", json={"name": "Trips", "color": "#445566"})
    assert r.json()["name"] == "Trips" and r.json()["color"] == "#445566"
    assert client.post("/api/tags", json={"name": "X", "color": "red"}).status_code == 422


def test_deleting_tag_keeps_transactions_untagged(client):
    food = tag_id(client, "Food")
    before = client.get("/api/transactions", params={"tag_id": food, "limit": 500}).json()["total"]
    assert before > 0
    assert client.delete(f"/api/tags/{food}").status_code == 204
    after = client.get("/api/transactions", params={"untagged": True, "limit": 500}).json()["items"]
    assert sum(1 for t in after if t["payee"] in ("Swiggy", "Zomato")) > 0
    assert all(r["tag_id"] != food for r in client.get("/api/rules").json())  # its rules are gone


def test_apply_rules_only_fills_untagged(client):
    food = tag_id(client, "Food")
    client.post("/api/rules", json={"pattern": "sharma general", "tag_id": food})
    result = client.post("/api/rules/apply").json()
    assert result["tagged"] > 0
    tagged = client.get("/api/transactions", params={"q": "Sharma General", "limit": 500}).json()["items"]
    assert tagged and all(t["tag_name"] == "Food" for t in tagged)


def test_filters(client):
    all_ = client.get("/api/transactions", params={"limit": 1}).json()["total"]
    debits = client.get("/api/transactions", params={"type": "debit", "limit": 1}).json()["total"]
    credits = client.get("/api/transactions", params={"type": "credit", "limit": 1}).json()["total"]
    assert debits + credits == all_

    big = client.get("/api/transactions", params={"min_amount": 5000, "limit": 500}).json()["items"]
    assert big and all(t["amount"] >= 5000 for t in big)

    r = client.get("/api/transactions", params={"payee": "swig", "payment_method": "upi", "limit": 500}).json()
    assert r["items"] and all("swig" in t["payee"].lower() and t["payment_method"] == "upi" for t in r["items"])

    first = client.get("/api/transactions", params={"limit": 1}).json()["items"][0]["date_time"][:10]
    day = client.get("/api/transactions", params={"date_from": first, "date_to": first, "limit": 500}).json()
    assert day["items"] and all(t["date_time"][:10] == first for t in day["items"])


def test_search_treats_percent_literally(client):
    assert client.get("/api/transactions", params={"q": "%"}).json()["total"] == 0


def test_pagination(client):
    page1 = client.get("/api/transactions", params={"limit": 10, "offset": 0}).json()
    page2 = client.get("/api/transactions", params={"limit": 10, "offset": 10}).json()
    assert len(page1["items"]) == 10 and page1["total"] > 20
    assert {t["id"] for t in page1["items"]}.isdisjoint(t["id"] for t in page2["items"])


def test_csv_export_respects_filters_and_blocks_formulas(client):
    new_tx(client, payee="=HYPERLINK(\"http://x\")", note="+cmd")
    r = client.get("/api/transactions/export.csv", params={"q": "HYPERLINK"})
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    lines = r.text.lstrip("﻿").strip().splitlines()
    assert lines[0].startswith("date_time,type,amount")
    assert len(lines) == 2
    assert "'=HYPERLINK" in lines[1] and "'+cmd" in lines[1]
