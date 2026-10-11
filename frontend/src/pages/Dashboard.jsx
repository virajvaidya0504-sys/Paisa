import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarList, ChartTip, ErrorBox, PageHead, Skeleton, TxRow } from "../components/Common";
import FilterBar from "../components/FilterBar";
import Heatmap from "../components/Heatmap";
import Icon from "../components/Icon";
import { EMPTY_FILTERS, toParams } from "../filters";
import { METHODS, periodLabel, rupees, rupeesShort, rupeesWhole, ymd } from "../format";
import { reducedMotion, useApi, useCountUp, useTags } from "../hooks";
import { useChartColors } from "../theme";

// ---- date helpers (all "YYYY-MM-DD" strings, parsed at noon so DST can't shift the day) ----
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const monthEnd = (y, m) => ymd(new Date(y, m, 0, 12)); // m is 1-based; day 0 of next month

const today = new Date();
const MODES = { day: "Day", month: "Month", year: "Year", custom: "Custom", all: "All time" };

/** Period picker state -> [from, to] ("" = unbounded). */
function rangeFor(p) {
  if (p.mode === "day") return [p.day, p.day];
  if (p.mode === "month") { const [y, m] = p.month.split("-").map(Number); return [`${p.month}-01`, monthEnd(y, m)]; }
  if (p.mode === "year") return [`${p.year}-01-01`, `${p.year}-12-31`];
  if (p.mode === "custom") return [p.from, p.to];
  return ["", ""];
}

/** The period just before this one, for the "vs previous" comparison. */
function previousRange(p, [from, to]) {
  if (p.mode === "day") return [addDays(from, -1), addDays(from, -1)];
  if (p.mode === "month") {
    const d = parse(from); d.setMonth(d.getMonth() - 1);
    return [ymd(d), monthEnd(d.getFullYear(), d.getMonth() + 1)];
  }
  if (p.mode === "year") return [`${+p.year - 1}-01-01`, `${+p.year - 1}-12-31`];
  if (p.mode === "custom" && from && to) {
    const len = Math.round((parse(to) - parse(from)) / 864e5) + 1;
    return [addDays(from, -len), addDays(from, -1)];
  }
  return null;
}

function granularityFor(p, [from, to]) {
  if (p.mode === "year" || p.mode === "all") return "month";
  if (p.mode === "custom" && from && to && (parse(to) - parse(from)) / 864e5 > 62) return "month";
  return "day";
}

function Delta({ now, before, goodWhenDown }) {
  if (before == null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <div className="delta faint">same as previous period</div>;
  const good = goodWhenDown ? pct < 0 : pct > 0;
  return (
    <div className={`delta row ${good ? "received" : "spent"}`} style={{ gap: 4 }}>
      <Icon name={pct > 0 ? "up" : "down"} size={14} /> {Math.abs(pct)}% <span className="faint">vs previous period</span>
    </div>
  );
}

function Stat({ label, value, tone, children }) {
  const shown = useCountUp(value);
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      {value != null ? <div className={`value ${tone ?? ""}`}>{rupeesWhole(shown)}</div> : <Skeleton height={36} />}
      {children}
    </div>
  );
}

export default function Dashboard() {
  const colors = useChartColors();
  const [period, setPeriod] = useState({
    mode: "month", month: ymd(today).slice(0, 7), day: ymd(today), year: String(today.getFullYear()),
    from: addDays(ymd(today), -29), to: ymd(today),
  });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [series, setSeries] = useState("spent"); // salary credits would dwarf daily spending, so start with spent only
  const tags = useTags();

  const [from, to] = rangeFor(period);
  const prev = previousRange(period, [from, to]);
  const extra = useMemo(() => toParams(filters), [filters]); // everything except dates
  const q = { ...extra, date_from: from, date_to: to };
  const gran = granularityFor(period, [from, to]);

  const summary = useApi("/reports/summary", q);
  const before = useApi("/reports/summary", prev ? { ...extra, date_from: prev[0], date_to: prev[1] } : {}, !!prev);
  const trend = useApi("/reports/trend", { ...q, granularity: gran }, period.mode !== "day");
  const byTag = useApi("/reports/breakdown", { ...q, by: "tag", limit: 12 });
  const byPayee = useApi("/reports/breakdown", { ...q, by: "payee", limit: 8 });
  const byMethod = useApi("/reports/breakdown", { ...q, by: "method" });
  const dayTx = useApi("/transactions", { ...q, limit: 50 }, period.mode === "day");
  const budgets = useApi("/budgets");

  // Month-over-month and the heatmap look at fixed recent windows, so they ignore the period picker.
  const monthsFrom = ymd(new Date(today.getFullYear(), today.getMonth() - 5, 1, 12));
  const mom = useApi("/reports/trend", { ...extra, granularity: "month", date_from: monthsFrom, date_to: ymd(today) });
  const heat = useApi("/reports/trend", { ...extra, granularity: "day", date_from: addDays(ymd(today), -181), date_to: ymd(today) });

  const s = summary.data;
  const setP = (patch) => setPeriod({ ...period, ...patch });
  const anyError = summary.error || byTag.error || trend.error || mom.error;
  const alerts = (budgets.data?.items ?? []).filter((b) => b.level !== "ok");

  const m = mom.data ?? [];
  const cur = m[m.length - 1], last = m[m.length - 2];
  const anim = !reducedMotion();
  const axis = { fontSize: 11, fill: colors.axis, tickLine: false, axisLine: false };

  return (
    <div className="stack">
      <PageHead eyebrow="Overview" title="Where your money went" />
      <ErrorBox error={anyError} />

      {alerts.length > 0 && (
        <Link to="/budgets" className="card row between" style={{ textDecoration: "none", color: "inherit", borderColor: "var(--warn)" }}>
          <span className="row" style={{ gap: 10 }}>
            <span style={{ color: "var(--warn)" }}><Icon name="alert" /></span>
            <span><b>{alerts.map((a) => a.tag_name).join(", ")}</b> {alerts.some((a) => a.level === "over") ? "over or near" : "near"} this month's budget</span>
          </span>
          <Icon name="arrow" size={18} />
        </Link>
      )}

      <div className="card stack">
        <div className="seg" role="group" aria-label="Period">
          {Object.entries(MODES).map(([k, v]) => (
            <button key={k} className={period.mode === k ? "on" : ""} onClick={() => setP({ mode: k })}>{v}</button>
          ))}
        </div>
        <div className="row">
          {period.mode === "day" && <input type="date" value={period.day} max={ymd(today)} onChange={(e) => e.target.value && setP({ day: e.target.value })} aria-label="Day" style={{ maxWidth: 190 }} />}
          {period.mode === "month" && <input type="month" value={period.month} onChange={(e) => e.target.value && setP({ month: e.target.value })} aria-label="Month" style={{ maxWidth: 190 }} />}
          {period.mode === "year" && <input type="number" min="2000" max="2100" value={period.year} onChange={(e) => e.target.value.length === 4 && setP({ year: e.target.value })} aria-label="Year" style={{ maxWidth: 120 }} />}
          {period.mode === "custom" && (
            <>
              <input type="date" value={period.from} onChange={(e) => setP({ from: e.target.value })} aria-label="From" style={{ maxWidth: 170 }} />
              <span className="muted">to</span>
              <input type="date" value={period.to} onChange={(e) => setP({ to: e.target.value })} aria-label="To" style={{ maxWidth: 170 }} />
            </>
          )}
          {period.mode === "all" && <span className="muted small">Everything recorded</span>}
        </div>
      </div>

      <FilterBar value={filters} onChange={setFilters} tags={tags.data ?? []} showDates={false} />

      <div className="grid stats">
        <Stat label="Spent" value={s?.spent} tone="spent">
          {s && before.data && <Delta now={s.spent} before={before.data.spent} goodWhenDown />}
        </Stat>
        <Stat label="Received" value={s?.received} tone="received">
          {s && before.data && <Delta now={s.received} before={before.data.received} />}
        </Stat>
        <Stat label="Net" value={s?.net} tone={s && s.net < 0 ? "spent" : "received"}>
          {s && <div className="delta faint">{s.count} transactions</div>}
        </Stat>
      </div>

      {period.mode === "day" ? (
        <div className="card flush">
          <h2 style={{ padding: "18px 18px 0" }}>Transactions on {period.day}</h2>
          {dayTx.data?.items.length ? dayTx.data.items.map((t) => <TxRow key={t.id} tx={t} onClick={() => {}} />)
            : <div className="empty">Nothing on this day</div>}
        </div>
      ) : (
        <div className="card">
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>{gran === "day" ? "Daily" : "Monthly"} trend</h2>
            <div className="seg sm" role="group" aria-label="Show">
              {[["spent", "Spent"], ["received", "Received"], ["both", "Both"]].map(([k, l]) => (
                <button key={k} className={series === k ? "on" : ""} onClick={() => setSeries(k)}>{l}</button>
              ))}
            </div>
          </div>
          {trend.data ? (
            <div className="chart">
              <ResponsiveContainer>
                <BarChart data={trend.data} margin={{ left: 0, right: 8, top: 4 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke={colors.grid} />
                  <XAxis dataKey="period" tickFormatter={periodLabel} minTickGap={14} {...axis} />
                  <YAxis tickFormatter={rupeesShort} width={52} {...axis} />
                  <Tooltip cursor={{ fill: colors.grid }} content={<ChartTip labelFormat={periodLabel} />} />
                  {series !== "received" && <Bar isAnimationActive={anim} dataKey="spent" name="Spent" fill={colors.spent} radius={[4, 4, 0, 0]} />}
                  {series !== "spent" && <Bar isAnimationActive={anim} dataKey="received" name="Received" fill={colors.received} radius={[4, 4, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Skeleton height={270} />}
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h2>Spend by tag</h2>
          {byTag.data?.length ? (
            <div className="stack">
              <div className="chart" style={{ height: 210 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie isAnimationActive={anim} data={byTag.data} dataKey="total" nameKey="label" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
                      {byTag.data.map((d) => <Cell key={d.label} fill={d.color} fillOpacity={0.78} />)}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <BarList items={byTag.data} />
            </div>
          ) : byTag.data ? <div className="empty">No spending in this period</div> : <Skeleton height={300} />}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Top payees</h2>
            {byPayee.data ? <BarList items={byPayee.data.map((p) => ({ ...p, color: colors.accent }))} /> : <Skeleton />}
          </div>
          <div className="card">
            <h2>By payment method</h2>
            {byMethod.data ? <BarList items={byMethod.data.map((p) => ({ ...p, color: colors.gold }))} formatLabel={(l) => METHODS[l] ?? l} /> : <Skeleton height={80} />}
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Month over month</h2>
          {m.length ? (
            <>
              <div className="chart" style={{ height: 210 }}>
                <ResponsiveContainer>
                  <BarChart data={m} margin={{ left: 0, right: 8, top: 4 }}>
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="period" tickFormatter={periodLabel} {...axis} />
                    <YAxis tickFormatter={rupeesShort} width={52} {...axis} />
                    <Tooltip cursor={{ fill: colors.grid }} content={<ChartTip labelFormat={periodLabel} />} />
                    <Bar isAnimationActive={anim} dataKey="spent" name="Spent" fill={colors.gold} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {cur && last && last.spent > 0 && (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  {periodLabel(cur.period)} so far: <b className="num">{rupeesWhole(cur.spent)}</b> vs {periodLabel(last.period)}: <b className="num">{rupeesWhole(last.spent)}</b> (full month).
                </p>
              )}
            </>
          ) : <Skeleton height={210} />}
        </div>

        <div className="card">
          <h2>Daily spend · last 6 months</h2>
          {heat.data ? <Heatmap days={heat.data} /> : <Skeleton height={140} />}
        </div>
      </div>
    </div>
  );
}
