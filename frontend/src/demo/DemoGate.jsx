import { useEffect, useState } from "react";
import { initDemo } from "./engine";

/** Shows a loading screen while the in-browser backend starts (about 10 s the first time). */
export default function DemoGate({ children }) {
  const [status, setStatus] = useState("Starting…");
  const [state, setState] = useState("loading"); // loading | ready | failed

  useEffect(() => {
    initDemo(setStatus).then(() => setState("ready")).catch((e) => { setStatus(e.message); setState("failed"); });
  }, []);

  if (state === "ready") return children;
  return (
    <>
      <div className="ambient" aria-hidden />
      <div className="grain" aria-hidden />
      <div style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div className="brand-mark" style={{ width: 56, height: 56, fontSize: "1.9rem", margin: "0 auto 18px", borderRadius: 18 }}>₹</div>
          <div className="title" style={{ marginBottom: 6 }}>Paisa demo</div>
          <p className="muted" style={{ margin: "0 0 18px" }}>
            The real app is starting inside your browser. Nothing is uploaded, and the first load takes a few seconds.
          </p>
          {state === "loading" && <div className="skeleton" style={{ height: 6, borderRadius: 99 }} />}
          <p className={state === "failed" ? "error" : "faint small"} style={{ marginTop: 14 }} role="status">{status}</p>
        </div>
      </div>
    </>
  );
}
