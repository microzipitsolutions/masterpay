import { Menu, UserRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearSession, getCurrentSession } from "../api";

function AdminTopbar({ sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const session = getCurrentSession();

const handleLogout = () => {
  clearSession();
  navigate("/login", { replace: true });
  window.location.reload();
};

  return (
    <header className="h-[74px] bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="h-11 w-11 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 flex-shrink-0"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-2 bg-white">
          <div className="h-8 w-8 rounded-full bg-[#eef3fb] flex items-center justify-center text-[#2B7DE9]">
            <UserRound size={18} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-gray-800">{session.username || "Admin"}</p>
            <p className="text-xs text-gray-500 capitalize">{session.role || "admin"}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-red-50 text-red-600 font-semibold flex items-center gap-2 hover:bg-red-100"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}

export default AdminTopbar;
