import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getCurrentSession, roleHomePath } from "./api";

import Sidebar from "./components/Sidebar";
import AdminTopbar from "./components/AdminTopbar";
import WalletBalanceAlert from "./components/WalletBalanceAlert";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import CreateAgent from "./pages/CreateAgent";
import Merchants from "./pages/Merchants";
import CreateMerchant from "./pages/CreateMerchant";
import Users from "./pages/Users";

import ApiDocumentationmerchant from "./pages/merchant/ApiDocumentationmerchant";

import PayinTransactionList from "./pages/PayinTransactionList";
import SettlementAccountsList from "./pages/SettlementAccountsList";
import AgentAccountsList from "./pages/AgentAccountsList";
import SettlementTransactionsList from "./pages/SettlementTransactionsList";
import AdminCreateSettlement from "./pages/CreateSettlement";
import TransactionsPaymentProofList from "./pages/TransactionsPaymentProofList";

import MerchantDashboard from "./pages/merchant/MerchantDashboard";
import MerchantSettlementAccounts from "./pages/merchant/SettlementAccounts";
import CreateSettlementAccount from "./pages/merchant/CreateSettlementAccount";
import MerchantSettlementTransactions from "./pages/merchant/SettlementTransactions";
import MerchantTransactions from "./pages/merchant/Transactions";
import MerchantTickets from "./pages/merchant/Tickets";
import MerchantCreatePayin from "./pages/merchant/CreatePayin";

import AgentDashboard from "./pages/agent/AgentDashboard";
import AgentAccounts from "./pages/agent/Accounts";
import AgentSettlementAccounts from "./pages/agent/SettlementAccounts";
import AgentTransactions from "./pages/agent/Transactions";
import AgentCreateSettlement from "./pages/agent/CreateSettlement";
import AgentSettlementTransactions from "./pages/agent/SettlementTransactions";
import TransactionPaymentProof from "./pages/agent/TransactionPaymentProof";
import AgentCreatePaymentProof from "./pages/agent/CreatePaymentProof";
import AgentTopUpWallet from "./pages/agent/TopUpWallet";
import AgentTopUpHistory from "./pages/agent/TopUpHistory";
import AgentMasterPayTest from "./pages/agent/MasterPayTest";
import ApproveAgentSettlements from "./pages/ApproveAgentSettlements";

import LoginActivity from "./pages/LoginActivity";
import BalanceTracking from "./pages/BalanceTracking";
import MerchantBalanceTracking from "./pages/merchant/BalanceTracking";
import AgentBalanceTracking from "./pages/agent/BalanceTracking";
import AgentTopupApprovals from "./pages/AgentTopupApprovals";
import CompanyWalletConfig from "./pages/CompanyWalletConfig";
import AdminLedger from "./pages/AdminLedger";
import SuperAdminLayout from "./layouts/SuperAdminLayout";
import SuperAdminAgentTopups from "./pages/superadmin/AgentTopups";
import SuperAdminAgentAccounts from "./pages/superadmin/AgentAccounts";
import SuperAdminCompanyWalletConfigs from "./pages/superadmin/CompanyWalletConfigs";
import HierarchyOverviewPage from "./pages/superadmin/HierarchyOverviewPage";
import MaintenanceMode from "./pages/superadmin/MaintenanceMode";
import AlertSettings from "./pages/superadmin/AlertSettings";

import TransactionBeepNotifier from "./components/TransactionBeepNotifier";
import Tickets from "./pages/Tickets";
import Checkout from "./pages/checkout/Checkout";
import HowItWorks from "./pages/HowItWorks";
import SuperAdminDashboard from "./pages/superadmin/SuperAdminDashboard";
import SuperAdminsList from "./pages/superadmin/AdminsList";
import ClientsList from "./pages/superadmin/ClientsList";
import CreateClient from "./pages/superadmin/CreateClient";
import EditClient from "./pages/superadmin/EditClient";
import SuperAdminWithdrawals from "./pages/superadmin/Withdrawals";
import WithdrawalConfigs from "./pages/WithdrawalConfigs";
import WithdrawalTransactions from "./pages/WithdrawalTransactions";
import WithdrawalLogs from "./pages/WithdrawalLogs";
import DomainConfig from "./pages/admin/DomainConfig";
import MerchantWithdrawals from "./pages/merchant/Withdrawals";
import MerchantSandbox from "./pages/merchant/Sandbox";
import MerchantWithdrawalSandbox from "./pages/merchant/WithdrawalSandbox";
// TEST MODE — per-client sandbox
import MasterPayTestMode from "./pages/merchant/MasterPayTestMode";
import MasterPayTestAdmin from "./pages/admin/MasterPayTestAdmin";
import AgentWithdrawals from "./pages/agent/Withdrawals";
import DailyReportContent from "./pages/DailyReportContent";
import MerchantDailyReport from "./pages/merchant/DailyReport";
import AgentDailyReport from "./pages/agent/DailyReport";

function ProtectedLayout() {
  const session = getCurrentSession();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [location.pathname]);

  if (!session.token) {
    return <Navigate to="/login" replace />;
  }

  if (session.role && session.role !== "admin") {
    return <Navigate to={roleHomePath(session.role)} replace />;
  }

  return (
    <div className="min-h-screen bg-white flex overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-navy-900/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: overlay on mobile, inline on desktop */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-40 w-[280px]",
          "md:static md:z-auto md:w-auto md:inset-auto",
          "transition-transform duration-300 ease-in-out",
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0 md:hidden",
        ].join(" ")}
      >
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <AdminTopbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <TransactionBeepNotifier />
        <WalletBalanceAlert />

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />

            <Route path="/agent-topups" element={<AgentTopupApprovals />} />
            <Route path="/company-wallet-config" element={<CompanyWalletConfig />} />
            <Route path="/admin-ledger" element={<AdminLedger />} />

            <Route path="/withdrawal/configs" element={<WithdrawalConfigs />} />
            <Route path="/withdrawal/transactions" element={<WithdrawalTransactions />} />
            <Route path="/withdrawal/logs" element={<WithdrawalLogs />} />
            <Route path="/daily-report" element={<DailyReportContent />} />

            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/create" element={<CreateAgent />} />

            <Route path="/merchants" element={<Merchants />} />
            <Route path="/merchants/create" element={<CreateMerchant />} />

            <Route path="/users" element={<Users />} />

            <Route
              path="/payin-transactions"
              element={<PayinTransactionList />}
            />

            <Route
              path="/settlement-accounts"
              element={<SettlementAccountsList />}
            />

            <Route
              path="/agent-accounts"
              element={<AgentAccountsList />}
            />

            <Route
              path="/settlement-transactions"
              element={<SettlementTransactionsList />}
            />

            <Route
              path="/settlement/create"
              element={<AdminCreateSettlement />}
            />

            <Route
              path="/approve-agent-settlements"
              element={<ApproveAgentSettlements />}
            />

            <Route
              path="/transactions-payment-proof"
              element={<TransactionsPaymentProofList />}
            />

            <Route
              path="/login-activity"
              element={<LoginActivity />}
            />

            <Route
              path="/balance-tracking"
              element={<BalanceTracking />}
            />

            <Route
              path="/tickets"
              element={<Tickets />}
            />

            <Route
              path="/domain-config"
              element={<DomainConfig />}
            />

            {/* TEST MODE — admin panel */}
            <Route
              path="/masterpay-test"
              element={<MasterPayTestAdmin />}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function ProtectedUserRoute({ children, allowedRoles = [] }) {
  const session = getCurrentSession();

  if (!session.token) {
    return <Navigate to="/login" replace />;
  }

  const viewAs = JSON.parse(
    localStorage.getItem("rdpay_view_as") || "{}"
  );

  const effectiveRole = viewAs?.role || session.role;

  if (
    allowedRoles.length &&
    !allowedRoles.includes(effectiveRole) &&
    session.role !== "admin"
  ) {
    return <Navigate to={roleHomePath(session.role)} replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Public hosted checkout (customer-facing, no auth) */}
      <Route path="/checkout/:ref" element={<Checkout />} />

      {/* Test mode hosted checkout — same page, isolated test backend */}
      <Route path="/test/checkout/:ref" element={<Checkout basePath="/api/test/checkout" />} />

      {/* Public documentation page (no auth) */}
      <Route path="/how-it-works" element={<HowItWorks />} />

      {/* Super Admin */}
      <Route
        path="/superadmin-dashboard"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <SuperAdminDashboard />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/admins"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <SuperAdminsList />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/clients"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <ClientsList />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/clients/create"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <CreateClient />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/clients/:id/edit"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <EditClient />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/withdrawals"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <SuperAdminWithdrawals />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/agent-topups"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <SuperAdminAgentTopups />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/agent-accounts"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <SuperAdminAgentAccounts />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/company-wallet-configs"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <SuperAdminCompanyWalletConfigs />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/admin-ledger"
        element={<ProtectedUserRoute allowedRoles={["super-admin"]}><SuperAdminLayout><AdminLedger /></SuperAdminLayout></ProtectedUserRoute>}
      />
      <Route
        path="/superadmin/hierarchy"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <HierarchyOverviewPage />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/maintenance"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <MaintenanceMode />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/superadmin/alerts"
        element={
          <ProtectedUserRoute allowedRoles={["super-admin"]}>
            <AlertSettings />
          </ProtectedUserRoute>
        }
      />

      {/* Withdrawal — per role */}
      <Route
        path="/merchant/withdrawals"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantWithdrawals />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/agent/withdrawals"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentWithdrawals />
          </ProtectedUserRoute>
        }
      />

      {/* Daily Report — per role */}
      <Route
        path="/merchant/daily-report"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantDailyReport />
          </ProtectedUserRoute>
        }
      />
      <Route
        path="/agent/daily-report"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentDailyReport />
          </ProtectedUserRoute>
        }
      />

      {/* Agent side */}

      <Route
        path="/agent-dashboard"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentDashboard />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/accounts"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentAccounts />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/settlement-accounts"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentSettlementAccounts />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/transactions"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentTransactions />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/settlement-transactions"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentSettlementTransactions />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/settlement/create"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentCreateSettlement />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/transaction-payment-proof"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <TransactionPaymentProof />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/payment-proof/create"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentCreatePaymentProof />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/wallet/top-up"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentTopUpWallet />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/wallet/history"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentTopUpHistory />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/agent/balance-tracking"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentBalanceTracking />
          </ProtectedUserRoute>
        }
      />

      {/* TEST MODE — agent panel */}
      <Route
        path="/agent/masterpay-test"
        element={
          <ProtectedUserRoute allowedRoles={["agent"]}>
            <AgentMasterPayTest />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant-api-docs"
        element={<ApiDocumentationmerchant />}
      />

      {/* Merchant side */}

      <Route
        path="/merchant-dashboard"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantDashboard />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/payin/create"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantCreatePayin />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/settlement-accounts"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantSettlementAccounts />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/settlement-accounts/create"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <CreateSettlementAccount />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/settlement-transactions"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantSettlementTransactions />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/transactions"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantTransactions />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/balance-tracking"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantBalanceTracking />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/tickets"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantTickets />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/sandbox"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantSandbox />
          </ProtectedUserRoute>
        }
      />

      <Route
        path="/merchant/withdrawal-sandbox"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MerchantWithdrawalSandbox />
          </ProtectedUserRoute>
        }
      />

      {/* TEST MODE — merchant panel */}
      <Route
        path="/merchant/masterpay-test"
        element={
          <ProtectedUserRoute allowedRoles={["merchant"]}>
            <MasterPayTestMode />
          </ProtectedUserRoute>
        }
      />

      {/* Admin side */}

      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}

export default App;
