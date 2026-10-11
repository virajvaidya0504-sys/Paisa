"""Dashboard numbers must add up, and pending payments must not count."""


def add(client, **over):
    body = {"amount": 100, "payee": "Report Test", "type": "debit", "date_time": "2020-03-15T10:00:00", **over}
    assert client.post("/api/transactions", json=body).status_code == 201


def test_summary_adds_up_and_ignores_pending(client):
    p = {"date_from": "2020-03-01", "date_to": "2020-03-31"}
    add(client, amount=100.50)
    add(client, amount=49.50)
    add(client, amount=1000, type="credit")
    add(client, amount=999, status="pending")  # not happened yet
    s = client.get("/api/reports/summary", params=p).json()
    assert s == {"spent": 150.0, "received": 1000.0, "net": 850.0, "count": 3}


def test_breakdown_by_tag_payee_method(client):
    p = {"date_from": "2020-03-01", "date_to": "2020-03-31"}
    add(client, amount=300, payee="Zomato", payment_method="card")
    add(client, amount=200, payee="Zomato", payment_method="upi")
    add(client, amount=50, payee="Nobody Known", payment_method="cash")
    by_tag = {r["label"]: r["total"] for r in client.get("/api/reports/breakdown", params={**p, "by": "tag"}).json()}
    assert by_tag == {"Food": 500.0, "Untagged": 50.0}
    payees = client.get("/api/reports/breakdown", params={**p, "by": "payee", "limit": 1}).json()
    assert payees[0]["label"] == "Zomato" and payees[0]["count"] == 2 and len(payees) == 1
    by_method = {r["label"]: r["total"] for r in client.get("/api/reports/breakdown", params={**p, "by": "method"}).json()}
    assert by_method == {"card": 300.0, "upi": 200.0, "cash": 50.0}


def test_breakdown_total_matches_summary(client):
    summary = client.get("/api/reports/summary").json()
    for by in ("tag", "method"):
        rows = client.get("/api/reports/breakdown", params={"by": by, "limit": 100}).json()
        assert abs(sum(r["total"] for r in rows) - summary["spent"]) < 0.01


def test_monthly_trend_fills_empty_months(client):
    add(client, amount=100, date_time="2020-01-10T10:00:00")
    add(client, amount=300, date_time="2020-03-10T10:00:00")
    t = client.get("/api/reports/trend", params={"granularity": "month", "date_from": "2020-01-01",
                                                  "date_to": "2020-04-30"}).json()
    assert [r["period"] for r in t] == ["2020-01", "2020-02", "2020-03", "2020-04"]
    assert [r["spent"] for r in t] == [100, 0, 300, 0]


def test_daily_and_yearly_trend(client):
    add(client, amount=10, date_time="2020-12-30T10:00:00")
    add(client, amount=20, date_time="2021-01-02T10:00:00")
    d = client.get("/api/reports/trend", params={"granularity": "day", "date_from": "2020-12-30",
                                                  "date_to": "2021-01-02"}).json()
    assert [r["period"] for r in d] == ["2020-12-30", "2020-12-31", "2021-01-01", "2021-01-02"]
    y = client.get("/api/reports/trend", params={"granularity": "year", "date_from": "2020-01-01",
                                                  "date_to": "2021-12-31"}).json()
    assert [(r["period"], r["spent"]) for r in y] == [("2020", 10), ("2021", 20)]


def test_filters_apply_to_reports(client):
    add(client, amount=100, payee="Zomato")
    add(client, amount=900, payee="Uber")
    s = client.get("/api/reports/summary", params={"date_from": "2020-03-01", "date_to": "2020-03-31",
                                                    "payee": "uber"}).json()
    assert s["spent"] == 900
