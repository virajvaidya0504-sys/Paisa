import { periodLabel, rupees } from "../format";
import { useChartColors } from "../theme";

const CELL = 14, GAP = 3, LEFT = 28, TOP = 18;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * GitHub-style calendar: one column per week (Mon-Sun), brighter = more spent that day.
 * `days` = [{period: "YYYY-MM-DD", spent}] already filled with zeros, in order.
 */
export default function Heatmap({ days }) {
  const c = useChartColors();
  if (!days?.length) return <div className="empty">No data</div>;

  // Shade by quartile of the non-zero days, so one huge day doesn't wash out the rest.
  const sorted = days.map((d) => d.spent).filter((v) => v > 0).sort((a, b) => a - b);
  const cut = [0.25, 0.5, 0.75].map((q) => sorted[Math.floor(q * (sorted.length - 1))] ?? 0);
  const level = (v) => (v <= 0 ? 0 : v <= cut[0] ? 1 : v <= cut[1] ? 2 : v <= cut[2] ? 3 : 4);

  // Monday = row 0. Parse at noon so DST changes can't move the date.
  const dow = (s) => (new Date(`${s}T12:00:00`).getDay() + 6) % 7;
  const offset = dow(days[0].period);
  const weeks = Math.ceil((offset + days.length) / 7);
  const width = LEFT + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);

  const monthMarks = [];
  days.forEach((d, i) => {
    if (d.period.slice(8) === "01" || i === 0) {
      monthMarks.push({ x: LEFT + Math.floor((offset + i) / 7) * (CELL + GAP), m: MONTHS[+d.period.slice(5, 7) - 1] });
    }
  });

  return (
    <>
      <div className="heat-scroll">
        <svg width={width} height={height} role="img" aria-label="Daily spend calendar heatmap">
          {monthMarks.map((m, i) => <text key={i} x={m.x} y={11} fontSize="10" fill={c.axis}>{m.m}</text>)}
          {["Mon", "Wed", "Fri"].map((d, i) => (
            <text key={d} x={0} y={TOP + i * 2 * (CELL + GAP) + 11} fontSize="9" fill={c.axis}>{d}</text>
          ))}
          {days.map((d, i) => {
            const idx = offset + i;
            return (
              <rect key={d.period} x={LEFT + Math.floor(idx / 7) * (CELL + GAP)} y={TOP + (idx % 7) * (CELL + GAP)}
                width={CELL} height={CELL} rx="4" fill={c.heat[level(d.spent)]}>
                <title>{periodLabel(d.period)}: {d.spent ? rupees(d.spent) : "no spend"}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="legend">Less {c.heat.map((col, i) => <i key={i} style={{ background: col }} />)} More</div>
    </>
  );
}
