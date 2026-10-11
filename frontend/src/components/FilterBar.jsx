import { useState } from "react";
import { countActive, EMPTY_FILTERS } from "../filters";
import { METHODS } from "../format";
import Icon from "./Icon";

const Field = ({ label, children }) => <label className="field">{label}{children}</label>;

/**
 * Search box plus a collapsible panel of filters. `showDates` is off on the
 * dashboard, where the period picker owns the dates.
 */
export default function FilterBar({ value, onChange, tags, showDates = true }) {
  const [open, setOpen] = useState(false);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const active = countActive(value, ["q", ...(showDates ? [] : ["date_from", "date_to"])]);

  return (
    <div className="card stack">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: 11, color: "var(--faint)" }}><Icon name="search" size={18} /></span>
          <input type="search" placeholder="Search payee or note…" value={value.q} onChange={set("q")}
            aria-label="Search" style={{ paddingLeft: 38 }} />
        </div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className={active ? "chip on" : ""}>
          <Icon name="sliders" size={17} /> Filters{active ? ` · ${active}` : ""}
        </button>
      </div>
      {open && (
        <>
          <div className="form-grid">
            {showDates && <Field label="From"><input type="date" value={value.date_from} onChange={set("date_from")} /></Field>}
            {showDates && <Field label="To"><input type="date" value={value.date_to} onChange={set("date_to")} /></Field>}
            <Field label="Tag">
              <select value={value.tag} onChange={set("tag")}>
                <option value="">All tags</option>
                <option value="untagged">Untagged</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Payee contains"><input value={value.payee} onChange={set("payee")} /></Field>
            <Field label="Type">
              <select value={value.type} onChange={set("type")}>
                <option value="">Spent and received</option>
                <option value="debit">Spent</option>
                <option value="credit">Received</option>
              </select>
            </Field>
            <Field label="Payment method">
              <select value={value.payment_method} onChange={set("payment_method")}>
                <option value="">Any</option>
                {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Min amount (₹)"><input type="number" min="0" value={value.min_amount} onChange={set("min_amount")} /></Field>
            <Field label="Max amount (₹)"><input type="number" min="0" value={value.max_amount} onChange={set("max_amount")} /></Field>
            {showDates && (
              <Field label="Status">
                <select value={value.status} onChange={set("status")}>
                  <option value="">Any</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                </select>
              </Field>
            )}
          </div>
          <div><button className="ghost" onClick={() => onChange(EMPTY_FILTERS)}>Clear all filters</button></div>
        </>
      )}
    </div>
  );
}
