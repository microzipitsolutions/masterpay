import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Settings,
  ChevronDown,
  ChevronRight,
  ReceiptText,
  FlaskConical,
  Wallet,
} from "lucide-react";
import Logo from "../Logo";
import api from "../../api";

function MenuSection({ icon: Icon, title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-gray-800 hover:bg-gray-50 font-semibold"
      >
        <span className="flex items-center gap-3">
          {Icon && <Icon size={18} className="text-gray-500" />}
          {title}
        </span>
        {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
      </button>
      {open && <div className="ml-7 mt-1 space-y-1">{children}</div>}
    </div>
  );
}

function SubMenu({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-gray-800 hover:bg-gray-50 font-semibold"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open && <div className="ml-4 mt-1 space-y-1">{children}</div>}
    </div>
  );
}

function MenuLink({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg px-4 py-2 text-sm transition-all ${
          isActive
            ? "bg-[#eef3fb] text-[#2B7DE9] font-semibold"
            : "text-gray-600 hover:bg-[#eef3fb] hover:text-[#2B7DE9]"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

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
    <aside className="w-[280px] h-full min-h-screen bg-white border-r border-gray-200 p-5 overflow-y-auto">
      <div className="mb-6">
  <Logo />
</div>
      <p className="text-xs text-gray-400 mb-4">MENU</p>

      <nav className="space-y-2 text-sm">
        <NavLink
          to="/agent-dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition-all ${
              isActive
                ? "bg-[#eef3fb] text-[#2B7DE9]"
                : "text-gray-700 hover:bg-[#eef3fb] hover:text-[#2B7DE9]"
            }`
          }
        >
          <LayoutDashboard size={18} />
          Dashboard
        </NavLink>

        {/* Wallet */}
        <MenuSection icon={Wallet} title="Wallet" defaultOpen={true}>
          <MenuLink to="/agent/wallet/top-up">Top Up Funds</MenuLink>
          <MenuLink to="/agent/wallet/history">Top-Up History</MenuLink>
        </MenuSection>

        {/* Configurations */}
        <MenuSection icon={Settings} title="Configurations" defaultOpen={true}>
          <SubMenu title="Accounts" defaultOpen={true}>
            <MenuLink to="/agent/accounts">Accounts</MenuLink>
            <MenuLink to="/agent/settlement-accounts">Settlement Accounts</MenuLink>
          </SubMenu>
        </MenuSection>

        {/* Transactions */}
        <MenuSection icon={ReceiptText} title="Transactions" defaultOpen={true}>
          <SubMenu title="Transactions" defaultOpen={true}>
            <MenuLink to="/agent/transactions">Transactions</MenuLink>
          </SubMenu>

          <SubMenu title="Settlement" defaultOpen={true}>
            <MenuLink to="/agent/settlement/create">
              Create Settlement
            </MenuLink>
            <MenuLink to="/agent/settlement-transactions">
              Settlement Transactions
            </MenuLink>
          </SubMenu>

          <SubMenu title="Payment Proof" defaultOpen={true}>
            <MenuLink to="/agent/payment-proof/create">Create</MenuLink>
            <MenuLink to="/agent/transaction-payment-proof">List</MenuLink>
          </SubMenu>

          <SubMenu title="Withdrawals" defaultOpen={false}>
            <MenuLink to="/agent/withdrawals">List</MenuLink>
          </SubMenu>

          <SubMenu title="Reports" defaultOpen={false}>
            <MenuLink to="/agent/daily-report">Daily Report</MenuLink>
          </SubMenu>

          <SubMenu title="Tracking" defaultOpen={true}>
            <MenuLink to="/agent/balance-tracking">Balance Tracking</MenuLink>
          </SubMenu>
        </MenuSection>

        {/* TEST MODE — shown only when backend confirms enabled for this client */}
        {showMpTest && (
          <NavLink
            to="/agent/masterpay-test"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-3 font-semibold transition-all ${
                isActive
                  ? "bg-[#eef3fb] text-[#2B7DE9]"
                  : "text-gray-700 hover:bg-[#eef3fb] hover:text-[#2B7DE9]"
              }`
            }
          >
            <FlaskConical size={18} />
            Test Mode
          </NavLink>
        )}
      </nav>
    </aside>
  );
}

export default AgentSidebar;
