import { useState } from "react";
import { ErrorBox, PageHead, Skeleton } from "../components/Common";
import Icon from "../components/Icon";
import { api } from "../api";
import { rupees, rupeesWhole, ymd } from "../format";
import { useApi, useCountUp, useTags } from "../hooks";

const LEVEL_TEXT = { ok: "On track", warning: "Close to limit", over: "Over budget" };
const LEVEL_BADGE = { ok: "ok", warning: "pending", over: "bad" };

function BudgetCard({ b, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(String(b.limit));
  const pct = useCountUp(b.percent);

  async function save(e) {
    e.preventDefault();
    try { await api.put(`/budgets/${b.tag_id}`, { monthly_limit: Number(limit) }); setEditing(false); onSaved(); }
    catch (err) { onError(err.message); }
  }
  async function remove() {
    if (!window.confirm(`Remove the ${b.tag_name} budget?`)) return;
    try { await api.del(`/budgets/${b.tag_id}`); onSaved(); } catch (err) { onError(err.message); }
  }

  return (
    <div className={`card budget stack lvl-${b.level}`}>
      <div className="row between" style={{ flexWrap: "nowrap" }}>
        <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: b.tag_color }} /><b>{b.tag_name}</b></div>
        <span className={`badge ${LEVEL_BADGE[b.level]}`}>{LEVEL_TEXT[b.level]}</span>
      </div>
      <div className="row between" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
        <div className="pct" style={{ color: "var(--lvl)" }}>{Math.round(pct)}%</div>
        <div className="small muted num" style={{ textAlign: "right" }}>
          {rupeesWhole(b.spent)} of {rupeesWhole(b.limit)}<br />
          {b.remaining >= 0 ? <span>{rupeesWhole(b.remaining)} left</span> : <span className="spent">{rupeesWhole(-b.remaining)} over</span>}
        </div>
      </div>
      <div className="track lg"><div className="fill" style={{ width: `${Math.min(100, b.percent)}%`, background: "var(--lvl)" }} /></div>
      {editing ? (
        <form className="row" onSubmit={save} style={{ flexWrap: "nowrap" }}>
          <input type="number" min="1" step="1" required autoFocus value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Monthly limit in rupees" />
          <button className="primary">Save</button>
          <button type="button" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <div className="row">
          <button className="ghost" onClick={() => { setLimit(String(b.limit)); setEditing(true); }}><Icon name="edit" size={16} /> Change limit</button>
          <button className="ghost danger" onClick={remove}><Icon name="trash" size={16} /> Remove</button>
        </div>
      )}
    </div>
  );
}

export default function Budgets() {
  const [month, setMonth] = useState(ymd(new Date()).slice(0, 7));
  const budgets = useApi("/budgets", { month });
  const tags = useTags();
  const [error, setError] = useState("");
  const [add, setAdd] = useState({ tag_id: "", limit: "" });

  const items = budgets.data?.items ?? [];
  const free = (tags.data ?? []).filter((t) => !items.some((b) => b.tag_id === t.id));
  const totalPct = budgets.data?.total_limit ? (budgets.data.total_spent / budgets.data.total_limit) * 100 : 0;
  const spentShown = useCountUp(budgets.data?.total_spent);

  async function create(e) {
    e.preventDefault(); setError("");
    try {
      await api.put(`/budgets/${add.tag_id}`, { monthly_limit: Number(add.limit) });
      setAdd({ tag_id: "", limit: "" });
      budgets.reload();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="stack">
      <PageHead eyebrow="Plan" title="Budgets" lede="An optional monthly limit per tag. You'll see a warning at 80%. Only completed spending counts.">
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" style={{ width: 180 }} />
      </PageHead>
      <ErrorBox error={error || budgets.error} />

      {budgets.data && items.length > 0 && (
        <div className="card hero stack">
          <div className="row between">
            <div>
              <div className="eyebrow">Budgeted tags, this month</div>
              <div className="display num" style={{ fontSize: "2.2rem" }}>{rupeesWhole(spentShown)} <span className="muted" style={{ fontSize: "1.1rem" }}>of {rupeesWhole(budgets.data.total_limit)}</span></div>
            </div>
            <div className="display" style={{ fontSize: "1.8rem" }}>{Math.round(totalPct)}%</div>
          </div>
          <div className="track lg"><div className="fill" style={{ width: `${Math.min(100, totalPct)}%`, background: "linear-gradient(90deg, var(--accent), var(--gold))" }} /></div>
        </div>
      )}

      {!budgets.data ? <Skeleton height={180} /> : items.length === 0 ? (
        <div className="card empty"><div className="big">No budgets yet</div>Pick a tag below and set a monthly limit.</div>
      ) : (
        <div className="grid fit">
          {items.map((b) => <BudgetCard key={`${b.tag_id}-${b.limit}`} b={b} onSaved={budgets.reload} onError={setError} />)}
        </div>
      )}

      {free.length > 0 && (
        <form className="card" onSubmit={create}>
          <h2>Add a budget</h2>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, minWidth: 150 }}>Tag
              <select required value={add.tag_id} onChange={(e) => setAdd({ ...add, tag_id: e.target.value })}>
                <option value="">Choose…</option>
                {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 150 }}>Monthly limit (₹)
              <input required type="number" min="1" step="1" value={add.limit} onChange={(e) => setAdd({ ...add, limit: e.target.value })} />
            </label>
            <button className="primary">Add budget</button>
          </div>
        </form>
      )}
      <div className="faint small">Showing spend for {month}. Limits repeat every month; only the spend changes.</div>
    </div>
  );
}
