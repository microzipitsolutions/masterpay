import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import api from "../../api";
import {
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Logo from "../Logo";

function SubMenu({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-gray-800 hover:bg-gray-50 font-semibold"
      >
        <span className="whitespace-nowrap">{title}</span>
        {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
      </button>

      {open && <div className="ml-7 mt-1 space-y-1">{children}</div>}
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
    <aside className="w-[280px] h-full min-h-screen bg-white border-r border-gray-200 p-5 overflow-y-auto">
      <div className="mb-6">
        <Logo />
      </div>

      <p className="text-xs text-gray-400 mb-4">MENU</p>

      <nav className="space-y-1 text-sm">
        <NavLink
          to="/merchant-dashboard"
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

        <SubMenu title="PayIn">
          <MenuLink to="/merchant/payin/create">Create</MenuLink>
        </SubMenu>

        <SubMenu title="Transactions">
          <MenuLink to="/merchant/transactions">List</MenuLink>
        </SubMenu>

        <SubMenu title="Withdrawals">
          <MenuLink to="/merchant/withdrawals">List & Create</MenuLink>
        </SubMenu>

        <SubMenu title="Settlement Accounts">
          <MenuLink to="/merchant/settlement-accounts">List</MenuLink>
          <MenuLink to="/merchant/settlement-accounts/create">Create</MenuLink>
        </SubMenu>

        <SubMenu title="Settlement Transactions">
          <MenuLink to="/merchant/settlement-transactions">List</MenuLink>
        </SubMenu>

        <SubMenu title="Support">
          <MenuLink to="/merchant/tickets">Tickets</MenuLink>
        </SubMenu>

        <SubMenu title="Reports">
          <MenuLink to="/merchant/daily-report">Daily Report</MenuLink>
        </SubMenu>

        <SubMenu title="Developer">
          <MenuLink to="/merchant-api-docs">API Documentation</MenuLink>
          <MenuLink to="/merchant/sandbox">API Sandbox (PayIn)</MenuLink>
          <MenuLink to="/merchant/withdrawal-sandbox">Withdrawal Sandbox</MenuLink>
        </SubMenu>

        {/* TEST MODE — shown only when backend confirms enabled for this client */}
        {showMpTest && (
          <NavLink
            to="/merchant/masterpay-test"
            className={({ isActive }) =>
              `flex items-center rounded-xl px-4 py-3 font-semibold transition-all ${
                isActive
                  ? "bg-[#eef3fb] text-[#2B7DE9]"
                  : "text-gray-700 hover:bg-[#eef3fb] hover:text-[#2B7DE9]"
              }`
            }
          >
            Test Mode
          </NavLink>
        )}
      </nav>
    </aside>
  );
}

export default MerchantSidebar;
