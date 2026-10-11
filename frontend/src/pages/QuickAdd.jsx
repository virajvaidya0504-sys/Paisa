import { useRef, useState } from "react";
import { ErrorBox, PageHead } from "../components/Common";
import Icon from "../components/Icon";
import { api } from "../api";
import { METHODS, rupees } from "../format";
import { useApi, useTags } from "../hooks";

/** Amount, payee, tag: three fields and a button. Everything else takes sensible defaults. */
export default function QuickAdd() {
  const tags = useTags();
  const recent = useApi("/transactions", { limit: 100 });
  const [type, setType] = useState("debit");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [tag, setTag] = useState(null); // null = let the auto-tag rules decide
  const [method, setMethod] = useState("upi");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const amountRef = useRef(null);

  const payees = [...new Set((recent.data?.items ?? []).map((t) => t.payee))]; // suggest payees you've used

  async function submit(e) {
    e.preventDefault();
    setError(""); setDone("");
    try {
      const tx = await api.post("/transactions", { amount: Number(amount), payee, type, payment_method: method, tag_id: tag });
      setDone(`Saved ${rupees(tx.amount)} to ${tx.payee} · ${tx.tag_name ?? "untagged"}`);
      setAmount(""); setPayee(""); setTag(null);
      recent.reload();
      amountRef.current?.focus();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 560 }}>
      <PageHead eyebrow="Capture" title="Quick add" lede="Amount, who, and a tag. Everything else is filled in for you." />
      <ErrorBox error={error} />
      {done && <div className="toast row" role="status"><Icon name="check" size={18} /> {done}</div>}

      <div className="card stack">
        <div className="seg" role="group" aria-label="Type">
          <button type="button" className={type === "debit" ? "on" : ""} onClick={() => setType("debit")}>Spent</button>
          <button type="button" className={type === "credit" ? "on" : ""} onClick={() => setType("credit")}>Received</button>
        </div>

        <input ref={amountRef} className="amount-input" type="number" inputMode="decimal" step="0.01" min="0.01"
          placeholder="₹ 0" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in rupees" />

        <label className="field">Payee
          <input list="payees" required value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Who did you pay?" />
          <datalist id="payees">{payees.map((p) => <option key={p} value={p} />)}</datalist>
        </label>

        <div>
          <div className="muted small" style={{ marginBottom: 8 }}>Tag · leave unselected to auto-tag by payee</div>
          <div className="chips">
            {(tags.data ?? []).map((t) => (
              <button type="button" key={t.id} className={`chip ${tag === t.id ? "on" : ""}`} onClick={() => setTag(tag === t.id ? null : t.id)}>
                <span className="dot" style={{ background: t.color }} />{t.name}
              </button>
            ))}
          </div>
        </div>

        <label className="field">Paid by
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>

        <button className="primary" style={{ padding: 14, fontSize: "1.05rem" }}>Save</button>
      </div>
    </form>
  );
}
