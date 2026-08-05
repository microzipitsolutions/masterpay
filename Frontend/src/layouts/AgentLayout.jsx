// import { useState } from "react";

// import AgentSidebar from "../components/agent/AgentSidebar";
// import AgentTopbar from "../components/agent/AgentTopbar";

// function AgentLayout({ children }) {
//   const [sidebarOpen, setSidebarOpen] = useState(true);

//   {localStorage.getItem("rdpay_role") === "admin" && (
//   <button
//     onClick={() => {
//       localStorage.removeItem("rdpay_view_as");
//       window.location.href = "/";
//     }}
//     className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
//   >
//     Back to Admin
//   </button>
// )}

//   return (
//     <div className="min-h-screen bg-white flex">
//       {sidebarOpen && <AgentSidebar />}

//       <div className="flex-1 flex flex-col">
//         <AgentTopbar
//           sidebarOpen={sidebarOpen}
//           setSidebarOpen={setSidebarOpen}
//         />

//         <main className="p-6">{children}</main>
//       </div>
//     </div>
//   );
// }

// export default AgentLayout;


import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

import AgentSidebar from "../components/agent/AgentSidebar";
import AgentTopbar from "../components/agent/AgentTopbar";
import TransactionBeepNotifier from "../components/TransactionBeepNotifier";
import AccountLimitAlert from "../components/AccountLimitAlert";

function AgentLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const location = useLocation();

  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [location.pathname]);

  const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");
  const isAdminViewing =
    localStorage.getItem("rdpay_role") === "admin" &&
    viewAs?.role;

  return (
    <div className="min-h-screen bg-white flex overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
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
        <AgentSidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <AgentTopbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
        <TransactionBeepNotifier />
        <AccountLimitAlert />

        {isAdminViewing && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-warning-bg px-4 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 font-semibold text-warning">
                👤 Viewing As
              </span>
              <span className="text-slate-500">Admin</span>
              <span className="text-slate-300">›</span>
              <span className="rounded-md bg-brand-blue-light px-3 py-1 font-semibold text-brand-blue-dark">
                {viewAs.name} · {viewAs.role?.toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("rdpay_view_as");
                window.location.href = "/";
              }}
              className="rounded-control bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Back to Admin
            </button>
          </div>
        )}

        <main className="p-4 md:p-6 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export default AgentLayout;