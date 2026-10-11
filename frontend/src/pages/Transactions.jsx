import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBox, Modal, PageHead, Skeleton, TxRow } from "../components/Common";
import FilterBar from "../components/FilterBar";
import Icon from "../components/Icon";
import TxForm from "../components/TxForm";
import { api } from "../api";
import { EMPTY_FILTERS, toParams } from "../filters";
import { dayHeading } from "../format";
import { useApi, useTags } from "../hooks";

const PAGE = 30;

export default function Transactions() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const tags = useTags();
  const params = toParams(filters);
  const list = useApi("/transactions", { ...params, limit: PAGE, offset: page * PAGE });

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const changeFilters = (f) => { setFilters(f); setPage(0); }; // a new filter starts from page 1

  async function save(body) {
    await api.put(`/transactions/${editing.id}`, body);
    setEditing(null);
    list.reload();
  }
  async function remove() {
    if (!window.confirm(`Delete "${editing.payee}"? This cannot be undone.`)) return;
    await api.del(`/transactions/${editing.id}`);
    setEditing(null);
    list.reload();
  }

  // Group the page's rows under day headings (the list is already newest first).
  const groups = [];
  for (const t of list.data?.items ?? []) {
    const day = t.date_time.slice(0, 10);
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1).items.push(t);
  }

  return (
    <div className="stack">
      <PageHead eyebrow="Ledger" title="Transactions">
        <a className="btn" href={api.exportUrl(params)} download><Icon name="download" size={17} /> Export CSV</a>
        <Link className="btn primary" to="/add"><Icon name="plus" size={17} /> Add</Link>
      </PageHead>
      <FilterBar value={filters} onChange={changeFilters} tags={tags.data ?? []} />
      <ErrorBox error={list.error} />
      <div className="muted small">{list.data ? `${total} transaction${total === 1 ? "" : "s"}` : "Loading…"}</div>

      {!list.data ? <Skeleton height={320} /> : groups.length === 0 ? (
        <div className="card empty"><div className="big">Nothing here</div>No transactions match these filters.</div>
      ) : (
        <div className="card flush">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="date-head">{dayHeading(g.day)}</div>
              {g.items.map((t) => <TxRow key={t.id} tx={t} showDate={false} onClick={() => setEditing(t)} />)}
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="row between">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Newer</button>
          <span className="muted small">Page {page + 1} of {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Older →</button>
        </div>
      )}

      {editing && (
        <Modal title="Edit transaction" onClose={() => setEditing(null)}>
          <TxForm initial={editing} tags={tags.data ?? []} onSave={save} onDelete={remove} />
        </Modal>
      )}
    </div>
  );
}
