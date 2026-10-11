import { useState } from "react";
import { METHODS, nowInput } from "../format";
import { ErrorBox } from "./Common";

/** Add/edit form for one transaction. `onSave(body)` should throw to show an error. */
export default function TxForm({ initial, tags, onSave, onDelete, saveLabel = "Save" }) {
  const [f, setF] = useState(() => ({
    type: initial?.type ?? "debit",
    amount: initial?.amount ?? "",
    payee: initial?.payee ?? "",
    date_time: (initial?.date_time ?? nowInput()).slice(0, 16),
    payment_method: initial?.payment_method ?? "upi",
    tag: initial?.tag_id ?? "",
    note: initial?.note ?? "",
    status: initial?.status ?? "completed",
  }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await onSave({
        type: f.type, amount: Number(f.amount), payee: f.payee, date_time: f.date_time,
        payment_method: f.payment_method, tag_id: f.tag === "" ? null : Number(f.tag),
        note: f.note, status: f.status, upi_id: initial?.upi_id ?? null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <ErrorBox error={error} />
      <div className="seg" role="group" aria-label="Type">
        <button type="button" className={f.type === "debit" ? "on" : ""} onClick={() => setF({ ...f, type: "debit" })}>Spent</button>
        <button type="button" className={f.type === "credit" ? "on" : ""} onClick={() => setF({ ...f, type: "credit" })}>Received</button>
      </div>
      <div className="form-grid">
        <label className="field">Amount (₹)
          <input type="number" step="0.01" min="0.01" required value={f.amount} onChange={set("amount")} />
        </label>
        <label className="field">Payee
          <input required value={f.payee} onChange={set("payee")} />
        </label>
        <label className="field">Date and time
          <input type="datetime-local" required value={f.date_time} onChange={set("date_time")} />
        </label>
        <label className="field">Payment method
          <select value={f.payment_method} onChange={set("payment_method")}>
            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">Tag
          <select value={f.tag} onChange={set("tag")}>
            <option value="">Auto (by rules)</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field">Status
          <select value={f.status} onChange={set("status")}>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>
      <label className="field">Note
        <input value={f.note} onChange={set("note")} maxLength={500} />
      </label>
      <div className="row between">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : saveLabel}</button>
        {onDelete && <button type="button" className="danger" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  );
}
