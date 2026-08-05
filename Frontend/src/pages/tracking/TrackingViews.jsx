// import { useEffect, useState } from "react";
// import api, { getCurrentSession } from "../../api";

// const money = (value) =>
//   `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// const dateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

// const maskAccount = (value) => {
//   const text = String(value || "");
//   if (!text) return "-";
//   if (text.length <= 4) return text;
//   return `${"*".repeat(Math.max(text.length - 4, 0))}${text.slice(-4)}`;
// };

// function StatCard({ title, value, color = "blue" }) {
//   const colorMap = {
//     blue: "bg-blue-50 border-blue-200 text-blue-700",
//     green: "bg-emerald-50 border-emerald-200 text-emerald-700",
//     orange: "bg-orange-50 border-orange-200 text-orange-700",
//     purple: "bg-purple-50 border-purple-200 text-purple-700",
//     red: "bg-red-50 border-red-200 text-red-700",
//     slate: "bg-slate-50 border-slate-200 text-slate-700",
//   };

//   return (
//     <div className={`rounded-2xl border p-5 shadow-sm ${colorMap[color] || colorMap.blue}`}>
//       <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">{title}</p>
//       <h2 className="text-2xl font-bold">{value}</h2>
//     </div>
//   );
// }

// export function LoginActivityView({ title = "Login Activity" }) {
//   const [rows, setRows] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [selectedBank, setSelectedBank] = useState("");
//   const [page, setPage] = useState(1);

//   const rowsPerPage = 10;
//   const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

//   const paginatedRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

//   const fetchRows = async () => {
//     try {
//       setLoading(true);
//       const res = await api.get("/api/tracking/login-activity");
//       setRows(Array.isArray(res.data) ? res.data : []);
//       setPage(1);
//     } catch (error) {
//       alert(error?.response?.data?.message || "Could not fetch login activity");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchRows();
//   }, []);

//   return (
//     <div>
//       <div className="mb-6 flex items-center justify-between">
//         <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">{title}</h1>
//         <button
//           onClick={fetchRows}
//           className="cursor-pointer rounded-xl bg-[#1E88FF] px-4 py-2 text-sm font-semibold text-white"
//         >
//           Refresh
//         </button>
//       </div>

//       <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
//         <table className="w-full text-sm">
//           <thead className="bg-gray-50 text-gray-600">
//             <tr>
//               <th className="p-3 text-left">Date & Time</th>
//               <th className="p-3 text-left">Role</th>
//               <th className="p-3 text-left">Name</th>
//               <th className="p-3 text-left">Username</th>
//               <th className="p-3 text-left">IP Address</th>
//             </tr>
//           </thead>

//           <tbody>
//             {loading ? (
//               <tr>
//                 <td className="p-4 text-center text-gray-500" colSpan="5">
//                   Loading...
//                 </td>
//               </tr>
//             ) : rows.length === 0 ? (
//               <tr>
//                 <td className="p-4 text-center text-gray-500" colSpan="5">
//                   No login activity found
//                 </td>
//               </tr>
//             ) : (
//               paginatedRows.map((row) => (
//                 <tr key={row.id} className="border-t hover:bg-gray-50">
//                   <td className="p-3">{dateTime(row.logged_in_at)}</td>
//                   <td className="p-3 capitalize">{row.role}</td>
//                   <td className="p-3">{row.name || "-"}</td>
//                   <td className="p-3">{row.username || "-"}</td>
//                   <td className="p-3">{row.ip_address || "-"}</td>
//                 </tr>
//               ))
//             )}
//           </tbody>
//         </table>

//         {!loading && rows.length > 0 && (
//           <div className="flex items-center justify-between border-t bg-white px-4 py-3">
//             <p className="text-sm text-gray-600">
//               Page {page} / {totalPages}
//             </p>

//             <div className="flex gap-2">
//               <button
//                 type="button"
//                 disabled={page === 1}
//                 onClick={() => setPage((p) => Math.max(1, p - 1))}
//                 className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
//               >
//                 Previous
//               </button>

//               <button
//                 type="button"
//                 disabled={page === totalPages}
//                 onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
//                 className="rounded-lg bg-[#1E88FF] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
//               >
//                 Next
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// export function BalanceTrackingView({ title = "Balance Tracking" }) {
//   const session = getCurrentSession();
//   const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");
  

//   const hideOwnerColumns = currentRole === "merchant";
//   const hideSettlementAccounts = currentRole === "agent";
//   const showBankDropdown = currentRole !== "merchant";

//   const [data, setData] = useState({
//     payin: {},
//     settlement: {},
//     agentAccounts: [],
//     settlementAccounts: [],
//     summary: null,
//   });

//   const [loading, setLoading] = useState(true);
//   const [selectedBank, setSelectedBank] = useState("");

//   const fetchData = async () => {
//     try {
//       setLoading(true);

//       const res = await api.get("/api/tracking/balance");

//       setData({
//         payin: res.data?.payin || {},
//         settlement: res.data?.settlement || {},
//         agentAccounts: Array.isArray(res.data?.agentAccounts)
//           ? res.data.agentAccounts
//           : [],
//         settlementAccounts: Array.isArray(res.data?.settlementAccounts)
//           ? res.data.settlementAccounts
//           : [],
//         summary: res.data?.summary || null,
//       });
//     } catch (error) {
//       alert(error?.response?.data?.message || "Could not fetch balance tracking");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchData();
//   }, []);

//   const allBankAccounts = [
//     ...data.agentAccounts.map((row) => ({
//       limit: Number(row.max_payment_limit || 0),
//       used: Number(row.used_amount || 0),
//       available: Number(row.max_available_limit || 0),
//     })),
//     ...(!hideSettlementAccounts
//       ? data.settlementAccounts.map((row) => ({
//           limit: Number(row.max_payment_limit || 0),
//           used: Number(row.used_amount || 0),
//           available: Number(row.available_amount || 0),
//         }))
//       : []),
//   ];

//   const bankTotalLimit = allBankAccounts.reduce((sum, row) => sum + row.limit, 0);
//   const bankTotalUsed = allBankAccounts.reduce((sum, row) => sum + row.used, 0);
//   const bankTotalAvailable = allBankAccounts.reduce((sum, row) => sum + row.available, 0);

//   const agentBankOptions = data.agentAccounts.reduce((acc, row) => {
//   const bankName = row.bank_name || "Unknown Bank";

//   if (!acc[bankName]) {
//     acc[bankName] = {
//       bank_name: bankName,
//       available: 0,
//     };
//   }

//   acc[bankName].available += Number(row.max_available_limit || 0);
//   return acc;
// }, {});

// const agentBankList = Object.values(agentBankOptions);

// const selectedBankStats = selectedBank
//   ? data.agentAccounts.reduce(
//       (acc, row) => {
//         if (row.bank_name === selectedBank) {
//           acc.available += Number(row.max_available_limit || 0);
//           acc.used += Number(row.used_amount || 0);
//         }
//         return acc;
//       },
//       {
//         available: 0,
//         used: 0,
//       }
//     )
//   : {
//       available: 0,
//       used: 0,
//     };

//   const s = data.summary || {};

//   return (
//     <div>
//       <div className="mb-6 flex items-center justify-between">
//         <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">{title}</h1>

//         <button
//           onClick={fetchData}
//           className="cursor-pointer rounded-xl bg-[#1E88FF] px-4 py-2 text-sm font-semibold text-white"
//         >
//           Refresh
//         </button>
//       </div>

//       {!loading && (
//         <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
//           <StatCard title="Total Bank Limit" value={money(bankTotalLimit)} color="blue" />
//           <StatCard title="Total Bank Used" value={money(bankTotalUsed)} color="orange" />
//           <StatCard title="Total Bank Available" value={money(bankTotalAvailable)} color="green" />
// {showBankDropdown && (
//   <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
         
//   <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 opacity-70">
//     Agent Bank Available
//   </p>


//   <select
//     value={selectedBank}
//     onChange={(e) => setSelectedBank(e.target.value)}
//     className="mb-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"
//   >
//     <option value="">Select Bank</option>
//     {agentBankList.map((bank) => (
//       <option key={bank.bank_name} value={bank.bank_name}>
//         {bank.bank_name}
//       </option>
//     ))}
//   </select>

//  <div className="flex items-center justify-between gap-6">
// <div className="flex-1">
//   <p className="text-xs font-semibold text-gray-500">
//     Available
//   </p>
//   <h2 className="text-lg font-bold text-emerald-700">
//     {money(selectedBankStats.available)}
//   </h2>
// </div>

//  <div className="flex-1 text-right">
//   <p className="text-xs font-semibold text-gray-500">
//     Used
//   </p>
//   <h2 className="text-lg font-bold text-orange-600">
//     {money(selectedBankStats.used)}
//   </h2>
// </div>
// </div>
// </div>
 
// )}
//           <StatCard
//             title="Total Transactions"
//             value={Number(s.totalTransactions || 0).toLocaleString()}
//             color="purple"
//           />
//           <StatCard
//             title="Total Accounts"
//             value={Number(allBankAccounts.length || 0).toLocaleString()}
//             color="slate"
//           />
//           <StatCard
//             title="Approved Transactions"
//             value={Number(s.approvedTransactions || 0).toLocaleString()}
//             color="green"
//           />
//           <StatCard
//             title="Pending Transactions"
//             value={Number(s.pendingTransactions || 0).toLocaleString()}
//             color="red"
//           />
//         </div>
        
//       )}

//       {loading ? (
//         <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-gray-500">
//           Loading...
//         </div>
//       ) : (
//         <>
//           <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
//             <div className="border-b p-4">
//               <h2 className="text-lg font-bold text-gray-900">Agent Account Balance Usage</h2>
//             </div>

//             <table className="w-full text-sm">
//               <thead className="bg-gray-50 text-gray-600">
//                 <tr>
//                   {!hideOwnerColumns && <th className="p-3 text-left">Agent</th>}
//                   {!hideOwnerColumns && <th className="p-3 text-left">Agent</th>}
//                   <th className="p-3 text-left">Bank</th>
//                   <th className="p-3 text-left">Account</th>
//                   <th className="p-3 text-right">Limit</th>
//                   <th className="p-3 text-right">Used</th>
//                   <th className="p-3 text-right">Available</th>
//                 </tr>
//               </thead>

//               <tbody>
//                 {data.agentAccounts.length === 0 ? (
//                   <tr>
//                     <td className="p-4 text-center text-gray-500" colSpan={hideOwnerColumns ? 5 : 7}>
//                       No agent accounts found
//                     </td>
//                   </tr>
//                 ) : (
//                   data.agentAccounts.map((row) => (
//                     <tr key={row.id} className="border-t hover:bg-gray-50">
//                       {!hideOwnerColumns && <td className="p-3">{row.agent_name || "-"}</td>}
//                       {!hideOwnerColumns && <td className="p-3">{row.agent_name || "-"}</td>}
//                       <td className="p-3">{row.bank_name || "-"}</td>
//                       <td className="p-3">{maskAccount(row.account_number)}</td>
//                       <td className="p-3 text-right">{money(row.max_payment_limit)}</td>
//                       <td className="p-3 text-right">{money(row.used_amount)}</td>
//                       <td className="p-3 text-right font-semibold">{money(row.max_available_limit)}</td>
//                     </tr>
//                   ))
//                 )}
//               </tbody>
//             </table>
//           </div>

//           {!hideSettlementAccounts && (
//             <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
//               <div className="border-b p-4">
//                 <h2 className="text-lg font-bold text-gray-900">Settlement Account Usage</h2>
//               </div>

//               <table className="w-full text-sm">
//                 <thead className="bg-gray-50 text-gray-600">
//                   <tr>
//                     {!hideOwnerColumns && <th className="p-3 text-left">Merchant</th>}
//                     {!hideOwnerColumns && <th className="p-3 text-left">Agent</th>}
//                     <th className="p-3 text-left">Bank</th>
//                     <th className="p-3 text-left">Account</th>
//                     <th className="p-3 text-right">Limit</th>
//                     <th className="p-3 text-right">Used</th>
//                     <th className="p-3 text-right">Available</th>
//                   </tr>
//                 </thead>

//                 <tbody>
//                   {data.settlementAccounts.length === 0 ? (
//                     <tr>
//                       <td className="p-4 text-center text-gray-500" colSpan={hideOwnerColumns ? 5 : 7}>
//                         No settlement accounts found
//                       </td>
//                     </tr>
//                   ) : (
//                     data.settlementAccounts.map((row) => (
//                       <tr key={row.id} className="border-t hover:bg-gray-50">
//                         {!hideOwnerColumns && <td className="p-3">{row.merchant_name || "-"}</td>}
//                         {!hideOwnerColumns && <td className="p-3">{row.agent_name || "-"}</td>}
//                         <td className="p-3">{row.bank_name || "-"}</td>
//                         <td className="p-3">{maskAccount(row.account_number)}</td>
//                         <td className="p-3 text-right">{money(row.max_payment_limit)}</td>
//                         <td className="p-3 text-right">{money(row.used_amount)}</td>
//                         <td className="p-3 text-right font-semibold">{money(row.available_amount)}</td>
//                       </tr>
//                     ))
//                   )}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </>
//       )}
//     </div>
//   );
// }


import { useEffect, useState } from "react";
import api, { getCurrentSession } from "../../api";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const dateTime = (value) => (value ? new Date(value).toLocaleString() : "-");

// Format an IST date string ("YYYY-MM-DD") as "08 Jun 2026" without going through
// Date(), which could shift the day in timezones far ahead of IST.
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDayLabel = (isoDate) => {
  const [y, m, d] = String(isoDate || "").split("-");
  if (!y || !m || !d) return isoDate || "-";
  return `${d} ${MONTHS_SHORT[Number(m) - 1] || m} ${y}`;
};

const maskAccount = (value) => {
  const text = String(value || "");
  if (!text) return "-";
  if (text.length <= 4) return text;
  return `${"*".repeat(Math.max(text.length - 4, 0))}${text.slice(-4)}`;
};

// Owner tag: Sagar Keshav → SK, Anurag Yadav → AD (falls back to the holder name).
const bankTag = (holder) => {
  const h = String(holder || "").toLowerCase();
  if (h.includes("sagar")) return "SK";
  if (h.includes("anurag")) return "AD";
  return String(holder || "").trim();
};

function StatCard({ title, value, color = "blue" }) {
  const colorMap = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    red: "bg-red-50 border-red-200 text-red-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${colorMap[color] || colorMap.blue}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">{title}</p>
      <h2 className="text-2xl font-bold">{value}</h2>
    </div>
  );
}

function BankCard({ b, canManage, onWithdraw, onToggleActive, onShowHistory, recentEntries = [] }) {
  const [amt, setAmt] = useState("");
  const [remark, setRemark] = useState("");
  const [date, setDate] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const isAgent = b.type === "agent";
  const active = b.is_active !== false;
  const over = b.limit > 0 && b.used > b.limit;
  const pct = b.limit > 0 ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 0;
  const barColor = over || pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-orange-500" : "bg-emerald-500";

  const submit = async () => {
    const n = Number(amt);
    if (!n || n <= 0) return;
    setBusy(true);
    const linkedLabel = link ? (recentEntries.find((e) => e.ref === link)?.label || "") : "";
    await onWithdraw(b.accountId, n, remark.trim(), date, link, linkedLabel);
    setBusy(false);
    setAmt("");
    setRemark("");
    setDate("");
    setLink("");
  };

  const cardBorder = !active
    ? "border-slate-200 bg-gray-50 opacity-80"
    : over
      ? "border-red-300 bg-red-50"
      : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${cardBorder}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-gray-900">{b.bank_name}</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          {over && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              Limit crossed
            </span>
          )}
          {isAgent && canManage && (
            <button
              type="button"
              onClick={() => onToggleActive(b.accountId, !active)}
              title={active ? "Bank ON — click to turn OFF" : "Bank OFF — click to turn ON"}
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}
            >
              {active ? "ON" : "OFF"}
            </button>
          )}
          {isAgent && !canManage && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
              {active ? "ON" : "OFF"}
            </span>
          )}
        </div>
      </div>
      <p className="mb-3 text-xs text-gray-400">{maskAccount(b.account_number)}</p>

      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Used today</p>
          <p className="text-xl font-bold text-orange-600">{money(b.used)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Available</p>
          <p className={`text-xl font-bold ${b.available < 0 ? "text-red-600" : "text-emerald-700"}`}>
            {money(b.available)}
          </p>
        </div>
      </div>

      {isAgent && (
        <div className="mb-2 border-t border-gray-100 pt-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wide text-gray-400">
              Withdrawn today
            </span>
            <span className="font-semibold text-blue-600">{money(b.withdrawn || 0)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wide text-gray-400">
              Left in bank
            </span>
            <span className="font-semibold text-purple-700">
              {money(Math.max((b.used || 0) - (b.withdrawn || 0), 0))}
            </span>
          </div>
        </div>
      )}

      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>{pct}% used today</span>
        <span>Daily limit {money(b.limit)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>

      {over && (
        <p className="mt-2 text-xs font-semibold text-red-600">
          Today's deposit limit reached — turn this bank OFF and use another. Resets at midnight (IST).
        </p>
      )}

      {isAgent && canManage && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              placeholder="Withdrawn ₹"
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E88FF]"
            />
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Remark"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#1E88FF]"
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            title="Date (optional — defaults to today)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-gray-600 outline-none focus:border-[#1E88FF]"
          />
          <select
            value={link}
            onChange={(e) => setLink(e.target.value)}
            title="Optionally link this to a previous entry (A → B → C)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-gray-600 outline-none focus:border-[#1E88FF]"
          >
            <option value="">Link previous entry (optional)…</option>
            {recentEntries.map((e) => (
              <option key={e.ref} value={e.ref}>{e.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !Number(amt)}
              className="flex-1 rounded-lg bg-[#1E88FF] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "..." : "Withdraw"}
            </button>
            <button
              type="button"
              onClick={() => onShowHistory(b)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              History
            </button>
          </div>
        </div>
      )}

      {isAgent && !canManage && (
        <button
          type="button"
          onClick={() => onShowHistory(b)}
          className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Withdrawal History
        </button>
      )}
    </div>
  );
}

export function LoginActivityView({ title = "Login Activity" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const rowsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const paginatedRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const fetchRows = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/tracking/login-activity");
      setRows(Array.isArray(res.data) ? res.data : []);
      setPage(1);
    } catch (error) {
      alert(error?.response?.data?.message || "Could not fetch login activity");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">{title}</h1>
        <button
          onClick={fetchRows}
          className="cursor-pointer rounded-xl bg-[#1E88FF] px-4 py-2 text-sm font-semibold text-white self-start sm:self-auto"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[500px] text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-3 text-left">Date & Time</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Username</th>
              <th className="p-3 text-left">IP Address</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan="5">
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan="5">
                  No login activity found
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{dateTime(row.logged_in_at)}</td>
                  <td className="p-3 capitalize">{row.role}</td>
                  <td className="p-3">{row.name || "-"}</td>
                  <td className="p-3">{row.username || "-"}</td>
                  <td className="p-3">{row.ip_address || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between border-t bg-white px-4 py-3">
            <p className="text-sm text-gray-600">
              Page {page} / {totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg bg-[#1E88FF] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BalanceTrackingView({ title = "Balance Tracking" }) {
  const session = getCurrentSession();
  const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");
  const currentRole = viewAs?.role || session.role;

  const hideOwnerColumns = currentRole === "merchant";
  const hideSettlementAccounts = currentRole === "agent";

  const [data, setData] = useState({
    payin: {},
    settlement: {},
    agentAccounts: [],
    settlementAccounts: [],
    summary: null,
  });

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState({ accounts: [], days: [] });
  const [historyDays, setHistoryDays] = useState(14);

  // SSPay merchant wallet balances — admin/super-admin only (the endpoint is scoped to them).
  const isAdmin = currentRole === "admin" || currentRole === "super-admin";
  const [sspayWallets, setSspayWallets] = useState([]);

  const fetchSspayWallets = async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/api/withdrawal/sspay-balances");
      setSspayWallets(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSspayWallets([]);
    }
  };

  const fetchHistory = async (days = historyDays) => {
    try {
      const res = await api.get(`/api/tracking/balance-history?days=${days}`);
      setHistory({
        accounts: Array.isArray(res.data?.accounts) ? res.data.accounts : [],
        days: Array.isArray(res.data?.days) ? res.data.days : [],
      });
    } catch {
      setHistory({ accounts: [], days: [] });
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      const res = await api.get("/api/tracking/balance");

      setData({
        payin: res.data?.payin || {},
        settlement: res.data?.settlement || {},
        agentAccounts: Array.isArray(res.data?.agentAccounts)
          ? res.data.agentAccounts
          : [],
        settlementAccounts: Array.isArray(res.data?.settlementAccounts)
          ? res.data.settlementAccounts
          : [],
        summary: res.data?.summary || null,
      });
      fetchHistory();
      fetchSspayWallets();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not fetch balance tracking");
    } finally {
      setLoading(false);
    }
  };

  const [ssParties, setSsParties] = useState([]);
  // Recent entries (withdrawals + transfers) to optionally link a new entry to (A → B → C).
  const [recentEntries, setRecentEntries] = useState([]);
  const refreshRecentEntries = async () => {
    try {
      const r = await api.get("/api/tracking/recent-entries");
      setRecentEntries(Array.isArray(r.data) ? r.data : []);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    fetchData();
    api
      .get("/api/tracking/ss-parties")
      .then((r) => setSsParties(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    refreshRecentEntries();
  }, []);

  const allBankAccounts = [
    ...data.agentAccounts.map((row) => ({
      limit: Number(row.max_payment_limit || 0),
      used: Number(row.used_amount || 0),
      available: Number(row.available_amount || 0),
    })),
    ...(!hideSettlementAccounts
      ? data.settlementAccounts.map((row) => ({
          limit: Number(row.max_payment_limit || 0),
          used: Number(row.used_amount || 0),
          available: Number(row.available_amount || 0),
        }))
      : []),
  ];

  const bankTotalLimit = allBankAccounts.reduce((sum, row) => sum + row.limit, 0);
  const bankTotalUsed = allBankAccounts.reduce((sum, row) => sum + row.used, 0);
  const bankTotalAvailable = allBankAccounts.reduce((sum, row) => sum + row.available, 0);

  // One card per bank ACCOUNT — kept separate even when two accounts share a bank name.
  const bankCards = [
    ...data.agentAccounts.map((row) => ({
      key: `op-${row.id}`,
      type: "agent",
      accountId: row.id,
      is_active: row.is_active !== false,
      bank_name: row.bank_name || "Unknown Bank",
      account_number: row.account_number,
      limit: Number(row.max_payment_limit || 0),
      used: Number(row.used_amount || 0),
      available: Number(row.available_amount || 0),
      withdrawn: Number(row.withdrawn_today || 0),
    })),
    ...(!hideSettlementAccounts
      ? data.settlementAccounts.map((row) => ({
          key: `st-${row.id}`,
          type: "settlement",
          accountId: row.id,
          bank_name: row.bank_name || "Unknown Bank",
          account_number: row.account_number,
          limit: Number(row.max_payment_limit || 0),
          used: Number(row.used_amount || 0),
          available: Number(row.available_amount || 0),
        }))
      : []),
  ].sort((a, b) => b.used - a.used);

  // Agents/agents/admins can record a withdrawal to free a collection account's limit.
  const canWithdraw = currentRole !== "merchant";
  const handleWithdraw = async (accountId, amount, remark, date, linkedRef, linkedLabel) => {
    try {
      await api.post(`/api/tracking/agent-account/${accountId}/withdraw`, {
        amount, remark, date, linked_ref: linkedRef || "", linked_label: linkedLabel || "",
      });
      await fetchData();
      await refreshRecentEntries();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not record withdrawal");
    }
  };

  // Internal bank-to-bank transfer (Bank A -> Bank B, both your own collection banks).
  const [xfer, setXfer] = useState({ from: "", fromParty: "", to: "", toParty: "", amount: "", remark: "", date: "", link: "" });
  const [xferBusy, setXferBusy] = useState(false);
  const handleTransfer = async () => {
    const fromParty = (xfer.fromParty || "").trim();
    const toParty = (xfer.toParty || "").trim();
    if ((!xfer.from && !fromParty) || (!xfer.to && !toParty) || !Number(xfer.amount)) {
      alert("Pick a From (bank or party), a To (bank or party), and an amount");
      return;
    }
    if (!fromParty && !toParty && xfer.from === xfer.to) {
      alert("From and To bank must be different");
      return;
    }
    setXferBusy(true);
    try {
      const linkedLabel = xfer.link ? (recentEntries.find((e) => e.ref === xfer.link)?.label || "") : "";
      await api.post("/api/tracking/bank-transfer", {
        from_account_id: fromParty ? null : Number(xfer.from),
        from_party: fromParty,
        to_account_id: toParty ? null : Number(xfer.to),
        to_party: toParty,
        amount: Number(xfer.amount),
        remark: xfer.remark.trim(),
        date: xfer.date,
        linked_ref: xfer.link || "",
        linked_label: linkedLabel,
      });
      setXfer({ from: "", fromParty: "", to: "", toParty: "", amount: "", remark: "", date: "", link: "" });
      await fetchData();
      await refreshRecentEntries();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not record transfer");
    } finally {
      setXferBusy(false);
    }
  };

  const handleToggleActive = async (accountId, isActive) => {
    try {
      await api.patch(`/api/tracking/agent-account/${accountId}/active`, { is_active: isActive });
      await fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not update status");
    }
  };

  // Withdrawal/transfer-history modal state.
  const [historyAccount, setHistoryAccount] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyTransfers, setHistoryTransfers] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const refreshHistory = async (accountId) => {
    try {
      const [w, t] = await Promise.all([
        api.get(`/api/tracking/agent-account/${accountId}/withdrawals`),
        api.get(`/api/tracking/agent-account/${accountId}/transfers`),
      ]);
      setHistoryRows(Array.isArray(w.data) ? w.data : []);
      setHistoryTransfers(Array.isArray(t.data) ? t.data : []);
    } catch (e) { /* ignore */ }
  };

  const openHistory = async (bank) => {
    setHistoryAccount(bank);
    setHistoryRows([]);
    setHistoryTransfers([]);
    setHistoryLoading(true);
    try {
      await refreshHistory(bank.accountId);
    } catch (error) {
      alert(error?.response?.data?.message || "Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteWithdrawal = async (wid) => {
    if (!window.confirm("Delete this withdrawal? It will be reversed from the bank and the ledger.")) return;
    try {
      await api.delete(`/api/tracking/withdrawal/${wid}`);
      if (historyAccount) await refreshHistory(historyAccount.accountId);
      await fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not delete withdrawal");
    }
  };

  // Full edit modal (amount / date / from / to / party) for both withdrawals and
  // internal transfers. Changes re-sync to SS Accounting via the backend.
  const [editEntry, setEditEntry] = useState(null);
  const [editBusy, setEditBusy] = useState(false);

  const handleEditWithdrawal = (row) => {
    setEditEntry({
      kind: "withdrawal",
      id: row.id,
      from: String(row.account_id || historyAccount?.accountId || ""),
      amount: String(row.amount ?? ""),
      date: row.date || "",
      remark: row.remark || "",
      link: row.linked_ref || "",
      linkLabel: row.linked_label || "",
    });
  };

  const handleEditTransfer = (t) => {
    setEditEntry({
      kind: "transfer",
      id: t.id,
      from: t.from_account_id ? String(t.from_account_id) : "",
      fromParty: t.from_party_name || "",
      to: t.to_account_id ? String(t.to_account_id) : "",
      toParty: t.to_party_name || "",
      amount: String(t.amount ?? ""),
      date: t.date || "",
      remark: t.remark || "",
      link: t.linked_ref || "",
      linkLabel: t.linked_label || "",
    });
  };

  const saveEdit = async () => {
    const e = editEntry;
    if (!e) return;
    const n = Number(e.amount);
    if (!n || n <= 0) { alert("Valid amount required"); return; }
    // Resolve a fresh label if a different link was picked; otherwise keep the snapshot.
    const linkedLabel = e.link
      ? (recentEntries.find((x) => x.ref === e.link)?.label || e.linkLabel || "")
      : "";
    setEditBusy(true);
    try {
      if (e.kind === "withdrawal") {
        if (!e.from) { alert("Pick a bank"); setEditBusy(false); return; }
        await api.put(`/api/tracking/withdrawal/${e.id}`, {
          account_id: Number(e.from),
          amount: n,
          remark: (e.remark || "").trim(),
          date: (e.date || "").trim(),
          linked_ref: e.link || "",
          linked_label: linkedLabel,
        });
      } else {
        const fromParty = (e.fromParty || "").trim();
        const toParty = (e.toParty || "").trim();
        if ((!e.from && !fromParty) || (!e.to && !toParty)) {
          alert("Pick a From (bank or party) and a To (bank or party)");
          setEditBusy(false);
          return;
        }
        if (!fromParty && !toParty && e.from === e.to) {
          alert("From and To bank must be different");
          setEditBusy(false);
          return;
        }
        await api.put(`/api/tracking/bank-transfer/${e.id}`, {
          from_account_id: fromParty ? null : Number(e.from),
          from_party: fromParty,
          to_account_id: toParty ? null : Number(e.to),
          to_party: toParty,
          amount: n,
          remark: (e.remark || "").trim(),
          date: (e.date || "").trim(),
          linked_ref: e.link || "",
          linked_label: linkedLabel,
        });
      }
      setEditEntry(null);
      if (historyAccount) await refreshHistory(historyAccount.accountId);
      await fetchData();
      await refreshRecentEntries();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not save changes");
    } finally {
      setEditBusy(false);
    }
  };

  const handleDeleteTransfer = async (tid) => {
    if (!window.confirm("Delete this transfer? Both banks and the ledger will adjust back.")) return;
    try {
      await api.delete(`/api/tracking/bank-transfer/${tid}`);
      if (historyAccount) await refreshHistory(historyAccount.accountId);
      await fetchData();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not delete transfer");
    }
  };

  // Accounts that have crossed their limit — agent should withdraw/settle.
  const overLimitAccounts = bankCards.filter((b) => b.limit > 0 && b.used > b.limit);

  const s = data.summary || {};

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">{title}</h1>

        <button
          onClick={fetchData}
          className="cursor-pointer rounded-xl bg-[#1E88FF] px-4 py-2 text-sm font-semibold text-white self-start sm:self-auto"
        >
          Refresh
        </button>
      </div>

      {!loading && (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard title="Total Bank Limit" value={money(bankTotalLimit)} color="blue" />
          <StatCard title="Total Bank Used" value={money(bankTotalUsed)} color="orange" />
          <StatCard title="Total Bank Available" value={money(bankTotalAvailable)} color="green" />

          <StatCard
            title="Total Transactions"
            value={Number(s.totalTransactions || 0).toLocaleString()}
            color="purple"
          />
          <StatCard
            title="Total Accounts"
            value={Number(allBankAccounts.length || 0).toLocaleString()}
            color="slate"
          />
          <StatCard
            title="Approved Transactions"
            value={Number(s.approvedTransactions || 0).toLocaleString()}
            color="green"
          />
          <StatCard
            title="Pending Transactions"
            value={Number(s.pendingTransactions || 0).toLocaleString()}
            color="red"
          />
        </div>
      )}

      {!loading && isAdmin && sspayWallets.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-gray-900">SSPay Wallet Balance</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sspayWallets.map((w) => {
              const low = w.ok && w.balance != null && Number(w.balance) < 250000;
              return (
                <div
                  key={w.merchant_id}
                  className={`rounded-2xl border p-5 shadow-sm ${low ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-900">{w.merchant_name}</h3>
                    {w.mode && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        {w.mode}
                      </span>
                    )}
                  </div>
                  {!w.ok ? (
                    <p className="text-sm text-red-600">{w.error || "Balance unavailable"}</p>
                  ) : w.balance == null ? (
                    <p className="text-sm text-gray-500">Sandbox — no real balance</p>
                  ) : (
                    <>
                      <p className={`text-2xl font-bold ${low ? "text-red-600" : "text-emerald-700"}`}>
                        {money(w.balance)}
                      </p>
                      {(w.min > 0 || w.max > 0) && (
                        <p className="mt-1 text-xs text-gray-400">
                          per payout: min {money(w.min)} · max {money(w.max)}
                        </p>
                      )}
                      {low && (
                        <p className="mt-1 text-xs font-semibold text-red-600">
                          Below ₹2,50,000 — top up the wallet.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && overLimitAccounts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm">
          <p className="text-base font-bold text-red-700">
            ⚠ {overLimitAccounts.length} bank account
            {overLimitAccounts.length > 1 ? "s have" : " has"} crossed today's limit
          </p>
          <p className="mb-2 text-sm text-red-600">
            Turn these accounts OFF and route to another — today's deposit limit resets at midnight (IST):
          </p>
          <ul className="list-inside list-disc text-sm text-red-700">
            {overLimitAccounts.map((b) => (
              <li key={b.key}>
                {b.bank_name} ({maskAccount(b.account_number)}) — used {money(b.used)} of {money(b.limit)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && canWithdraw && data.agentAccounts.length > 1 && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-gray-900">Transfer between banks</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">From bank</label>
              <select
                value={xfer.from}
                onChange={(e) => setXfer({ ...xfer, from: e.target.value })}
                disabled={!!(xfer.fromParty || "").trim()}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
              >
                <option value="">Select…</option>
                {data.agentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name} ({maskAccount(a.account_number)}) — {bankTag(a.account_holder_name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                From party <span className="font-normal text-gray-400">(instead of From bank)</span>
              </label>
              <select
                value={xfer.fromParty}
                onChange={(e) => setXfer({ ...xfer, fromParty: e.target.value })}
                disabled={!!xfer.from}
                title={xfer.from ? "Clear From bank to send from a party" : "Select a party"}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
              >
                <option value="">Select party…</option>
                {ssParties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">To bank</label>
              <select
                value={xfer.to}
                onChange={(e) => setXfer({ ...xfer, to: e.target.value })}
                disabled={!!(xfer.toParty || "").trim()}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
              >
                <option value="">Select…</option>
                {data.agentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name} ({maskAccount(a.account_number)}) — {bankTag(a.account_holder_name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                To party <span className="font-normal text-gray-400">(instead of To bank)</span>
              </label>
              <select
                value={xfer.toParty}
                onChange={(e) => setXfer({ ...xfer, toParty: e.target.value })}
                disabled={!!xfer.to}
                title={xfer.to ? "Clear To bank to send to a party" : "Select a party"}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
              >
                <option value="">Select party…</option>
                {ssParties.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Amount ₹</label>
              <input
                type="number"
                min="0"
                value={xfer.amount}
                onChange={(e) => setXfer({ ...xfer, amount: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
              <input
                type="date"
                value={xfer.date}
                onChange={(e) => setXfer({ ...xfer, date: e.target.value })}
                title="Optional — defaults to today"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-gray-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Remark</label>
              <input
                type="text"
                value={xfer.remark}
                onChange={(e) => setXfer({ ...xfer, remark: e.target.value })}
                placeholder="e.g. for SBI settlement"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">
                Link previous entry <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <select
                value={xfer.link}
                onChange={(e) => setXfer({ ...xfer, link: e.target.value })}
                title="Link this transfer to a previous entry (A → B → C)"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-gray-600"
              >
                <option value="">None…</option>
                {recentEntries.map((e) => (
                  <option key={e.ref} value={e.ref}>{e.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleTransfer}
                disabled={xferBusy}
                className="h-10 w-full rounded-lg bg-[#1E88FF] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {xferBusy ? "…" : "Transfer"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-blue-700">
            Moves money between your own banks: the From bank goes down and the To bank goes up. Use a real
            withdrawal only when money leaves to an outside party (merchant / SVC).
          </p>
        </div>
      )}

      {!loading && bankCards.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-gray-900">Bank-wise Usage</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bankCards.map((b) => (
              <BankCard
                key={b.key}
                b={b}
                canManage={canWithdraw}
                onWithdraw={handleWithdraw}
                onToggleActive={handleToggleActive}
                onShowHistory={openHistory}
                recentEntries={recentEntries}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && history.accounts.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Daily Usage History</h2>
            <select
              value={historyDays}
              onChange={(e) => {
                const d = Number(e.target.value);
                setHistoryDays(d);
                fetchHistory(d);
              }}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-gray-700">Date (IST)</th>
                  {history.accounts.map((a) => (
                    <th key={a.id} className="px-4 py-3 text-right font-bold text-gray-700">
                      <div>{a.bank_name || "Bank"}</div>
                      <div className="text-[10px] font-normal text-gray-400">
                        {maskAccount(a.account_number)}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-bold text-gray-900">Gross</th>
                  <th className="px-4 py-3 text-right font-bold text-blue-700">Withdrawn</th>
                  <th className="px-4 py-3 text-right font-bold text-emerald-700">Net</th>
                </tr>
              </thead>
              <tbody>
                {history.days.length === 0 ? (
                  <tr>
                    <td
                      colSpan={history.accounts.length + 4}
                      className="px-4 py-6 text-center text-gray-500"
                    >
                      No usage in this period
                    </td>
                  </tr>
                ) : (
                  history.days.map((d) => (
                    <tr key={d.date} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-3 font-medium text-gray-700">
                        {fmtDayLabel(d.date)}
                      </td>
                      {history.accounts.map((a) => (
                        <td key={a.id} className="px-4 py-3 text-right text-gray-600">
                          {money(d.perAccount[a.id] || 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        {money(d.gross)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600">
                        {money(d.withdrawn)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-700">
                        {money(d.net)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {historyAccount && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Withdrawals &amp; Transfers</h2>
                <p className="text-xs text-gray-500">
                  {historyAccount.bank_name} ({maskAccount(historyAccount.account_number)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryAccount(null)}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600"
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {historyLoading ? (
                <p className="py-6 text-center text-sm text-gray-500">Loading...</p>
              ) : historyRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">No withdrawals recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Remark</th>
                      {canWithdraw && <th className="px-3 py-2 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 whitespace-nowrap">{dateTime(r.created_at)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-orange-600">{money(r.amount)}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.remark || "-"}
                          {r.linked_label && (
                            <span className="mt-0.5 block text-xs text-blue-600">🔗 {r.linked_label}</span>
                          )}
                        </td>
                        {canWithdraw && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleEditWithdrawal(r)}
                              className="mr-2 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWithdrawal(r.id)}
                              className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {historyTransfers.length > 0 && (
                <div className="mt-5">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Internal Transfers (Bank ↔ Bank)
                  </p>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Direction</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Remark</th>
                        {canWithdraw && <th className="px-3 py-2 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {historyTransfers.map((t) => (
                        <tr key={t.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 whitespace-nowrap">{dateTime(t.created_at)}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {t.direction === "out" ? `→ ${t.to_bank}` : `← ${t.from_bank}`}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${t.direction === "out" ? "text-red-600" : "text-emerald-700"}`}>
                            {t.direction === "out" ? "-" : "+"}{money(t.amount)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {t.remark || "-"}
                            {t.linked_label && (
                              <span className="mt-0.5 block text-xs text-blue-600">🔗 {t.linked_label}</span>
                            )}
                          </td>
                          {canWithdraw && (
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleEditTransfer(t)}
                                className="mr-2 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTransfer(t.id)}
                                className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editEntry && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Edit {editEntry.kind === "withdrawal" ? "Withdrawal" : "Transfer"}
              </h2>
              <button
                type="button"
                onClick={() => setEditEntry(null)}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {editEntry.kind === "withdrawal" ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Bank (From)</label>
                  <select
                    value={editEntry.from}
                    onChange={(e) => setEditEntry({ ...editEntry, from: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Select…</option>
                    {data.agentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bank_name} ({maskAccount(a.account_number)}) — {bankTag(a.account_holder_name)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">From bank</label>
                    <select
                      value={editEntry.from}
                      onChange={(e) => setEditEntry({ ...editEntry, from: e.target.value })}
                      disabled={!!(editEntry.fromParty || "").trim()}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
                    >
                      <option value="">Select…</option>
                      {data.agentAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bank_name} ({maskAccount(a.account_number)}) — {bankTag(a.account_holder_name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      From party <span className="font-normal text-gray-400">(instead of bank)</span>
                    </label>
                    <select
                      value={editEntry.fromParty || ""}
                      onChange={(e) => setEditEntry({ ...editEntry, fromParty: e.target.value })}
                      disabled={!!editEntry.from}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
                    >
                      <option value="">Select party…</option>
                      {editEntry.fromParty && !ssParties.includes(editEntry.fromParty) && (
                        <option value={editEntry.fromParty}>{editEntry.fromParty}</option>
                      )}
                      {ssParties.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">To bank</label>
                    <select
                      value={editEntry.to}
                      onChange={(e) => setEditEntry({ ...editEntry, to: e.target.value })}
                      disabled={!!(editEntry.toParty || "").trim()}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
                    >
                      <option value="">Select…</option>
                      {data.agentAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bank_name} ({maskAccount(a.account_number)}) — {bankTag(a.account_holder_name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">
                      To party <span className="font-normal text-gray-400">(instead of bank)</span>
                    </label>
                    <select
                      value={editEntry.toParty || ""}
                      onChange={(e) => setEditEntry({ ...editEntry, toParty: e.target.value })}
                      disabled={!!editEntry.to}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-gray-100"
                    >
                      <option value="">Select party…</option>
                      {editEntry.toParty && !ssParties.includes(editEntry.toParty) && (
                        <option value={editEntry.toParty}>{editEntry.toParty}</option>
                      )}
                      {ssParties.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Amount ₹</label>
                  <input
                    type="number"
                    min="0"
                    value={editEntry.amount}
                    onChange={(e) => setEditEntry({ ...editEntry, amount: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
                  <input
                    type="date"
                    value={editEntry.date}
                    onChange={(e) => setEditEntry({ ...editEntry, date: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Remark</label>
                <input
                  type="text"
                  value={editEntry.remark}
                  onChange={(e) => setEditEntry({ ...editEntry, remark: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Link previous entry <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <select
                  value={editEntry.link || ""}
                  onChange={(e) => setEditEntry({ ...editEntry, link: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-gray-600"
                >
                  <option value="">None…</option>
                  {editEntry.link &&
                    !recentEntries.some((x) => x.ref === editEntry.link) && (
                      <option value={editEntry.link}>{editEntry.linkLabel || editEntry.link}</option>
                    )}
                  {recentEntries
                    .filter((x) => x.ref !== `${editEntry.kind === "withdrawal" ? "trkwd" : "xfer"}-${editEntry.id}`)
                    .map((x) => (
                      <option key={x.ref} value={x.ref}>{x.label}</option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditEntry(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editBusy}
                className="rounded-lg bg-[#1E88FF] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {editBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-gray-500">
          Loading...
        </div>
      ) : (
        <>
          <div className="mb-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b p-4">
              <h2 className="text-lg font-bold text-gray-900">Agent Account Balance Usage</h2>
            </div>

            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {!hideOwnerColumns && <th className="p-3 text-left">Agent</th>}
                  {!hideOwnerColumns && <th className="p-3 text-left">Agent</th>}
                  <th className="p-3 text-left">Bank</th>
                  <th className="p-3 text-left">Account</th>
                  <th className="p-3 text-right">Limit</th>
                  <th className="p-3 text-right">Used</th>
                  <th className="p-3 text-right">Available</th>
                </tr>
              </thead>

              <tbody>
                {data.agentAccounts.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-gray-500" colSpan={hideOwnerColumns ? 5 : 7}>
                      No agent accounts found
                    </td>
                  </tr>
                ) : (
                  data.agentAccounts.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-gray-50">
                      {!hideOwnerColumns && <td className="p-3">{row.agent_name || "-"}</td>}
                      {!hideOwnerColumns && <td className="p-3">{row.agent_name || "-"}</td>}
                      <td className="p-3">{row.bank_name || "-"}</td>
                      <td className="p-3">{maskAccount(row.account_number)}</td>
                      <td className="p-3 text-right">{money(row.max_payment_limit)}</td>
                      <td className="p-3 text-right">{money(row.used_amount)}</td>
                      <td className="p-3 text-right font-semibold">{money(row.available_amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!hideSettlementAccounts && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b p-4">
                <h2 className="text-lg font-bold text-gray-900">Settlement Account Usage</h2>
              </div>

              <table className="w-full min-w-[500px] text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    {!hideOwnerColumns && <th className="p-3 text-left">Merchant</th>}
                    {!hideOwnerColumns && <th className="p-3 text-left">Agent</th>}
                    <th className="p-3 text-left">Bank</th>
                    <th className="p-3 text-left">Account</th>
                    <th className="p-3 text-right">Limit</th>
                    <th className="p-3 text-right">Used</th>
                    <th className="p-3 text-right">Available</th>
                  </tr>
                </thead>

                <tbody>
                  {data.settlementAccounts.length === 0 ? (
                    <tr>
                      <td className="p-4 text-center text-gray-500" colSpan={hideOwnerColumns ? 5 : 7}>
                        No settlement accounts found
                      </td>
                    </tr>
                  ) : (
                    data.settlementAccounts.map((row) => (
                      <tr key={row.id} className="border-t hover:bg-gray-50">
                        {!hideOwnerColumns && <td className="p-3">{row.merchant_name || "-"}</td>}
                        {!hideOwnerColumns && <td className="p-3">{row.agent_name || "-"}</td>}
                        <td className="p-3">{row.bank_name || "-"}</td>
                        <td className="p-3">{maskAccount(row.account_number)}</td>
                        <td className="p-3 text-right">{money(row.max_payment_limit)}</td>
                        <td className="p-3 text-right">{money(row.used_amount)}</td>
                        <td className="p-3 text-right font-semibold">{money(row.available_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}