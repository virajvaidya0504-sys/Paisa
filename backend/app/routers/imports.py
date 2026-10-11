"""CSV import in three steps: inspect the file, preview with a mapping, commit."""
import sqlite3

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from ..db import get_conn
from ..importer import (MAX_BYTES, MAX_ROWS, ImportMapping, analyze, decode, guess_mapping,
                        insert_new, read_table)

router = APIRouter(prefix="/import", tags=["import"])


async def _load(file: UploadFile) -> tuple[list[str], list[list[str]], str]:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 5 MB")
    headers, rows, delim = read_table(decode(data))
    if not headers or not rows:
        raise HTTPException(400, "This file doesn't look like a CSV with a header row and data")
    if len(rows) > MAX_ROWS:
        raise HTTPException(413, f"More than {MAX_ROWS} rows; split the file and import in parts")
    return headers, rows, delim


def _mapping(raw: str, headers: list[str]) -> ImportMapping:
    try:
        m = ImportMapping.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(422, "Mapping is incomplete: " + "; ".join(
            f"{'.'.join(map(str, x['loc']))} {x['msg']}" for x in e.errors()))
    for col in (m.date, m.payee, m.amount, m.debit, m.credit, m.type, m.method, m.note):
        if col and col not in headers:
            raise HTTPException(422, f"Column '{col}' is not in this file")
    needs = {"signed": [m.amount], "typed": [m.amount, m.type], "split": [m.debit, m.credit]}[m.amount_mode]
    if not all(needs):
        raise HTTPException(422, f"Choose the columns for amount mode '{m.amount_mode}'")
    return m


@router.post("/inspect")
async def inspect(file: UploadFile = File(...)):
    """Read the file's columns and suggest a mapping."""
    headers, rows, delim = await _load(file)
    return {"headers": headers, "sample": rows[:5], "row_count": len(rows),
            "delimiter": delim, "guess": guess_mapping(headers)}


@router.post("/preview")
async def preview(file: UploadFile = File(...), mapping: str = Form(...),
                  conn: sqlite3.Connection = Depends(get_conn)):
    """Dry run: how every row would be read, and which are duplicates. Writes nothing."""
    headers, rows, _ = await _load(file)
    results = analyze(conn, headers, rows, _mapping(mapping, headers))
    counts = {s: sum(1 for r in results if r["status"] == s) for s in ("new", "duplicate", "invalid")}
    # Show every problem row first, then a sample of the rest.
    shown = [r for r in results if r["status"] == "invalid"][:30] + \
            [r for r in results if r["status"] != "invalid"][:70]
    return {"counts": counts, "total": len(results), "rows": sorted(shown, key=lambda r: r["line"])}


@router.post("/commit")
async def commit(file: UploadFile = File(...), mapping: str = Form(...),
                 conn: sqlite3.Connection = Depends(get_conn)):
    """Import every new row. The file is parsed again here, so the result matches the preview."""
    headers, rows, _ = await _load(file)
    results = analyze(conn, headers, rows, _mapping(mapping, headers))
    return insert_new(conn, results)
