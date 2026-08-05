import { useState, useEffect } from "react";
import api from "../../api";
import { LayoutDashboard } from "lucide-react";
import Logo from "../Logo";
import {
  SidebarShell,
  SidebarTopLink,
  SidebarSubSection,
  SidebarLink,
  SidebarLabel,
} from "../ui/SidebarShell";

function MerchantSidebar() {
  // TEST MODE — visibility is controlled by the backend only.
  // GET /api/masterpay-test/status checks clients.test_mode_enabled + merchants.is_test_merchant in the DB.
  // No localStorage or client-side value is used to grant access.
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

      <nav className="space-y-1 text-sm">
        <SidebarTopLink to="/merchant-dashboard" icon={LayoutDashboard}>
          Dashboard
        </SidebarTopLink>

        <SidebarSubSection title="PayIn">
          <SidebarLink to="/merchant/payin/create">Create</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Transactions">
          <SidebarLink to="/merchant/transactions">List</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Withdrawals">
          <SidebarLink to="/merchant/withdrawals">List & Create</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Settlement Accounts">
          <SidebarLink to="/merchant/settlement-accounts">List</SidebarLink>
          <SidebarLink to="/merchant/settlement-accounts/create">Create</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Settlement Transactions">
          <SidebarLink to="/merchant/settlement-transactions">List</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Support">
          <SidebarLink to="/merchant/tickets">Tickets</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Reports">
          <SidebarLink to="/merchant/daily-report">Daily Report</SidebarLink>
        </SidebarSubSection>

        <SidebarSubSection title="Developer">
          <SidebarLink to="/merchant-api-docs">API Documentation</SidebarLink>
          <SidebarLink to="/merchant/sandbox">API Sandbox (PayIn)</SidebarLink>
          <SidebarLink to="/merchant/withdrawal-sandbox">Withdrawal Sandbox</SidebarLink>
        </SidebarSubSection>

        {/* TEST MODE — shown only when backend confirms enabled for this client */}
        {showMpTest && (
          <SidebarTopLink to="/merchant/masterpay-test">Test Mode</SidebarTopLink>
        )}
      </nav>
    </SidebarShell>
  );
}

export default MerchantSidebar;
