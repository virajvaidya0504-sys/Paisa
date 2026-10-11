"""Paisa: FastAPI entry point.

Run from the `backend` folder:  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Bound to 127.0.0.1 only, so nothing is reachable from other devices.
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .routers import budgets, imports, inbox, pay, reports, tags, transactions
from .seed import seed

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup and add sample data the first time.
    conn = db.connect()
    db.init_db(conn)
    seed(conn)
    conn.close()
    yield


app = FastAPI(title="Paisa", lifespan=lifespan)
app.include_router(tags.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
for r in (imports.router, inbox.router, pay.router, budgets.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}


# Serve the built React app (after `npm run build`). Unknown paths fall back to
# index.html so client-side routes work on refresh.
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        file = FRONTEND_DIST / path
        return FileResponse(file if file.is_file() else FRONTEND_DIST / "index.html")
