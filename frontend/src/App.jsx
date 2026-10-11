import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Icon from "./components/Icon";
import { Modal } from "./components/Common";
import { useApi } from "./hooks";
import { useTheme } from "./theme";
import Budgets from "./pages/Budgets";
import Dashboard from "./pages/Dashboard";
import Import from "./pages/Import";
import Inbox from "./pages/Inbox";
import Pay from "./pages/Pay";
import QuickAdd from "./pages/QuickAdd";
import Tags from "./pages/Tags";
import Transactions from "./pages/Transactions";

const ITEMS = {
  dashboard: { to: "/", label: "Dashboard", icon: "dashboard" },
  transactions: { to: "/transactions", label: "Transactions", icon: "list" },
  add: { to: "/add", label: "Quick Add", icon: "plus" },
  pay: { to: "/pay", label: "Pay", icon: "send" },
  import: { to: "/import", label: "Import", icon: "upload" },
  inbox: { to: "/inbox", label: "Untagged", icon: "inbox" },
  budgets: { to: "/budgets", label: "Budgets", icon: "target" },
  tags: { to: "/tags", label: "Tags & rules", icon: "tag" },
};
const GROUPS = [
  ["Overview", ["dashboard", "transactions"]],
  ["Capture", ["add", "pay", "import", "inbox"]],
  ["Plan", ["budgets", "tags"]],
];
const MORE = ["import", "inbox", "budgets", "tags"];

export default function App() {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  // Badge counts; `r` changes with the route so they refresh as you move around.
  const inbox = useApi("/inbox", { r: pathname });
  const pending = useApi("/transactions", { status: "pending", limit: 1, r: pathname });
  const badge = { inbox: inbox.data?.total || 0, pay: pending.data?.total || 0 };

  const link = (k, cls) => {
    const n = ITEMS[k];
    return (
      <NavLink key={k} to={n.to} end={n.to === "/"} className={({ isActive }) => `${cls ?? ""} ${isActive ? "active" : ""}`}
        onClick={() => setMoreOpen(false)}>
        <Icon name={n.icon} size={k === "add" && cls === "fab" ? 26 : 20} />
        <span>{n.label}</span>
        {badge[k] > 0 && <span className="count" aria-label={`${badge[k]} waiting`}>{badge[k] > 99 ? "99+" : badge[k]}</span>}
      </NavLink>
    );
  };

  const themeBtn = (
    <button className="ghost icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );

  return (
    <>
      <div className="ambient" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="shell">
        <nav className="side" aria-label="Main">
          <div className="brand"><div className="brand-mark">₹</div><div className="brand-name">Paisa</div></div>
          {GROUPS.map(([name, keys]) => (
            <div key={name}><div className="side-group">{name}</div>{keys.map((k) => link(k))}</div>
          ))}
          <div className="side-foot"><span>Stays on this computer</span>{themeBtn}</div>
        </nav>

        <nav className="dock" aria-label="Main">
          {link("dashboard")}
          {link("transactions")}
          {link("add", "fab")}
          {link("pay")}
          <button className="dock-btn" onClick={() => setMoreOpen(true)} aria-label="More">
            <Icon name="more" /><span>More</span>
            {badge.inbox > 0 && <span className="count">{badge.inbox}</span>}
          </button>
        </nav>

        <main className="main">
          <div className="page" key={pathname}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/add" element={<QuickAdd />} />
              <Route path="/pay" element={<Pay />} />
              <Route path="/import" element={<Import />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/tags" element={<Tags />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {moreOpen && (
        <Modal title="More" onClose={() => setMoreOpen(false)}>
          <div className="more-list">
            {MORE.map((k) => (
              <NavLink key={k} to={ITEMS[k].to} onClick={() => setMoreOpen(false)}>
                <Icon name={ITEMS[k].icon} /> <span>{ITEMS[k].label}</span>
                {badge[k] > 0 && <span className="count">{badge[k]}</span>}
              </NavLink>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 14 }}>
            <span className="muted small">Theme: {theme}</span>{themeBtn}
          </div>
        </Modal>
      )}
    </>
  );
}
