import { Menu, UserRound, LogOut } from "lucide-react";

export function TopbarShell({ sidebarOpen, setSidebarOpen, right }) {
  return (
    <header className="flex h-[74px] items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-6">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control border border-slate-200 text-navy-800 transition hover:bg-slate-50"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2 sm:gap-3">{right}</div>
    </header>
  );
}

export function UserChip({ username, role }) {
  return (
    <div className="hidden items-center gap-3 rounded-control border border-slate-200 bg-white px-4 py-2 sm:flex">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-light text-brand-blue-dark">
        <UserRound size={18} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-navy-900">{username}</p>
        <p className="text-xs capitalize text-slate-500">{role}</p>
      </div>
    </div>
  );
}

export function LogoutButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-control bg-danger-bg px-3 font-semibold text-danger transition hover:brightness-95 sm:h-11 sm:px-4"
    >
      <LogOut size={18} />
      <span className="hidden sm:inline">Logout</span>
    </button>
  );
}
