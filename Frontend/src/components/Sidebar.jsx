import api, { getCurrentSession } from "../api";
import { useState, useEffect } from "react";
import Logo from "./Logo";
import {
  SidebarShell,
  SidebarTopLink,
  SidebarSection,
  SidebarSubSection,
  SidebarLink,
  SidebarLabel,
} from "./ui/SidebarShell";
import { LayoutDashboard, ArrowDownToLine, Wallet2, FlaskConical } from "lucide-react";

function Sidebar() {
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

  return (
    <SidebarShell>
      <div className="mb-6 pb-5 border-b border-white/10">
        <Logo variant="dark" />
      </div>
      <SidebarLabel>Menu</SidebarLabel>

      <div className="flex-1 space-y-2 overflow-y-auto text-sm">

        <SidebarTopLink to="/" icon={LayoutDashboard}>Dashboard</SidebarTopLink>

        {/* PayIn Transactions — promoted to top level for quick access */}
        <SidebarTopLink to="/payin-transactions" icon={ArrowDownToLine}>
          PayIn Transactions
        </SidebarTopLink>

        {/* Balance Tracking — promoted to top level for quick access */}
        <SidebarTopLink to="/balance-tracking" icon={Wallet2}>
          Balance Tracking
        </SidebarTopLink>

        {/* Top-Up Requests — promoted to top level for quick access */}
        <SidebarTopLink to="/agent-topups" icon={Wallet2}>
          Top-Up Requests
        </SidebarTopLink>

        {/* ── Users ─────────────────────────────────────────────
            Combines: Merchants, Agents, Users */}
        <SidebarSection title="Users">
          <SidebarSubSection title="Merchants">
            <SidebarLink to="/merchants" end>Merchant List</SidebarLink>
            <SidebarLink to="/merchants/create" end>Create Merchant</SidebarLink>
          </SidebarSubSection>

          <SidebarSubSection title="Agents">
            <SidebarLink to="/agents" end>Agent List</SidebarLink>
            <SidebarLink to="/agents/create" end>Create Agent</SidebarLink>
          </SidebarSubSection>

          <SidebarLink to="/users" end>Users</SidebarLink>
        </SidebarSection>

        {/* ── PayIn ─────────────────────────────────────────── */}
        <SidebarSection title="PayIn">
          <SidebarLink to="/transactions-payment-proof" end>Payment Proof</SidebarLink>
        </SidebarSection>

        {/* ── Withdrawals ───────────────────────────────────── */}
        <SidebarSection title="Withdrawals">
          <SidebarLink to="/withdrawal/configs" end>Configs</SidebarLink>
          <SidebarLink to="/withdrawal/transactions" end>Transactions</SidebarLink>
          <SidebarLink to="/withdrawal/logs" end>Logs</SidebarLink>
        </SidebarSection>

        {/* ── Settlements ───────────────────────────────────── */}
        <SidebarSection title="Settlements">
          <SidebarLink to="/settlement-accounts" end>Accounts</SidebarLink>
          <SidebarLink to="/settlement/create" end>Create Settlement</SidebarLink>
          <SidebarLink to="/approve-agent-settlements" end>Approve Settlements</SidebarLink>
          <SidebarLink to="/settlement-transactions" end>Transactions</SidebarLink>
        </SidebarSection>

        {/* ── Accounts ─────────────────────────────────────── */}
        <SidebarSection title="Accounts">
          <SidebarLink to="/agent-accounts" end>Agent Accounts</SidebarLink>
        </SidebarSection>

        {/* ── Agent Wallet ─────────────────────────────────── */}
        <SidebarSection title="Agent Wallet">
          <SidebarLink to="/company-wallet-config" end>Deposit Details</SidebarLink>
          <SidebarLink to="/admin-ledger" end>Admin Ledger</SidebarLink>
        </SidebarSection>

        {/* ── Reports ──────────────────────────────────────── */}
        <SidebarSection title="Reports">
          <SidebarLink to="/daily-report" end>Daily Report</SidebarLink>
        </SidebarSection>

        {/* ── Support ──────────────────────────────────────── */}
        <SidebarSection title="Support">
          <SidebarLink to="/tickets" end>Merchant Tickets</SidebarLink>
          <SidebarLink to="/login-activity" end>Login Activity</SidebarLink>
        </SidebarSection>

        {/* ── Domain Config — only for admins with a client ─── */}
        {hasClient && <SidebarTopLink to="/domain-config">Domain Config</SidebarTopLink>}

        {/* TEST MODE — shown only when backend confirms enabled for this client */}
        {showMpTest && (
          <SidebarTopLink to="/masterpay-test" icon={FlaskConical}>Test Mode</SidebarTopLink>
        )}

      </div>
    </SidebarShell>
  );
}

export default Sidebar;
