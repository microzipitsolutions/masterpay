import { useNavigate } from "react-router-dom";
import { clearSession, getCurrentSession } from "../../api";
import { TopbarShell, UserChip, LogoutButton } from "../ui/TopbarShell";

function AgentTopbar({ sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const session = getCurrentSession();

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <TopbarShell
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      right={
        <>
          <UserChip username={session.username || "Agent"} role={session.role || "agent"} />
          <LogoutButton onClick={handleLogout} />
        </>
      }
    />
  );
}

export default AgentTopbar;
