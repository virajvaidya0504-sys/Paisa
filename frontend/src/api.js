// Thin wrapper around fetch. Throws an Error with the server's message on failure.

async function request(method, path, { params, body } = {}) {
  let url = `/api${path}`;
  if (params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== "" && v !== null && v !== undefined && v !== false) q.set(k, v);
    }
    if ([...q].length) url += `?${q}`;
  }
  const isForm = body instanceof FormData; // file uploads: the browser sets the multipart header itself
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
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
  exportUrl: (params) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== "" && v != null && v !== false) q.set(k, v);
    return `/api/transactions/export.csv?${q}`;
  },
};
