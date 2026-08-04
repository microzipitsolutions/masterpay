import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { clearSession, getCurrentSession } from "../api";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Logo from "./Logo";

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getCurrentSession();

  // TEST MODE — visibility is controlled by the backend only.
  // GET /api/masterpay-test/status checks clients.test_mode_enabled in the DB.
  // No client-side value is used to grant access.
  const [showMpTest, setShowMpTest] = useState(false);
  useEffect(() => {
    api.get("/api/masterpay-test/status")
      .then(r => { if (r.data?.enabled) setShowMpTest(true); })
      .catch(() => {});
  }, []);
  const hasClient =
    session.role === "admin" &&
    !!(session.userInfo?.client_id ?? session.userInfo?.clientId);

  // Top-level sections
  const [usersOpen,      setUsersOpen]      = useState(false);
  const [payinOpen,      setPayinOpen]      = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [accountsOpen,   setAccountsOpen]   = useState(false);
  const [walletOpen,     setWalletOpen]     = useState(false);
  const [reportsOpen,    setReportsOpen]    = useState(false);
  const [supportOpen,    setSupportOpen]    = useState(false);

  // Sub-sections inside Users
  const [merchantOpen,    setMerchantOpen]    = useState(false);
  const [agentOpen,       setAgentOpen]       = useState(false);

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  const linkClass = (path) =>
    `block rounded-lg px-4 py-2 transition ${
      isActive(path)
        ? "bg-[#eef3fb] font-semibold text-[#2B7DE9]"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  // Full-size header for top-level collapsible sections
  function SectionHeader({ label, open, onToggle }) {
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-xl px-4 py-3 hover:bg-gray-100"
      >
        <span className="font-medium">{label}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
    );
  }

  // Smaller header for nested sub-sections inside a parent collapsible
  function SubSectionHeader({ label, open, onToggle }) {
    return (
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
      >
        <span>{label}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
    );
  }

  return (
    <div className="flex h-full min-h-screen w-[280px] flex-col border-r border-gray-200 bg-white p-5">
      <div className="mb-6">
        <Logo />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">

        {/* Dashboard */}
        <Link
          to="/"
          className={`block rounded-xl px-4 py-3 font-medium transition ${
            isActive("/") ? "bg-[#eef3fb] text-[#2B7DE9]" : "hover:bg-gray-100"
          }`}
        >
          Dashboard
        </Link>

        {/* PayIn Transactions — promoted to top level for quick access */}
        <Link
          to="/payin-transactions"
          className={`block rounded-xl px-4 py-3 font-medium transition ${
            isActive("/payin-transactions") ? "bg-[#eef3fb] text-[#2B7DE9]" : "hover:bg-gray-100"
          }`}
        >
          PayIn Transactions
        </Link>

        {/* Balance Tracking — promoted to top level for quick access */}
        <Link
          to="/balance-tracking"
          className={`block rounded-xl px-4 py-3 font-medium transition ${
            isActive("/balance-tracking") ? "bg-[#eef3fb] text-[#2B7DE9]" : "hover:bg-gray-100"
          }`}
        >
          Balance Tracking
        </Link>

        {/* Top-Up Requests — promoted to top level for quick access */}
        <Link
          to="/agent-topups"
          className={`block rounded-xl px-4 py-3 font-medium transition ${
            isActive("/agent-topups") ? "bg-[#eef3fb] text-[#2B7DE9]" : "hover:bg-gray-100"
          }`}
        >
          Top-Up Requests
        </Link>

        {/* ── Users ─────────────────────────────────────────────
            Combines: Merchants, Agents, Users */}
        <div>
          <SectionHeader
            label="Users"
            open={usersOpen}
            onToggle={() => setUsersOpen(!usersOpen)}
          />
          {usersOpen && (
            <div className="ml-3 mt-1 space-y-1">

              {/* Merchants */}
              <div>
                <SubSectionHeader
                  label="Merchants"
                  open={merchantOpen}
                  onToggle={() => setMerchantOpen(!merchantOpen)}
                />
                {merchantOpen && (
                  <div className="ml-3 mt-1 space-y-1">
                    <Link to="/merchants"        className={linkClass("/merchants")}>Merchant List</Link>
                    <Link to="/merchants/create" className={linkClass("/merchants/create")}>Create Merchant</Link>
                  </div>
                )}
              </div>

              {/* Agents */}
              <div>
                <SubSectionHeader
                  label="Agents"
                  open={agentOpen}
                  onToggle={() => setAgentOpen(!agentOpen)}
                />
                {agentOpen && (
                  <div className="ml-3 mt-1 space-y-1">
                    <Link to="/agents"        className={linkClass("/agents")}>Agent List</Link>
                    <Link to="/agents/create" className={linkClass("/agents/create")}>Create Agent</Link>
                  </div>
                )}
              </div>

              {/* Users list */}
              <Link to="/users" className={linkClass("/users")}>Users</Link>

            </div>
          )}
        </div>

        {/* ── PayIn ─────────────────────────────────────────── */}
        <div>
          <SectionHeader
            label="PayIn"
            open={payinOpen}
            onToggle={() => setPayinOpen(!payinOpen)}
          />
          {payinOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/transactions-payment-proof" className={linkClass("/transactions-payment-proof")}>Payment Proof</Link>
            </div>
          )}
        </div>

        {/* ── Withdrawals ───────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Withdrawals"
            open={withdrawalOpen}
            onToggle={() => setWithdrawalOpen(!withdrawalOpen)}
          />
          {withdrawalOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/withdrawal/configs"      className={linkClass("/withdrawal/configs")}>Configs</Link>
              <Link to="/withdrawal/transactions" className={linkClass("/withdrawal/transactions")}>Transactions</Link>
              <Link to="/withdrawal/logs"         className={linkClass("/withdrawal/logs")}>Logs</Link>
            </div>
          )}
        </div>

        {/* ── Settlements ───────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Settlements"
            open={settlementOpen}
            onToggle={() => setSettlementOpen(!settlementOpen)}
          />
          {settlementOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/settlement-accounts"       className={linkClass("/settlement-accounts")}>Accounts</Link>
              <Link to="/settlement/create"         className={linkClass("/settlement/create")}>Create Settlement</Link>
              <Link to="/approve-agent-settlements" className={linkClass("/approve-agent-settlements")}>Approve Settlements</Link>
              <Link to="/settlement-transactions"   className={linkClass("/settlement-transactions")}>Transactions</Link>
            </div>
          )}
        </div>

        {/* ── Accounts ─────────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Accounts"
            open={accountsOpen}
            onToggle={() => setAccountsOpen(!accountsOpen)}
          />
          {accountsOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/agent-accounts" className={linkClass("/agent-accounts")}>Agent Accounts</Link>
            </div>
          )}
        </div>

        {/* ── Agent Wallet ─────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Agent Wallet"
            open={walletOpen}
            onToggle={() => setWalletOpen(!walletOpen)}
          />
          {walletOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/company-wallet-config" className={linkClass("/company-wallet-config")}>Deposit Details</Link>
              <Link to="/admin-ledger" className={linkClass("/admin-ledger")}>Admin Ledger</Link>
            </div>
          )}
        </div>

        {/* ── Reports ──────────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Reports"
            open={reportsOpen}
            onToggle={() => setReportsOpen(!reportsOpen)}
          />
          {reportsOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/daily-report" className={linkClass("/daily-report")}>Daily Report</Link>
            </div>
          )}
        </div>

        {/* ── Support ──────────────────────────────────────── */}
        <div>
          <SectionHeader
            label="Support"
            open={supportOpen}
            onToggle={() => setSupportOpen(!supportOpen)}
          />
          {supportOpen && (
            <div className="ml-3 mt-1 space-y-1">
              <Link to="/tickets"        className={linkClass("/tickets")}>Merchant Tickets</Link>
              <Link to="/login-activity" className={linkClass("/login-activity")}>Login Activity</Link>
            </div>
          )}
        </div>

        {/* ── Domain Config — only for admins with a client ─── */}
        {hasClient && (
          <Link
            to="/domain-config"
            className={`block rounded-xl px-4 py-3 font-medium transition ${
              isActive("/domain-config") ? "bg-[#eef3fb] text-[#2B7DE9]" : "hover:bg-gray-100"
            }`}
          >
            Domain Config
          </Link>
        )}

        {/* TEST MODE — shown only when backend confirms enabled for this client */}
        {showMpTest && (
          <Link
            to="/masterpay-test"
            className={`block rounded-xl px-4 py-3 font-medium transition ${
              isActive("/masterpay-test") ? "bg-[#eef3fb] text-[#2B7DE9]" : "hover:bg-gray-100"
            }`}
          >
            Test Mode
          </Link>
        )}

      </div>
    </div>
  );
}

export default Sidebar;
