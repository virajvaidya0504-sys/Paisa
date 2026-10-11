// Money and date formatting. Indian grouping: 12,34,567.00 (lakh / crore).

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inrWhole = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹1,23,456.50 */
export const rupees = (n) => inr.format(n ?? 0);

/** ₹1,23,457 (no paise, for big dashboard numbers) */
export const rupeesWhole = (n) => inrWhole.format(Math.round(n ?? 0));

/** Short form for chart axes: ₹850, ₹12k, ₹1.2 L, ₹3.4 Cr */
export function rupeesShort(n) {
  const v = Math.abs(n ?? 0);
  const sign = n < 0 ? "-" : "";
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (v >= 1e7) return `${sign}₹${trim(v / 1e7)} Cr`;
  if (v >= 1e5) return `${sign}₹${trim(v / 1e5)} L`;
  if (v >= 1e3) return `${sign}₹${trim(v / 1e3)}k`;
  return `${sign}₹${Math.round(v)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-03" -> "Mar 26", "2026-03-14" -> "14 Mar", "2026" -> "2026" */
export function periodLabel(p) {
  if (p.length === 7) return `${MONTHS[+p.slice(5, 7) - 1]} ${p.slice(2, 4)}`;
  if (p.length === 10) return `${+p.slice(8, 10)} ${MONTHS[+p.slice(5, 7) - 1]}`;
  return p;
}

/** "7:30 pm", or "" when the time is exactly midnight (imports often carry only a date). */
export function timeOf(iso) {
  if (iso.slice(11, 16) === "00:00") return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "14 Mar 2026, 7:30 pm" */
export function dateTime(iso) {
  const d = new Date(iso);
  const t = timeOf(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}${t ? `, ${t}` : ""}`;
}

// Local-time date helpers (toISOString would shift to UTC and give the wrong day).
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowInput = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Heading for a day group: Today, Yesterday, or "Mon, 6 Oct". */
export function dayHeading(isoDate) {
  const today = ymd(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (isoDate === today) return "Today";
  if (isoDate === ymd(y)) return "Yesterday";
  const d = new Date(`${isoDate}T12:00:00`);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
}

export const METHODS = { upi: "UPI", card: "Card", cash: "Cash", bank_transfer: "Bank transfer", other: "Other" };
