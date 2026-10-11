// Demo mode: the real Paisa backend (Python, FastAPI, SQLite) running inside the browser via Pyodide
// (Python compiled to WebAssembly). Nothing is sent to a server and data lives in memory, so it
// resets on refresh. This file is only bundled in the demo build (`npm run build:demo`).

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
let ready;

const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = src; s.onload = resolve;
  s.onerror = () => reject(new Error("Couldn't load the Python runtime. Check your internet connection and refresh."));
  document.head.appendChild(s);
});

// Runs once after the backend files are copied in. Pyodide has no threads, so FastAPI's
// "run sync code in a thread" helpers are swapped for plain calls; the SQLite code is unchanged.
const BOOT = `
import sys, os, json, base64
os.environ["PAISA_DB"] = "/tmp/paisa.db"
sys.path.insert(0, "/paisa")

import anyio.to_thread
async def _run_sync(func, *args, **kwargs):
    return func(*args)
anyio.to_thread.run_sync = _run_sync

async def _in_pool(func, *args, **kwargs):
    return func(*args, **kwargs)

from app import db
from app.seed import seed
conn = db.connect(); db.init_db(conn); seed(conn); conn.close()
from app.main import app

for name, mod in list(sys.modules.items()):
    if name.startswith(("starlette", "fastapi")) and hasattr(mod, "run_in_threadpool"):
        mod.run_in_threadpool = _in_pool

async def call(method, path, query, headers_json, body_b64):
    headers = json.loads(headers_json)
    body = base64.b64decode(body_b64)
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
             "path": path, "raw_path": path.encode(), "query_string": query.encode(),
             "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
             "scheme": "http", "server": ("demo", 80), "client": ("127.0.0.1", 0), "root_path": ""}
    sent = False
    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}
    out = {"status": 500, "headers": {}, "body": b""}
    async def send(msg):
        if msg["type"] == "http.response.start":
            out["status"] = msg["status"]
            out["headers"] = {k.decode(): v.decode() for k, v in msg["headers"]}
        elif msg["type"] == "http.response.body":
            out["body"] += msg.get("body", b"")
    await app(scope, receive, send)
    return json.dumps({"status": out["status"], "headers": out["headers"],
                       "body": base64.b64encode(out["body"]).decode()})
`;

/** Start the in-browser backend (once). `onStatus` receives progress text for the loading screen. */
export function initDemo(onStatus = () => {}) {
  ready ??= (async () => {
    onStatus("Loading the Python runtime…");
    await loadScript(`${PYODIDE}pyodide.js`);
    const py = await window.loadPyodide({ indexURL: PYODIDE });
    onStatus("Loading libraries…");
    await py.loadPackage(["micropip", "pydantic", "sqlite3", "anyio"]);
    await py.runPythonAsync('import micropip\nawait micropip.install(["fastapi==0.115.14", "python-multipart"])');
    onStatus("Starting Paisa…");
    const files = await (await fetch(`${import.meta.env.BASE_URL}demo-backend.json`)).json();
    for (const [path, src] of Object.entries(files)) {
      const full = `/paisa/${path}`;
      py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
      py.FS.writeFile(full, src);
    }
    await py.runPythonAsync(BOOT);
    return py;
  })();
  return ready;
}

const toB64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Same contract as fetch(): returns a Response for the given API call. */
export async function demoFetch(method, path, query, body) {
  const py = await initDemo();
  const headers = {};
  let bytes = new Uint8Array();
  if (body instanceof FormData) { // let the browser build the multipart body, then hand over the bytes
    const r = new Response(body);
    headers["content-type"] = r.headers.get("content-type");
    bytes = new Uint8Array(await r.arrayBuffer());
  } else if (body) {
    headers["content-type"] = "application/json";
    bytes = new TextEncoder().encode(JSON.stringify(body));
  }
  const call = py.globals.get("call");
  const out = JSON.parse(await call(method, path, query, JSON.stringify(headers), toB64(bytes)));
  const raw = Uint8Array.from(atob(out.body), (c) => c.charCodeAt(0));
  return new Response(out.status === 204 || out.status === 304 ? null : raw, { status: out.status, headers: out.headers });
}
