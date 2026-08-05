import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";

// Shared navy sidebar chrome used by all 4 panels (Admin/Agent/Merchant/Super
// Admin). Each panel keeps its own route list/conditionals (test-mode flags,
// role checks, etc.) in its own Sidebar file — these are pure presentational
// primitives so the visual language stays identical everywhere.

export function SidebarShell({ children, className = "" }) {
  return (
    <aside className={`flex h-full min-h-screen w-[280px] flex-col overflow-y-auto bg-navy-900 p-5 text-white ${className}`}>
      {children}
    </aside>
  );
}

export function SidebarTopLink({ to, icon: Icon, children, end = true }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-control px-4 py-3 text-sm font-semibold transition ${
          isActive
            ? "brand-gradient text-white shadow-[0_4px_14px_rgba(30,136,255,0.35)]"
            : "text-white/70 hover:bg-white/10 hover:text-white"
        }`
      }
    >
      {Icon && <Icon size={18} />}
      {children}
    </NavLink>
  );
}

export function SidebarSection({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-control px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
      >
        <span className="flex items-center gap-3">
          {Icon && <Icon size={17} className="text-white/45" />}
          {title}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">{children}</div>}
    </div>
  );
}

export function SidebarSubSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="ml-3 mt-1 space-y-1">{children}</div>}
    </div>
  );
}

export function SidebarLink({ to, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-2 text-sm transition ${
          isActive ? "bg-white/10 font-semibold text-brand-teal" : "text-white/60 hover:bg-white/5 hover:text-white"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function SidebarLabel({ children }) {
  return <p className="mb-3 px-1 text-[11px] font-bold uppercase tracking-widest text-white/35">{children}</p>;
}
