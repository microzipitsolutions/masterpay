import { useNavigate } from "react-router-dom";
import { clearSession, getCurrentSession } from "../api";
import AdminAlertsBell from "./AdminAlertsBell";
import { TopbarShell, UserChip, LogoutButton } from "./ui/TopbarShell";

function AdminTopbar({ sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const session = getCurrentSession();

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
    window.location.reload();
  };

  return (
    <TopbarShell
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      right={
        <>
          <AdminAlertsBell />
          <UserChip username={session.username || "Admin"} role={session.role || "admin"} />
          <LogoutButton onClick={handleLogout} />
        </>
      }
    />
  );
}

export default AdminTopbar;
