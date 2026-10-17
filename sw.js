// Paisa service worker. The version and file list below are filled in by scripts/finish-pwa.mjs at build time.
// Everything the app needs (code, fonts, the self-hosted Python runtime) is cached on first visit, so Paisa opens and works offline.
// Updates are never forced: a new worker waits until the user taps "Update" in the app (which sends SKIP_WAITING).
const VERSION = "fa403f287e40";
const PRECACHE = ["assets/fraunces-latin-ext-opsz-normal-CJcjJNj7.woff2","assets/fraunces-latin-opsz-normal-DihXLNYH.woff2","assets/fraunces-vietnamese-opsz-normal-Czevyj-6.woff2","assets/geist-cyrillic-ext-wght-normal-DjL33-gN.woff2","assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2","assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2","assets/geist-latin-wght-normal-BgDaEnEv.woff2","assets/geist-vietnamese-wght-normal-6IgcOCM7.woff2","assets/index-50Wp5-8u.js","assets/index-DJiUhVQl.css","demo-backend.json","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","manifest.webmanifest","runtime/pyodide/annotated_types-0.6.0-py3-none-any.whl","runtime/pyodide/anyio-4.9.0-py3-none-any.whl","runtime/pyodide/micropip-0.9.0-py3-none-any.whl","runtime/pyodide/openssl-1.1.1w.zip","runtime/pyodide/packaging-24.2-py3-none-any.whl","runtime/pyodide/pydantic-2.10.5-py3-none-any.whl","runtime/pyodide/pydantic_core-2.27.2-cp312-cp312-pyodide_2024_0_wasm32.whl","runtime/pyodide/pyodide-lock.json","runtime/pyodide/pyodide.asm.js","runtime/pyodide/pyodide.asm.wasm","runtime/pyodide/pyodide.js","runtime/pyodide/python_stdlib.zip","runtime/pyodide/sniffio-1.3.1-py3-none-any.whl","runtime/pyodide/sqlite3-1.0.0-cp312-cp312-pyodide_2024_0_wasm32.whl","runtime/pyodide/ssl-1.0.0-cp312-cp312-pyodide_2024_0_wasm32.whl","runtime/pyodide/typing_extensions-4.11.0-py3-none-any.whl","runtime/runtime-manifest.json","runtime/wheels/fastapi-0.115.14-py3-none-any.whl","runtime/wheels/python_multipart-0.0.20-py3-none-any.whl","runtime/wheels/starlette-0.46.2-py3-none-any.whl"];
const CACHE = "paisa-" + VERSION;
const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map(scopeUrl))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("paisa-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;     // never touch anything else
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === "navigate") return (await cache.match(scopeUrl("index.html"))) || fetch(req);
    return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "GET_VERSION") event.source && event.source.postMessage({ type: "VERSION", version: VERSION });
});
