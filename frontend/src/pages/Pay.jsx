import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { ErrorBox, PageHead, Skeleton } from "../components/Common";
import Icon from "../components/Icon";
import { api } from "../api";
import { dateTime, rupees } from "../format";
import { useApi, useTags } from "../hooks";

/**
 * UPI hand-off. Saving creates a *pending* transaction and a upi://pay link.
 * Paisa never moves money: you finish the payment in your UPI app, then answer
 * "Did it go through?" here.
 */
export default function Pay() {
  const tags = useTags();
  const pending = useApi("/transactions", { status: "pending", limit: 50 });
  const [f, setF] = useState({ upi_id: "", payee_name: "", amount: "", note: "" });
  const [tag, setTag] = useState(null);
  const [active, setActive] = useState(null); // { tx, link } being paid right now
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Draw the QR code whenever the active link changes.
  useEffect(() => {
    if (!active) { setQr(""); return; }
    QRCode.toDataURL(active.link, { width: 420, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [active]);

  async function start(e) {
    e.preventDefault();
    setError(""); setInfo("");
    try {
      const r = await api.post("/pay", { ...f, amount: Number(f.amount), tag_id: tag });
      setActive({ tx: r.transaction, link: r.link });
      setF({ upi_id: "", payee_name: "", amount: "", note: "" }); setTag(null);
      pending.reload();
    } catch (err) { setError(err.message); }
  }

  async function resolve(tx, ok) {
    setError("");
    try {
      await api.post(`/pay/${tx.id}/${ok ? "confirm" : "cancel"}`);
      setInfo(ok ? `Recorded ${rupees(tx.amount)} to ${tx.payee}.` : `Cancelled. ${tx.payee} won't count as spending.`);
      if (active?.tx.id === tx.id) setActive(null);
      pending.reload();
    } catch (err) { setError(err.message); }
  }

  async function showQr(tx) {
    setError("");
    try { setActive({ tx, link: (await api.get(`/pay/${tx.id}/link`)).link }); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (err) { setError(err.message); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(active.link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setError("Couldn't copy. Select the link and copy it manually."); }
  }

  return (
    <div className="stack">
      <PageHead eyebrow="Capture" title="Pay" lede="Save the payment first, finish it in your UPI app, then confirm here. Pending payments never count as spending until you confirm." />
      <ErrorBox error={error} />
      {info && <div className="toast row" role="status"><Icon name="check" size={18} /> {info}</div>}

      <div className="grid two wide-left">
        <form className="card stack" onSubmit={start}>
          <h2>New payment</h2>
          <div className="form-grid">
            <label className="field">Payee UPI ID
              <input required value={f.upi_id} onChange={set("upi_id")} placeholder="name@bank" autoComplete="off" inputMode="email" />
            </label>
            <label className="field">Payee name (optional)
              <input value={f.payee_name} onChange={set("payee_name")} placeholder="Shown in your UPI app" />
            </label>
            <label className="field">Amount (₹)
              <input required type="number" step="0.01" min="0.01" inputMode="decimal" value={f.amount} onChange={set("amount")} />
            </label>
            <label className="field">Note (optional)
              <input value={f.note} onChange={set("note")} maxLength={80} />
            </label>
          </div>
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
          <button className="primary" style={{ padding: 13 }}><Icon name="send" size={18} /> Save and get payment link</button>
        </form>

        {active ? (
          <div className="card stack hero" aria-live="polite">
            <h2>Complete the payment</h2>
            <div>
              <div className="display" style={{ fontSize: "2.2rem" }}>{rupees(active.tx.amount)}</div>
              <div className="muted">to {active.tx.payee}{active.tx.upi_id && active.tx.upi_id !== active.tx.payee ? ` · ${active.tx.upi_id}` : ""}</div>
            </div>
            <a className="btn primary" href={active.link}><Icon name="external" size={18} /> Open in UPI app</a>
            <div className="small muted">On a phone this opens your UPI app. On a computer it does nothing, so scan this code with your phone:</div>
            {qr ? <div className="qr"><img src={qr} alt="QR code for the UPI payment link" /></div> : <Skeleton height={236} />}
            <div className="linkbox">{active.link}</div>
            <button onClick={copy}><Icon name="copy" size={17} /> {copied ? "Copied" : "Copy link"}</button>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <div style={{ marginBottom: 10, fontWeight: 500 }}>Did it go through?</div>
              <div className="row">
                <button className="primary" onClick={() => resolve(active.tx, true)}><Icon name="check" size={17} /> Yes, it went through</button>
                <button onClick={() => resolve(active.tx, false)}>No, cancel it</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card empty" style={{ alignSelf: "start" }}>
            <div className="big">Nothing in progress</div>
            The payment link and QR code appear here after you save.
          </div>
        )}
      </div>

      <div className="card flush">
        <h2 style={{ padding: "18px 18px 0" }}>Waiting for confirmation</h2>
        {!pending.data ? <div style={{ padding: 18 }}><Skeleton height={60} /></div> : pending.data.items.length === 0 ? (
          <div className="empty">No pending payments</div>
        ) : pending.data.items.map((tx) => (
          <div className="tx" key={tx.id} style={{ cursor: "default" }}>
            <span className="avatar" style={{ "--c": "var(--gold)" }}>{tx.payee.charAt(0).toUpperCase()}</span>
            <div className="mid">
              <div className="payee">{tx.payee}</div>
              <div className="meta"><span>{dateTime(tx.date_time)}</span><span className="badge pending">Pending</span></div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <b className="num">{rupees(tx.amount)}</b>
              {tx.upi_id && <button className="ghost" onClick={() => showQr(tx)}>QR</button>}
              <button className="primary" onClick={() => resolve(tx, true)} aria-label={`Yes, ${tx.payee} went through`}>Yes</button>
              <button onClick={() => resolve(tx, false)} aria-label={`No, cancel ${tx.payee}`}>No</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
