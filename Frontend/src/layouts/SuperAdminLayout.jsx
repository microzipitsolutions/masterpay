import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, LogOut, Menu, X, Building2, Banknote,
  Wallet, Landmark, Network, ChevronDown, ChevronUp, ShieldAlert, Mail,
} from "lucide-react";
import { clearSession, getCurrentSession } from "../api";
import Logo from "../components/Logo";
import { useBranding } from "../context/BrandingContext";

// Grouped sidebar sections — existing routes are unchanged, just reorganized
// under clearer headings (Overview / Users & Clients / Money Movement /
// Operations / System Settings), mirroring the collapsible-section pattern
// already used in components/Sidebar.jsx (the admin sidebar).
const NAV_GROUPS = [
  {
    section: "Overview",
    items: [
      { to: "/superadmin-dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/superadmin/hierarchy", label: "Hierarchy Overview", icon: Network },
    ],
  },
  {
    section: "Users & Clients",
    items: [
      { to: "/superadmin/clients", label: "Clients", icon: Building2 },
      { to: "/superadmin/admins", label: "Admins", icon: Users },
    ],
  },
  {
    section: "Money Movement",
    items: [
      { to: "/superadmin/withdrawals", label: "Withdrawals", icon: Banknote },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/superadmin/agent-topups", label: "Agent Top-Ups", icon: Wallet },
      { to: "/superadmin/company-wallet-configs", label: "Deposit Configs", icon: Landmark },
      { to: "/superadmin/admin-ledger", label: "Admin Ledger", icon: Wallet },
    ],
  },
  {
    section: "System Settings",
    items: [
      { to: "/superadmin/maintenance", label: "Maintenance Mode", icon: ShieldAlert },
      { to: "/superadmin/alerts", label: "Email Alerts", icon: Mail },
    ],
  },
];

function SectionHeader({ label, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600"
    >
      {label}
      {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  );
}

export default function SuperAdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getCurrentSession();
  const [open, setOpen] = useState(() => window.innerWidth >= 768);
  const { theme_color } = useBranding();
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.section, true])),
  );

  useEffect(() => {
    if (window.innerWidth < 768) setOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-[280px]",
          "md:static md:z-auto md:w-auto md:inset-auto",
          "bg-white border-r border-slate-200 flex flex-col",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:hidden",
        ].join(" ")}
      >
        <div className="px-6 py-5 border-b border-slate-200">
          <Logo />
          <div className="text-xs text-slate-500 mt-2 truncate">Super Admin · {session.username}</div>
        </div>

        <nav className="flex-1 p-3 space-y-3 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.section}>
              <SectionHeader
                label={group.section}
                open={openSections[group.section]}
                onToggle={() => setOpenSections((s) => ({ ...s, [group.section]: !s[group.section] }))}
              />
              {openSections[group.section] && (
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                            isActive
                              ? "text-white"
                              : "text-slate-700 hover:bg-slate-100"
                          }`
                        }
                        style={({ isActive }) => isActive ? { backgroundColor: theme_color } : {}}
                        onClick={() => window.innerWidth < 768 && setOpen(false)}
                      >
                        <Icon size={18} />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="m-3 flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setOpen(!open)} className="p-2 rounded-lg hover:bg-slate-100">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold text-slate-900">{session.username}</div>
              <div className="text-xs text-slate-500">Super Admin</div>
            </div>
            <div
              className="w-9 h-9 rounded-full text-white flex items-center justify-center font-bold text-sm"
              style={{ backgroundColor: theme_color }}
            >
              {(session.username || "S").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
