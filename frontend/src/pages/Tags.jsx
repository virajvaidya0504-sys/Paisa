import { useState } from "react";
import { ErrorBox, PageHead, Skeleton } from "../components/Common";
import Icon from "../components/Icon";
import { api } from "../api";
import { useApi } from "../hooks";

/** One editable tag: change the colour or rename it and it saves immediately. */
function TagRow({ tag, onChanged, onError }) {
  const [name, setName] = useState(tag.name);

  async function save(patch) {
    onError("");
    try {
      await api.put(`/tags/${tag.id}`, { name, color: tag.color, ...patch });
      onChanged();
    } catch (e) {
      setName(tag.name); // put the old name back
      onError(e.message);
    }
  }
  async function remove() {
    const msg = `Delete "${tag.name}"? ${tag.tx_count} transaction(s) will become untagged. Its auto-tag rules and budget are removed too.`;
    if (!window.confirm(msg)) return;
    await api.del(`/tags/${tag.id}`);
    onChanged();
  }

  return (
    <div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "nowrap" }}>
      <input type="color" value={tag.color} onChange={(e) => save({ color: e.target.value })} aria-label={`Colour for ${tag.name}`} />
      <input style={{ flex: 1, minWidth: 90 }} value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== tag.name && save({ name })}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} aria-label={`Name of ${tag.name}`} />
      <span className="faint small num" style={{ minWidth: 44, textAlign: "right" }}>{tag.tx_count} tx</span>
      <button className="ghost icon-btn danger" onClick={remove} aria-label={`Delete ${tag.name}`}><Icon name="trash" size={18} /></button>
    </div>
  );
}

export default function Tags() {
  const tags = useApi("/tags");
  const rules = useApi("/rules");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [newTag, setNewTag] = useState({ name: "", color: "#3ddc97" });
  const [newRule, setNewRule] = useState({ pattern: "", tag_id: "", priority: 0 });

  const reloadAll = () => { tags.reload(); rules.reload(); };
  const guard = (fn) => async (e) => {
    e?.preventDefault?.();
    setError(""); setInfo("");
    try { await fn(); } catch (err) { setError(err.message); }
  };

  const addTag = guard(async () => {
    await api.post("/tags", newTag);
    setNewTag({ name: "", color: newTag.color });
    reloadAll();
  });
  const addRule = guard(async () => {
    await api.post("/rules", { ...newRule, tag_id: Number(newRule.tag_id), priority: Number(newRule.priority) });
    setNewRule({ pattern: "", tag_id: newRule.tag_id, priority: 0 });
    rules.reload();
  });
  const applyRules = guard(async () => {
    const r = await api.post("/rules/apply");
    setInfo(`Tagged ${r.tagged} transaction(s). ${r.still_untagged} still have no tag.`);
    tags.reload();
  });

  return (
    <div className="stack">
      <PageHead eyebrow="Plan" title="Tags and rules" lede="Tags group your spending. Rules tag new transactions for you by payee." />
      <ErrorBox error={error || tags.error || rules.error} />
      {info && <div className="toast" role="status">{info}</div>}

      <div className="grid two">
        <div className="card">
          <h2>Tags</h2>
          {tags.data ? tags.data.map((t) => <TagRow key={t.id} tag={t} onChanged={reloadAll} onError={setError} />) : <Skeleton />}
          <form className="row" style={{ marginTop: 14, flexWrap: "nowrap" }} onSubmit={addTag}>
            <input type="color" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} aria-label="New tag colour" />
            <input style={{ flex: 1, minWidth: 90 }} placeholder="New tag name" required value={newTag.name}
              onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} />
            <button className="primary">Add</button>
          </form>
        </div>

        <div className="card">
          <h2>Auto-tag rules</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            If a payee contains the text, the transaction gets that tag. Higher priority is checked first.
            A tag you choose yourself is never overridden.
          </p>
          {rules.data ? (rules.data.length ? rules.data.map((r) => (
            <div className="row between" key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", flexWrap: "nowrap" }}>
              <span>payee contains <b>"{r.pattern}"</b> → <span className="dot" style={{ background: r.tag_color }} /> {r.tag_name}
                {r.priority ? <span className="faint small"> (priority {r.priority})</span> : null}</span>
              <button className="ghost icon-btn" aria-label={`Remove rule ${r.pattern}`}
                onClick={guard(async () => { await api.del(`/rules/${r.id}`); rules.reload(); })}><Icon name="x" size={17} /></button>
            </div>
          )) : <div className="empty">No rules yet</div>) : <Skeleton />}

          <form className="form-grid" style={{ marginTop: 14 }} onSubmit={addRule}>
            <label className="field">Payee contains
              <input required value={newRule.pattern} onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })} placeholder="e.g. Swiggy" />
            </label>
            <label className="field">Tag as
              <select required value={newRule.tag_id} onChange={(e) => setNewRule({ ...newRule, tag_id: e.target.value })}>
                <option value="">Choose…</option>
                {(tags.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field">Priority
              <input type="number" value={newRule.priority} onChange={(e) => setNewRule({ ...newRule, priority: e.target.value })} />
            </label>
            <div style={{ alignSelf: "end" }}><button className="primary">Add rule</button></div>
          </form>
          <div style={{ marginTop: 14 }}>
            <button onClick={applyRules}>Apply rules to untagged transactions</button>
          </div>
        </div>
      </div>
    </div>
  );
}
