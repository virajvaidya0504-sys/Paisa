import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBox, PageHead, Skeleton } from "../components/Common";
import Icon from "../components/Icon";
import { api } from "../api";
import { METHODS, rupees } from "../format";

const DATE_FORMATS = [
  ["auto", "Detect automatically (day first)"], ["%d/%m/%Y", "31/12/2025"], ["%d-%m-%Y", "31-12-2025"],
  ["%Y-%m-%d", "2025-12-31"], ["%d-%b-%Y", "31-Dec-2025"], ["%d/%m/%y", "31/12/25"], ["%m/%d/%Y", "12/31/2025 (US order)"],
];
const STEPS = ["Choose file", "Match columns", "Review", "Done"];

/** The mapping the server expects: blank selections become null. */
const clean = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v === "" ? null : v]));

export default function Import() {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [info, setInfo] = useState(null);      // headers, sample rows, row count
  const [m, setM] = useState(null);            // the column mapping being edited
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef(null);

  const form = () => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(clean(m)));
    return fd;
  };

  async function run(fn) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const choose = (f) => f && run(async () => {
    const fd = new FormData(); fd.append("file", f);
    const r = await api.post("/import/inspect", fd);
    const g = r.guess;
    setFile(f); setInfo(r);
    setM({
      date: g.date ?? "", date_format: "auto", amount_mode: g.amount_mode, amount: g.amount ?? "", debit: g.debit ?? "",
      credit: g.credit ?? "", type: g.type ?? "", payee: g.payee ?? "", method: g.method ?? "", note: g.note ?? "",
      default_method: "bank_transfer", invert_sign: false, clean_payee: true,
    });
    setStep(1);
  });

  const toPreview = () => run(async () => { setPreview(await api.post("/import/preview", form())); setStep(2); });
  const doImport = () => run(async () => { setResult(await api.post("/import/commit", form())); setStep(3); });
  const reset = () => { setStep(0); setFile(null); setInfo(null); setM(null); setPreview(null); setResult(null); setError(""); };

  const set = (k) => (e) => setM({ ...m, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const col = (label, k, optional) => (
    <label className="field" key={k}>{label}{optional ? " (optional)" : ""}
      <select value={m[k]} onChange={set(k)} required={!optional}>
        <option value="">{optional ? "None" : "Choose column…"}</option>
        {info.headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  );
  const ready = m && m.date && m.payee && ({ signed: m.amount, typed: m.amount && m.type, split: m.debit && m.credit })[m.amount_mode];

  return (
    <div className="stack">
      <PageHead eyebrow="Capture" title="Import a statement"
        lede="Upload a CSV from your bank or UPI app, tell Paisa which column is which, and review before anything is saved. Duplicates are skipped." />

      <div className="steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <div key={s} className="row" style={{ gap: 8 }}>
            <div className={`step ${i === step ? "on" : i < step ? "done" : ""}`}>
              <span className="n">{i < step ? <Icon name="check" size={13} /> : i + 1}</span>{s}
            </div>
            {i < STEPS.length - 1 && <span className="step-line" />}
          </div>
        ))}
      </div>
      <ErrorBox error={error} />

      {step === 0 && (
        <div className="card">
          <div className={`drop ${over ? "over" : ""}`} role="button" tabIndex={0}
            onClick={() => input.current.click()} onKeyDown={(e) => e.key === "Enter" && input.current.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]); }}>
            <Icon name="file" size={34} />
            <div style={{ marginTop: 8, fontWeight: 500, color: "var(--text)" }}>{busy ? "Reading file…" : "Drop a CSV here, or click to choose"}</div>
            <div className="small">Up to 5 MB. The file is processed on this computer and never uploaded anywhere.</div>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv,.txt" onChange={(e) => { choose(e.target.files[0]); e.target.value = ""; }} />
        </div>
      )}

      {step === 1 && m && (
        <>
          <div className="card stack">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{file.name} · {info.row_count} rows</h2>
              <span className="badge ok">Columns guessed. Check them</span>
            </div>
            <div className="form-grid">
              {col("Date column", "date")}
              <label className="field">Date format
                <select value={m.date_format} onChange={set("date_format")}>
                  {DATE_FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              {col("Payee / description column", "payee")}
            </div>

            <div>
              <div className="muted small" style={{ marginBottom: 8 }}>How are amounts laid out?</div>
              <div className="seg" role="group" aria-label="Amount layout">
                {[["signed", "One amount column"], ["typed", "Amount + Dr/Cr column"], ["split", "Separate debit & credit"]].map(([v, l]) => (
                  <button key={v} type="button" className={m.amount_mode === v ? "on" : ""} onClick={() => setM({ ...m, amount_mode: v })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="form-grid">
              {m.amount_mode !== "split" && col("Amount column", "amount")}
              {m.amount_mode === "typed" && col("Dr/Cr (type) column", "type")}
              {m.amount_mode === "split" && col("Debit (money out) column", "debit")}
              {m.amount_mode === "split" && col("Credit (money in) column", "credit")}
              {col("Payment method column", "method", true)}
              {col("Note column", "note", true)}
              <label className="field">Payment method if unknown
                <select value={m.default_method} onChange={set("default_method")}>
                  {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <label className="check"><input type="checkbox" checked={m.clean_payee} onChange={set("clean_payee")} /> Tidy payee names (e.g. "UPI/DR/123/SWIGGY/…" becomes "Swiggy")</label>
            {m.amount_mode === "signed" && (
              <label className="check"><input type="checkbox" checked={m.invert_sign} onChange={set("invert_sign")} /> Positive amounts are spending (credit card statements)</label>
            )}
          </div>

          <div className="card stack">
            <h2>First rows of your file</h2>
            <div className="table-wrap">
              <table>
                <thead><tr>{info.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{info.sample.map((r, i) => <tr key={i}>{info.headers.map((h, j) => <td key={h}>{r[j]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
          <div className="row between">
            <button onClick={reset}>Choose another file</button>
            <button className="primary" disabled={!ready || busy} onClick={toPreview}>{busy ? "Checking…" : "Review import"} <Icon name="arrow" size={17} /></button>
          </div>
        </>
      )}

      {step === 2 && (!preview ? <Skeleton height={240} /> : (
        <>
          <div className="grid stats">
            <div className="card stat"><div className="label">New</div><div className="value received">{preview.counts.new}</div><div className="delta faint">will be imported</div></div>
            <div className="card stat"><div className="label">Duplicates</div><div className="value">{preview.counts.duplicate}</div><div className="delta faint">already in Paisa, skipped</div></div>
            <div className="card stat"><div className="label">Problems</div><div className={`value ${preview.counts.invalid ? "spent" : ""}`}>{preview.counts.invalid}</div><div className="delta faint">can't be read, skipped</div></div>
          </div>
          <div className="card stack">
            <h2>Preview{preview.total > preview.rows.length ? ` · showing ${preview.rows.length} of ${preview.total}` : ""}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Row</th><th>Status</th><th>Date</th><th>Payee</th><th>Method</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td className="faint">{r.line}</td>
                      <td className={`status-${r.status}`}>{r.status === "new" ? "New" : r.status === "duplicate" ? "Duplicate" : r.reason}</td>
                      <td>{r.tx?.date_time.slice(0, 10)}</td>
                      <td>{r.tx?.payee}</td>
                      <td>{r.tx && METHODS[r.tx.payment_method]}</td>
                      <td className={`r num ${r.tx?.type === "credit" ? "received" : ""}`}>{r.tx && `${r.tx.type === "credit" ? "+" : "−"}${rupees(r.tx.paise / 100)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row between">
            <button onClick={() => setStep(1)}>← Back to columns</button>
            <button className="primary" disabled={busy || preview.counts.new === 0} onClick={doImport}>
              {busy ? "Importing…" : `Import ${preview.counts.new} transaction${preview.counts.new === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      ))}

      {step === 3 && result && (
        <div className="card hero stack">
          <div className="display" style={{ fontSize: "2rem" }}>{result.imported} imported</div>
          <div className="muted">
            {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped
            {result.invalid ? ` · ${result.invalid} row${result.invalid === 1 ? "" : "s"} couldn't be read` : ""}.
            {result.untagged > 0 ? ` ${result.untagged} have no tag yet.` : " Every one was tagged by your rules."}
          </div>
          <div className="row">
            {result.untagged > 0 && <Link className="btn primary" to="/inbox"><Icon name="inbox" size={17} /> Tag the {result.untagged} untagged</Link>}
            <Link className="btn" to="/transactions">View transactions</Link>
            <button onClick={reset}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
