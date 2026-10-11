"""Test setup: every test gets its own throwaway database, never data/paisa.db."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def db_file(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("PAISA_DB", str(path))
    return path


@pytest.fixture
def client(db_file):
    """App with sample data seeded (as on a first run)."""
    from app.main import app
    with TestClient(app) as c:  # `with` runs the startup that creates and seeds the DB
        yield c


@pytest.fixture
def conn(db_file):
    """Bare, empty database for tests of the data layer."""
    from app import db
    c = db.connect()
    db.init_db(c)
    yield c
    c.close()
