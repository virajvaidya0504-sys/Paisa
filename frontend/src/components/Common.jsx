import { useEffect } from "react";
import { dateTime, METHODS, rupees, timeOf } from "../format";
import Icon from "./Icon";

export function TagBadge({ name, color }) {
  return (
    <span className="badge">
      <span className="dot" style={{ background: name ? color : "var(--faint)" }} />{name ?? "Untagged"}
    </span>
  );
}

export const ErrorBox = ({ error }) => (error ? <div className="error" role="alert">{error}</div> : null);

export const Skeleton = ({ height = 120 }) => <div className="skeleton" style={{ height }} aria-busy="true" />;

/** Page title block: small label, big serif title, optional sentence, optional buttons on the right. */
export function PageHead({ eyebrow, title, lede, children }) {
  return (
    <div style={{ "--i": 0 }}>
      <div className="head">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="title">{title}</h1>
        </div>
        {children && <div className="row">{children}</div>}
      </div>
      {lede && <p className="lede">{lede}</p>}
    </div>
  );
}

/** One transaction line. Clicking it calls onClick (used to open the editor). */
export function TxRow({ tx, onClick, showDate = true }) {
  const sign = tx.type === "credit" ? "+" : "−";
  return (
    <button className="tx" onClick={onClick}>
      <span className="avatar" style={{ "--c": tx.tag_color ?? undefined }}>{tx.payee.trim().charAt(0).toUpperCase()}</span>
      <div className="mid">
        <div className="payee">{tx.payee}</div>
        <div className="meta">
          <span>{showDate ? dateTime(tx.date_time) : timeOf(tx.date_time) || "No time"}</span>
          <span>· {METHODS[tx.payment_method]}</span>
          <TagBadge name={tx.tag_name} color={tx.tag_color} />
          {tx.status === "pending" && <span className="badge pending">Pending</span>}
        </div>
      </div>
      <div className={`amount ${tx.type === "credit" ? "received" : ""}`}>{sign}{rupees(tx.amount)}</div>
    </button>
  );
}

/** Horizontal bars with labels. `items` = [{label, total, color, count}], largest first. */
export function BarList({ items, formatLabel = (l) => l, empty = "No data for this period" }) {
  if (!items?.length) return <div className="empty">{empty}</div>;
  const max = items[0].total || 1;
  const sum = items.reduce((a, i) => a + i.total, 0) || 1;
  return (
    <div className="barlist">
      {items.map((i, n) => (
        <div key={i.label}>
          <div className="head">
            <span><span className="dot" style={{ background: i.color }} />{formatLabel(i.label)}</span>
            <span className="num"><b>{rupees(i.total)}</b> <span className="faint small">{Math.round((i.total / sum) * 100)}%</span></span>
          </div>
          <div className="track"><div className="fill" style={{ width: `${(i.total / max) * 100}%`, background: i.color, animationDelay: `${n * 50}ms` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Glass tooltip for Recharts. `format` turns a value into text. */
export function ChartTip({ active, payload, label, format = rupees, labelFormat = (l) => l }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="faint small">{labelFormat(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: p.color || p.payload?.fill }} />
          <span className="muted">{p.name}</span> <b>{format(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => { // Escape closes the dialog
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h2 className="display" style={{ fontSize: "1.4rem" }}>{title}</h2>
          <button className="ghost icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
