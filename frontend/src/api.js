// Thin wrapper around fetch. Throws an Error with the server's message on failure.
// In the demo build (VITE_DEMO) calls go to the Python backend running inside the browser instead.

export const DEMO = import.meta.env.VITE_DEMO === "true";

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== "" && v !== null && v !== undefined && v !== false) q.set(k, v);
  }
  return q.toString();
};

/** Send a request; resolves to a Response (real or demo). */
async function send(method, path, { params, body } = {}) {
  const q = query(params);
  if (DEMO) {
    const { demoFetch } = await import("./demo/engine");
    return demoFetch(method, `/api${path}`, q, body);
  }
  const isForm = body instanceof FormData; // file uploads: the browser sets the multipart header itself
  return fetch(`/api${path}${q ? `?${q}` : ""}`, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
}

async function request(method, path, opts) {
  const res = await send(method, path, opts);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const d = (await res.json()).detail;
      msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((e) => e.msg).join("; ") : msg;
    } catch { /* keep default message */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  get: (path, params) => request("GET", path, { params }),
  post: (path, body) => request("POST", path, { body }),
  put: (path, body) => request("PUT", path, { body }),
  del: (path) => request("DELETE", path),
  /** Link for a CSV download of the filtered transactions. */
  exportUrl: (params) => `/api/transactions/export.csv?${query(params)}`,
  /** Click handler for that link. Only the demo needs one: there is no server to link to, so it saves a file itself. */
  exportClick: (params) => !DEMO ? undefined : async (e) => {
    e.preventDefault();
    const blob = await (await send("GET", "/transactions/export.csv", { params })).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "paisa-transactions.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
