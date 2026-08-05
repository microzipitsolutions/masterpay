import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, LogOut, Menu, X, Building2, Banknote,
  Wallet, Landmark, Network, ChevronDown, ChevronUp, ShieldAlert, Mail,
} from "lucide-react";
import { clearSession, getCurrentSession } from "../api";
import Logo from "../components/Logo";
import AdminAlertsBell from "../components/AdminAlertsBell";
import { SidebarShell, SidebarLabel } from "../components/ui/SidebarShell";
import { TopbarShell, LogoutButton } from "../components/ui/TopbarShell";

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
      { to: "/superadmin/agent-accounts", label: "Agent Bank Details", icon: Landmark },
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
      className="flex w-full items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/35 hover:text-white/60"
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
    <div className="min-h-screen bg-white flex overflow-hidden">
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-navy-900/50 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-40 w-[280px]",
          "md:static md:z-auto md:w-auto md:inset-auto",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:hidden",
        ].join(" ")}
      >
        <SidebarShell>
          <div className="mb-4 pb-5 border-b border-white/10">
            <Logo variant="dark" />
          </div>
          <div className="mb-6 text-xs text-white/40 truncate">Super Admin · {session.username}</div>

          <nav className="flex-1 space-y-3 overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.section}>
                <SectionHeader
                  label={group.section}
                  open={openSections[group.section]}
                  onToggle={() => setOpenSections((s) => ({ ...s, [group.section]: !s[group.section] }))}
                />
                {openSections[group.section] && (
                  <div className="space-y-1 mt-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2.5 rounded-control text-sm font-semibold transition ${
                              isActive
                                ? "brand-gradient text-white shadow-[0_4px_14px_rgba(30,136,255,0.35)]"
                                : "text-white/70 hover:bg-white/10 hover:text-white"
                            }`
                          }
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
            className="mt-3 flex items-center gap-3 rounded-control px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut size={18} />
            Logout
          </button>
        </SidebarShell>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <TopbarShell
          sidebarOpen={open}
          setSidebarOpen={setOpen}
          right={
            <>
              <AdminAlertsBell />
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-sm font-semibold text-navy-900">{session.username}</div>
                <div className="text-xs text-slate-500">Super Admin</div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                {(session.username || "S").charAt(0).toUpperCase()}
              </div>
              <LogoutButton onClick={handleLogout} />
            </>
          }
        />
        <main className="flex-1 p-4 md:p-6 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}
