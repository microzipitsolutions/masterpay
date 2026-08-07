import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Settings,
  ReceiptText,
  FlaskConical,
  Wallet,
  Store,
} from "lucide-react";
import Logo from "../Logo";
import api from "../../api";
import {
  SidebarShell,
  SidebarTopLink,
  SidebarSection,
  SidebarSubSection,
  SidebarLink,
  SidebarLabel,
} from "../ui/SidebarShell";

function AgentSidebar() {
  // TEST MODE — visibility driven by backend only.
  // GET /api/masterpay-test/status checks clients.test_mode_enabled from DB.
  const [showMpTest, setShowMpTest] = useState(false);
  useEffect(() => {
    api.get("/api/masterpay-test/status")
      .then(r => { if (r.data?.enabled) setShowMpTest(true); })
      .catch(() => {});
  }, []);

  return (
    <SidebarShell>
      <div className="mb-6 pb-5 border-b border-white/10">
        <Logo variant="dark" />
      </div>
      <SidebarLabel>Menu</SidebarLabel>

      <nav className="space-y-2 text-sm">
        <SidebarTopLink to="/agent-dashboard" icon={LayoutDashboard}>
          Dashboard
        </SidebarTopLink>
        <SidebarTopLink to="/agent/external-merchants" icon={Store}>Pay-In Requests</SidebarTopLink>

        {/* Wallet */}
        <SidebarSection icon={Wallet} title="Wallet" defaultOpen={true}>
          <SidebarLink to="/agent/wallet/top-up">Top Up Funds</SidebarLink>
          <SidebarLink to="/agent/wallet/history">Top-Up History</SidebarLink>
        </SidebarSection>

        {/* Configurations */}
        <SidebarSection icon={Settings} title="Configurations" defaultOpen={true}>
          <SidebarSubSection title="Accounts" defaultOpen={true}>
            <SidebarLink to="/agent/accounts">Accounts</SidebarLink>
            <SidebarLink to="/agent/settlement-accounts">Settlement Accounts</SidebarLink>
          </SidebarSubSection>
        </SidebarSection>

        {/* Transactions */}
        <SidebarSection icon={ReceiptText} title="Transactions" defaultOpen={true}>
          <SidebarSubSection title="Transactions" defaultOpen={true}>
            <SidebarLink to="/agent/transactions">Transactions</SidebarLink>
          </SidebarSubSection>

          <SidebarSubSection title="Settlement" defaultOpen={true}>
            <SidebarLink to="/agent/settlement/create">
              Create Settlement
            </SidebarLink>
            <SidebarLink to="/agent/settlement-transactions">
              Settlement Transactions
            </SidebarLink>
          </SidebarSubSection>

          <SidebarSubSection title="Payment Proof" defaultOpen={true}>
            <SidebarLink to="/agent/payment-proof/create">Create</SidebarLink>
            <SidebarLink to="/agent/transaction-payment-proof">List</SidebarLink>
          </SidebarSubSection>

          <SidebarSubSection title="Withdrawals" defaultOpen={false}>
            <SidebarLink to="/agent/withdrawals">List</SidebarLink>
          </SidebarSubSection>

          <SidebarSubSection title="Reports" defaultOpen={false}>
            <SidebarLink to="/agent/daily-report">Daily Report</SidebarLink>
          </SidebarSubSection>

          <SidebarSubSection title="Tracking" defaultOpen={true}>
            <SidebarLink to="/agent/balance-tracking">Balance Tracking</SidebarLink>
          </SidebarSubSection>
        </SidebarSection>

        {/* TEST MODE — shown only when backend confirms enabled for this client */}
        {showMpTest && (
          <SidebarTopLink to="/agent/masterpay-test" icon={FlaskConical}>
            Test Mode
          </SidebarTopLink>
        )}
      </nav>
    </SidebarShell>
  );
}

export default AgentSidebar;
