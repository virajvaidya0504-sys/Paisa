import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBox, PageHead, Skeleton } from "../components/Common";
import Icon from "../components/Icon";
import { api } from "../api";
import { dayHeading, rupees } from "../format";
import { useApi, useTags } from "../hooks";

/** Untagged transactions grouped by payee: one tap tags every transaction from that payee. */
export default function Inbox() {
  const inbox = useApi("/inbox");
  const tags = useTags();
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function tag(group, t) {
    setError(""); setInfo("");
    try {
      const r = await api.post("/inbox/tag", { payee: group.payee, tag_id: t.id, remember });
      setInfo(`Tagged ${r.tagged} from ${group.payee} as ${t.name}${r.rule_added ? ". Future ones will be tagged automatically." : "."}`);
      inbox.reload();
    } catch (e) { setError(e.message); }
  }

  const groups = inbox.data?.groups ?? [];
  return (
    <div className="stack">
      <PageHead eyebrow="Capture" title="Untagged"
        lede="Imported transactions that no rule recognised. Tag a payee once and every transaction from it is tagged." />
      <ErrorBox error={error || inbox.error} />
      {info && <div className="toast row" role="status"><Icon name="check" size={18} /> {info}</div>}

      <label className="check card" style={{ padding: "12px 16px" }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember my choice as an auto-tag rule, so future imports are tagged automatically
      </label>

      {!inbox.data ? <Skeleton height={200} /> : groups.length === 0 ? (
        <div className="card empty">
          <div className="big">All tagged</div>
          Nothing is waiting. <Link to="/import" style={{ color: "var(--accent)" }}>Import a statement</Link> to add more.
        </div>
      ) : (
        <>
          <div className="muted small">{inbox.data.total} transaction{inbox.data.total === 1 ? "" : "s"} across {groups.length} payee{groups.length === 1 ? "" : "s"}</div>
          <div className="grid fit">
            {groups.map((g) => (
              <div className="card stack" key={g.payee.toLowerCase()}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <span className="avatar">{g.payee.charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.payee}</div>
                    <div className="faint small num">
                      {g.count} transaction{g.count === 1 ? "" : "s"} · {g.spent ? `${rupees(g.spent)} spent` : ""}{g.spent && g.received ? " · " : ""}{g.received ? `${rupees(g.received)} received` : ""}
                      <br />latest {dayHeading(g.latest.slice(0, 10))}
                    </div>
                  </div>
                </div>
                <div className="chips">
                  {(tags.data ?? []).map((t) => (
                    <button key={t.id} className="chip sm" onClick={() => tag(g, t)}>
                      <span className="dot" style={{ background: t.color }} />{t.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
