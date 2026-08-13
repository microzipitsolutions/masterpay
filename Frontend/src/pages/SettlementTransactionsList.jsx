// import { useEffect, useMemo, useState } from "react";
// import { API_BASE_API_URL } from "../config/apiConfig";

// const API_BASE_URL = API_BASE_API_URL;

// function formatDate(dateValue) {
//   if (!dateValue) return "--";

//   const date = new Date(dateValue);

//   if (Number.isNaN(date.getTime())) return "--";

//   return date.toLocaleString("en-GB", {
//     day: "2-digit",
//     month: "2-digit",
//     year: "numeric",
//     hour: "2-digit",
//     minute: "2-digit",
//     second: "2-digit",
//   });
// }

// function getStatusClass(status) {
//   const value = String(status || "").toLowerCase();

//   if (value === "approved") return "bg-green-100 text-green-700";
//   if (value === "rejected" || value === "declined") return "bg-red-100 text-red-700";

//   return "bg-yellow-100 text-yellow-700";
// }

// function escapeCsv(value) {
//   if (value === null || value === undefined) return "";
//   return `"${String(value).replace(/"/g, '""')}"`;
// }

// function downloadCsv(filename, rows) {
//   const csvContent = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

//   const blob = new Blob([csvContent], {
//     type: "text/csv;charset=utf-8;",
//   });

//   const url = URL.createObjectURL(blob);
//   const link = document.createElement("a");

//   link.href = url;
//   link.download = filename;
//   document.body.appendChild(link);
//   link.click();

//   document.body.removeChild(link);
//   URL.revokeObjectURL(url);
// }

// function SettlementTransactionsList() {
//   const token = localStorage.getItem("rdpay_token");

//   const [transactions, setTransactions] = useState([]);
//   const [selectedTransaction, setSelectedTransaction] = useState(null);

//   const [showExportModal, setShowExportModal] = useState(false);
//   const [exportStartDate, setExportStartDate] = useState("");
//   const [exportEndDate, setExportEndDate] = useState("");

//   const [search, setSearch] = useState("");
//   const [statusFilter, setStatusFilter] = useState("");
//   const [merchantFilter, setMerchantFilter] = useState("");
//   const [agentFilter, setAgentFilter] = useState("");
//   const [agentFilter, setAgentFilter] = useState("");
//   const [startDate, setStartDate] = useState("");
//   const [endDate, setEndDate] = useState("");

//   const [loading, setLoading] = useState(true);
//   const [message, setMessage] = useState("");
//   const [messageType, setMessageType] = useState("");

//   const [showUtrModal, setShowUtrModal] = useState(false);
//   const [utrTransaction, setUtrTransaction] = useState(null);
//   const [utrNumber, setUtrNumber] = useState("");
//   const [updatingUtr, setUpdatingUtr] = useState(false);

//   const fetchTransactions = async () => {
//     try {
//       setLoading(true);
//       setMessage("");

//       const response = await fetch(`${API_BASE_URL}/settlement-transactions`, {
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//       });

//       const data = await response.json();

//       if (!response.ok) {
//         throw new Error(data.message || "Could not fetch settlement transactions");
//       }

//       setTransactions(data);
//     } catch (error) {
//       setMessageType("error");
//       setMessage(error.message || "Something went wrong");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchTransactions();
//   }, []);

//   const uniqueValues = (key) => {
//     return [...new Set(transactions.map((item) => item[key]).filter(Boolean))];
//   };

//   const filteredTransactions = useMemo(() => {
//     return transactions.filter((row) => {
//       const searchText = search.toLowerCase();

//       const searchMatch =
//         !searchText ||
//         String(row.amount || "").toLowerCase().includes(searchText) ||
//         String(row.utr_number || "").toLowerCase().includes(searchText) ||
//         String(row.bank_name || "").toLowerCase().includes(searchText) ||
//         String(row.ifsc_code || "").toLowerCase().includes(searchText) ||
//         String(row.account_number || "").toLowerCase().includes(searchText) ||
//         String(row.account_holder_name || "").toLowerCase().includes(searchText) ||
//         String(row.upi_id || "").toLowerCase().includes(searchText) ||
//         String(row.merchant_name || "").toLowerCase().includes(searchText) ||
//         String(row.agent_name || "").toLowerCase().includes(searchText) ||
//         String(row.agent_name || "").toLowerCase().includes(searchText);

//       const rowStatus = row.transaction_status || "Pending";

//       const statusMatch =
//         !statusFilter || String(rowStatus).toLowerCase() === statusFilter.toLowerCase();

//       const merchantMatch =
//         !merchantFilter || row.merchant_name === merchantFilter;

//       const agentMatch =
//         !agentFilter || row.agent_name === agentFilter;

//       const agentMatch =
//         !agentFilter || row.agent_name === agentFilter;

//       const createdDate = row.created_at ? new Date(row.created_at) : null;

//       const startMatch =
//         !startDate || (createdDate && createdDate >= new Date(startDate));

//       const endMatch =
//         !endDate || (createdDate && createdDate <= new Date(endDate));

//       return (
//         searchMatch &&
//         statusMatch &&
//         merchantMatch &&
//         agentMatch &&
//         agentMatch &&
//         startMatch &&
//         endMatch
//       );
//     });
//   }, [
//     transactions,
//     search,
//     statusFilter,
//     merchantFilter,
//     agentFilter,
//     agentFilter,
//     startDate,
//     endDate,
//   ]);

//   const openUtrModal = (transaction) => {
//     setUtrTransaction(transaction);
//     setUtrNumber(transaction.utr_number || "");
//     setShowUtrModal(true);
//     setMessage("");
//   };

//   const closeUtrModal = () => {
//     setShowUtrModal(false);
//     setUtrTransaction(null);
//     setUtrNumber("");
//     setUpdatingUtr(false);
//   };

//   const handleUpdateUtr = async (e) => {
//     e.preventDefault();

//     if (!utrTransaction) return;

//     if (!utrNumber.trim()) {
//       setMessageType("error");
//       setMessage("Please enter UTR number.");
//       return;
//     }

//     try {
//       setUpdatingUtr(true);

//       const response = await fetch(
//         `${API_BASE_URL}/settlement-transactions/${utrTransaction.id}/utr`,
//         {
//           method: "PUT",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//           body: JSON.stringify({
//             utr_number: utrNumber.trim(),
//           }),
//         }
//       );

//       const data = await response.json();

//       if (!response.ok) {
//         throw new Error(data.message || "Could not update UTR number");
//       }

//       setTransactions((prev) =>
//         prev.map((item) =>
//           item.id === utrTransaction.id
//             ? {
//                 ...item,
//                 ...data,
//                 merchant_name: item.merchant_name,
//                 agent_name: item.agent_name,
//                 agent_name: item.agent_name,
//                 utr_number: utrNumber.trim(),
//                 transaction_status: "Pending",
//                 approved_or_reject_date: null,
//               }
//             : item
//         )
//       );

//       setMessageType("success");
//       setMessage("UTR proof updated successfully. Status is Pending.");
//       closeUtrModal();
//     } catch (error) {
//       setMessageType("error");
//       setMessage(error.message || "Something went wrong");
//     } finally {
//       setUpdatingUtr(false);
//     }
//   };

//   const handleDownloadCsv = () => {
//     const exportRows = filteredTransactions.filter((row) => {
//       const createdDate = row.created_at ? new Date(row.created_at) : null;

//       const exportStartMatch =
//         !exportStartDate ||
//         (createdDate && createdDate >= new Date(exportStartDate));

//       const exportEndMatch =
//         !exportEndDate ||
//         (createdDate && createdDate <= new Date(exportEndDate));

//       return exportStartMatch && exportEndMatch;
//     });

//     if (exportRows.length === 0) {
//       setMessageType("error");
//       setMessage("No settlement transactions found for selected export date range.");
//       setShowExportModal(false);
//       return;
//     }

//     const rows = [
//       [
//         "ID",
//         "Amount",
//         "UTR Number",
//         "Bank Name",
//         "IFSC Code",
//         "Account Number",
//         "Account Holder Name",
//         "UPI ID",
//         "Merchant Name",
//         "Agent Name",
//         "Agent Name",
//         "Created Date",
//         "Approved Or Reject Date",
//         "Transaction Status",
//       ],
//       ...exportRows.map((row, index) => [
//         index + 1,
//         row.amount || 0,
//         row.utr_number || "",
//         row.bank_name || "",
//         row.ifsc_code || "",
//         row.account_number || "",
//         row.account_holder_name || "",
//         row.upi_id || "",
//         row.merchant_name || "",
//         row.agent_name || "",
//         row.agent_name || "",
//         formatDate(row.created_at),
//         formatDate(row.approved_or_reject_date),
//         row.transaction_status || "Pending",
//       ]),
//     ];

//     downloadCsv("settlement-transactions.csv", rows);

//     setMessageType("success");
//     setMessage("CSV downloaded successfully.");
//     setShowExportModal(false);
//   };

//   return (
//     <div className="min-h-screen bg-white p-8">
//       <div className="mb-6">
//         <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
//           <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
//             Settlement Transaction List
//           </h1>

//           <div className="flex flex-wrap items-end gap-3">
//             <button
//               type="button"
//               onClick={() => setShowExportModal(true)}
//               className="h-11 rounded-lg bg-green-600 px-5 text-sm font-semibold text-white"
//             >
//               Export
//             </button>

//             <div>
//               <label className="mb-2 block text-xs font-semibold text-gray-900">
//                 Search
//               </label>

//               <input
//                 placeholder="Search..."
//                 value={search}
//                 onChange={(e) => setSearch(e.target.value)}
//                 className="h-11 w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//               />
//             </div>

//             <div>
//               <label className="mb-2 block text-xs font-semibold text-gray-900">
//                 Start Date
//               </label>

//               <input
//                 type="date"
//                 value={startDate}
//                 onChange={(e) => setStartDate(e.target.value)}
//                 className="h-11 w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//               />
//             </div>

//             <div>
//               <label className="mb-2 block text-xs font-semibold text-gray-900">
//                 End Date
//               </label>

//               <input
//                 type="date"
//                 value={endDate}
//                 onChange={(e) => setEndDate(e.target.value)}
//                 className="h-11 w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//               />
//             </div>
//           </div>
//         </div>

//         <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
//           <div>
//             <label className="mb-2 block text-xs font-semibold text-gray-900">
//               Select Status
//             </label>

//             <select
//               value={statusFilter}
//               onChange={(e) => setStatusFilter(e.target.value)}
//               className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//             >
//               <option value="">Search...</option>
//               <option value="Pending">Pending</option>
//               <option value="Approved">Approved</option>
//               <option value="Rejected">Rejected</option>
//             </select>
//           </div>

//           <div>
//             <label className="mb-2 block text-xs font-semibold text-gray-900">
//               Select Merchant
//             </label>

//             <select
//               value={merchantFilter}
//               onChange={(e) => setMerchantFilter(e.target.value)}
//               className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//             >
//               <option value="">Search...</option>

//               {uniqueValues("merchant_name").map((merchant) => (
//                 <option key={merchant} value={merchant}>
//                   {merchant}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div>
//             <label className="mb-2 block text-xs font-semibold text-gray-900">
//               Select Agent
//             </label>

//             <select
//               value={agentFilter}
//               onChange={(e) => setAgentFilter(e.target.value)}
//               className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//             >
//               <option value="">Search...</option>

//               {uniqueValues("agent_name").map((agent) => (
//                 <option key={agent} value={agent}>
//                   {agent}
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div>
//             <label className="mb-2 block text-xs font-semibold text-gray-900">
//               Select Agent
//             </label>

//             <select
//               value={agentFilter}
//               onChange={(e) => setAgentFilter(e.target.value)}
//               className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//             >
//               <option value="">Search...</option>

//               {uniqueValues("agent_name").map((agent) => (
//                 <option key={agent} value={agent}>
//                   {agent}
//                 </option>
//               ))}
//             </select>
//           </div>
//         </div>
//       </div>

//       {message && (
//         <div
//           className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
//             messageType === "success"
//               ? "bg-green-50 text-green-700"
//               : "bg-red-50 text-red-700"
//           }`}
//         >
//           {message}
//         </div>
//       )}

//       <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
//         <table className="w-full min-w-[1780px]">
//           <thead className="border-b border-slate-200 bg-white">
//             <tr>
//               {[
//                 "ID",
//                 "Amount",
//                 "UTR Number",
//                 "Bank Name",
//                 "IFSC Code",
//                 "Account Number",
//                 "Account Holder Name",
//                 "UPI ID",
//                 "Merchant Name",
//                 "Agent Name",
//                 "Agent Name",
//                 "Created Date",
//                 "Approved Or Reject Date",
//                 "Transaction Status",
//                 "View All",
//                 "Activity",
//               ].map((heading) => (
//                 <th
//                   key={heading}
//                   className="px-5 py-4 text-left text-sm font-bold text-gray-900"
//                 >
//                   {heading}
//                 </th>
//               ))}
//             </tr>
//           </thead>

//           <tbody>
//             {loading ? (
//               <tr>
//                 <td colSpan="16" className="px-5 py-8 text-sm text-gray-500">
//                   Loading settlement transactions...
//                 </td>
//               </tr>
//             ) : filteredTransactions.length === 0 ? (
//               <tr>
//                 <td colSpan="16" className="px-5 py-8 text-sm text-gray-500">
//                   No settlement transactions found.
//                 </td>
//               </tr>
//             ) : (
//               filteredTransactions.map((row, index) => {
//                 const rowStatus = row.transaction_status || "Pending";

//                 return (
//                   <tr key={row.id} className="border-b border-gray-100">
//                     <td className="px-5 py-5 text-sm">{index + 1}</td>
//                     <td className="px-5 py-5 text-sm">{row.amount || 0}</td>
//                     <td className="px-5 py-5 text-sm">{row.utr_number || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{row.bank_name || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{row.ifsc_code || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{row.account_number || "-"}</td>
//                     <td className="px-5 py-5 text-sm">
//                       {row.account_holder_name || "-"}
//                     </td>
//                     <td className="px-5 py-5 text-sm">{row.upi_id || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{row.merchant_name || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{row.agent_name || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{row.agent_name || "-"}</td>
//                     <td className="px-5 py-5 text-sm">{formatDate(row.created_at)}</td>
//                     <td className="px-5 py-5 text-sm">
//                       {formatDate(row.approved_or_reject_date)}
//                     </td>
//                     <td className="px-5 py-5 text-sm">
//                       <span
//                         className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
//                           rowStatus
//                         )}`}
//                       >
//                         {rowStatus}
//                       </span>
//                     </td>
//                     <td className="px-5 py-5 text-sm">
//                       <button
//                         type="button"
//                         onClick={() => setSelectedTransaction(row)}
//                         className="font-medium text-[#1E88FF] underline"
//                       >
//                         View All
//                       </button>
//                     </td>
//                     <td className="px-5 py-5 text-sm">
//                       <button
//                         type="button"
//                         onClick={() => openUtrModal(row)}
//                         className="rounded-full bg-[#dbe7f5] px-3 py-2 text-sm font-semibold text-[#0b2a5b]"
//                       >
//                         Update Proof
//                       </button>
//                     </td>
//                   </tr>
//                 );
//               })
//             )}
//           </tbody>
//         </table>
//       </div>

//       {selectedTransaction && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
//           <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-lg">
//             <h2 className="mb-5 text-2xl font-bold">
//               Settlement Transaction Details
//             </h2>

//             <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
//               <p><b>ID:</b> {selectedTransaction.id}</p>
//               <p><b>Amount:</b> {selectedTransaction.amount || 0}</p>
//               <p><b>UTR Number:</b> {selectedTransaction.utr_number || "-"}</p>
//               <p><b>Bank Name:</b> {selectedTransaction.bank_name || "-"}</p>
//               <p><b>IFSC Code:</b> {selectedTransaction.ifsc_code || "-"}</p>
//               <p><b>Account Number:</b> {selectedTransaction.account_number || "-"}</p>
//               <p><b>Account Holder:</b> {selectedTransaction.account_holder_name || "-"}</p>
//               <p><b>UPI ID:</b> {selectedTransaction.upi_id || "-"}</p>
//               <p><b>Merchant:</b> {selectedTransaction.merchant_name || "-"}</p>
//               <p><b>Agent:</b> {selectedTransaction.agent_name || "-"}</p>
//               <p><b>Agent:</b> {selectedTransaction.agent_name || "-"}</p>
//               <p><b>Status:</b> {selectedTransaction.transaction_status || "Pending"}</p>
//               <p><b>Created:</b> {formatDate(selectedTransaction.created_at)}</p>
//               <p><b>Approved/Reject:</b> {formatDate(selectedTransaction.approved_or_reject_date)}</p>
//             </div>

//             <div className="mt-6 flex justify-end">
//               <button
//                 type="button"
//                 onClick={() => setSelectedTransaction(null)}
//                 className="rounded-lg bg-[#1E88FF] px-5 py-2 font-semibold text-white"
//               >
//                 Close
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {showUtrModal && utrTransaction && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
//           <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
//             <h2 className="mb-5 text-2xl font-bold">Update UTR Proof</h2>

//             <form onSubmit={handleUpdateUtr}>
//               <div className="mb-4">
//                 <label className="mb-2 block text-sm font-semibold text-gray-900">
//                   UTR Number <span className="text-red-500">*</span>
//                 </label>

//                 <input
//                   type="text"
//                   value={utrNumber}
//                   onChange={(e) => setUtrNumber(e.target.value)}
//                   placeholder="Enter UTR Number"
//                   className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
//                 />
//               </div>

//               <div className="mb-5 rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
//                 Status will remain Pending after updating UTR proof.
//               </div>

//               <div className="flex justify-end gap-3">
//                 <button
//                   type="button"
//                   onClick={closeUtrModal}
//                   className="rounded-lg border px-5 py-2 font-semibold text-gray-700"
//                 >
//                   Cancel
//                 </button>

//                 <button
//                   type="submit"
//                   disabled={updatingUtr}
//                   className="rounded-lg bg-[#1E88FF] px-5 py-2 font-semibold text-white disabled:opacity-60"
//                 >
//                   {updatingUtr ? "Updating..." : "Update Proof"}
//                 </button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}

//       {showExportModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
//           <div className="relative w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
//             <button
//               type="button"
//               onClick={() => setShowExportModal(false)}
//               className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-400 hover:bg-gray-200"
//             >
//               ×
//             </button>

//             <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-gray-900">
//                   Start Date
//                 </label>

//                 <input
//                   type="date"
//                   value={exportStartDate}
//                   onChange={(e) => setExportStartDate(e.target.value)}
//                   className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//                 />
//               </div>

//               <div>
//                 <label className="mb-2 block text-sm font-semibold text-gray-900">
//                   End Date
//                 </label>

//                 <input
//                   type="date"
//                   value={exportEndDate}
//                   onChange={(e) => setExportEndDate(e.target.value)}
//                   className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
//                 />
//               </div>
//             </div>

//             <div className="mt-8 flex justify-end">
//               <button
//                 type="button"
//                 onClick={handleDownloadCsv}
//                 className="rounded-lg bg-red-600 px-8 py-3 text-sm font-bold text-white hover:bg-red-700"
//               >
//                 Download CSV
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default SettlementTransactionsList;

import { useEffect, useMemo, useState } from "react";
import { API_BASE_API_URL } from "../config/apiConfig";
import { inLocalDateRange } from "../utils/dateRange";
import { utrError } from "../utils/utr";

const API_BASE_URL = API_BASE_API_URL;

function formatDate(dateValue) {
  if (!dateValue) return "--";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value === "approved") return "bg-green-100 text-green-700";
  if (value === "rejected" || value === "declined") return "bg-red-100 text-red-700";

  return "bg-yellow-100 text-yellow-700";
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SettlementTransactionsList() {
  const token = localStorage.getItem("rdpay_token");

  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [showUtrModal, setShowUtrModal] = useState(false);
  const [utrTransaction, setUtrTransaction] = useState(null);
  const [utrNumber, setUtrNumber] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [updatingUtr, setUpdatingUtr] = useState(false);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(`${API_BASE_URL}/settlement-transactions`, {
        headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
  ViewRole: JSON.parse(localStorage.getItem("rdpay_view_as") || "{}")?.role || "",
  ViewId: JSON.parse(localStorage.getItem("rdpay_view_as") || "{}")?.id || "",
},
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not fetch settlement transactions");
      }

      setTransactions(data);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const uniqueValues = (key) => {
    return [...new Set(transactions.map((item) => item[key]).filter(Boolean))];
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((row) => {
      const searchText = search.toLowerCase();

      const searchMatch =
        !searchText ||
        String(row.amount || "").toLowerCase().includes(searchText) ||
        String(row.utr_number || "").toLowerCase().includes(searchText) ||
        String(row.bank_name || "").toLowerCase().includes(searchText) ||
        String(row.account_number || "").toLowerCase().includes(searchText) ||
        String(row.transaction_status || "").toLowerCase().includes(searchText);

      const rowStatus = row.transaction_status || "Pending";

      const statusMatch =
        !statusFilter || String(rowStatus).toLowerCase() === statusFilter.toLowerCase();

      const merchantMatch =
        !merchantFilter || row.merchant_name === merchantFilter;

      const agentMatch =
        !agentFilter || row.agent_name === agentFilter;

      const dateMatch = inLocalDateRange(row.created_at, startDate, endDate);

      return (
        searchMatch &&
        statusMatch &&
        merchantMatch &&
        agentMatch &&
        dateMatch
      );
    });
  }, [
    transactions,
    search,
    statusFilter,
    merchantFilter,
    agentFilter,
    startDate,
    endDate,
  ]);

  const openUtrModal = (transaction) => {
    setUtrTransaction(transaction);
    setUtrNumber(transaction.utr_number || "");
    setProofFile(null);
    setShowUtrModal(true);
    setMessage("");
  };

  const closeUtrModal = () => {
    setShowUtrModal(false);
    setUtrTransaction(null);
    setUtrNumber("");
    setProofFile(null);
    setUpdatingUtr(false);
  };

  const handleUpdateUtr = async (e) => {
    e.preventDefault();

    if (!utrTransaction) return;

    const invalidUtr = utrError(utrNumber);
    if (invalidUtr) {
      setMessageType("error");
      setMessage(invalidUtr);
      return;
    }

    try {
      setUpdatingUtr(true);

      const form = new FormData();
      form.append("utr_number", utrNumber.trim());
      if (proofFile) form.append("proof", proofFile);

      const response = await fetch(
        `${API_BASE_URL}/settlement-transactions/${utrTransaction.id}/utr`,
        {
          method: "PUT",
       headers: {
  Authorization: `Bearer ${token}`,
  ViewRole: JSON.parse(localStorage.getItem("rdpay_view_as") || "{}")?.role || "",
  ViewId: JSON.parse(localStorage.getItem("rdpay_view_as") || "{}")?.id || "",
},
          body: form,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not update UTR number");
      }

      setTransactions((prev) =>
        prev.map((item) =>
          item.id === utrTransaction.id
            ? {
                ...item,
                ...data,
                merchant_name: item.merchant_name,
                agent_name: item.agent_name,
                utr_number: utrNumber.trim(),
                transaction_status: "Pending",
                approved_or_reject_date: null,
              }
            : item
        )
      );

      setMessageType("success");
      setMessage("UTR proof updated successfully. Status is Pending.");
      closeUtrModal();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setUpdatingUtr(false);
    }
  };

  const handleDownloadCsv = () => {
    const exportRows = filteredTransactions.filter((row) => {
      return inLocalDateRange(row.created_at, exportStartDate, exportEndDate);
    });

    if (exportRows.length === 0) {
      setMessageType("error");
      setMessage("No settlement transactions found for selected export date range.");
      setShowExportModal(false);
      return;
    }

    const rows = [
      [
        "ID",
        "Amount",
        "UTR Number",
        "Bank Name",
        "Account Number",
        "Approved Or Reject Date",
        "Transaction Status",
      ],
      ...exportRows.map((row, index) => [
        index + 1,
        row.amount || 0,
        row.utr_number || "",
        row.bank_name || "",
        row.account_number || "",
        formatDate(row.approved_or_reject_date),
        row.transaction_status || "Pending",
      ]),
    ];

    downloadCsv("settlement-transactions.csv", rows);

    setMessageType("success");
    setMessage("CSV downloaded successfully.");
    setShowExportModal(false);
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="mb-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
            Settlement Transaction List
          </h1>

          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="h-11 rounded-lg bg-green-600 px-5 text-sm font-semibold text-white"
            >
              Export
            </button>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                Search
              </label>

              <input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full sm:w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                Start Date
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 w-full sm:w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                End Date
              </label>

              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 w-full sm:w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-900">
              Select Status
            </label>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-900">
              Select Merchant
            </label>

            <select
              value={merchantFilter}
              onChange={(e) => setMerchantFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>

              {uniqueValues("merchant_name").map((merchant) => (
                <option key={merchant} value={merchant}>
                  {merchant}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-900">
              Select Agent
            </label>

            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>

              {uniqueValues("agent_name").map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-900">
              Select Agent
            </label>

            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>

              {uniqueValues("agent_name").map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            messageType === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px]">
          <thead className="border-b border-slate-200 bg-white">
            <tr>
              {[
                "ID",
                "Amount",
                "UTR Number",
                "Bank Name",
                "Account Number",
                "Approved Or Reject Date",
                "Transaction Status",
                "View All",
                "Activity",
              ].map((heading) => (
                <th
                  key={heading}
                  className="px-5 py-4 text-left text-sm font-bold text-gray-900"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" className="px-5 py-8 text-sm text-gray-500">
                  Loading settlement transactions...
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-5 py-8 text-sm text-gray-500">
                  No settlement transactions found.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((row, index) => {
                const rowStatus = row.transaction_status || "Pending";

                return (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-5 py-5 text-sm">{index + 1}</td>
                    <td className="px-5 py-5 text-sm">{row.amount || 0}</td>
                    <td className="px-5 py-5 text-sm">{row.utr_number || "-"}</td>
                    <td className="px-5 py-5 text-sm">{row.bank_name || "-"}</td>
                    <td className="px-5 py-5 text-sm">{row.account_number || "-"}</td>
                    <td className="px-5 py-5 text-sm">
                      {formatDate(row.approved_or_reject_date)}
                    </td>
                    <td className="px-5 py-5 text-sm">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          rowStatus
                        )}`}
                      >
                        {rowStatus}
                      </span>
                    </td>
                    <td className="px-5 py-5 text-sm">
                      <button
                        type="button"
                        onClick={() => setSelectedTransaction(row)}
                        className="font-medium text-[#1E88FF] underline"
                      >
                        View All
                      </button>
                    </td>
                    <td className="px-5 py-5 text-sm">
                      <button
                        type="button"
                        onClick={() => openUtrModal(row)}
                        className="rounded-full bg-[#dbe7f5] px-3 py-2 text-sm font-semibold text-[#0b2a5b]"
                      >
                        Update Proof
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-5 text-2xl font-bold">
              Settlement Transaction Details
            </h2>

            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p><b>ID:</b> {selectedTransaction.id}</p>
              <p><b>Amount:</b> {selectedTransaction.amount || 0}</p>
              <p><b>UTR Number:</b> {selectedTransaction.utr_number || "-"}</p>
              <p><b>Bank Name:</b> {selectedTransaction.bank_name || "-"}</p>
              <p><b>IFSC Code:</b> {selectedTransaction.ifsc_code || "-"}</p>
              <p><b>Account Number:</b> {selectedTransaction.account_number || "-"}</p>
              <p><b>Account Holder:</b> {selectedTransaction.account_holder_name || "-"}</p>
              <p><b>UPI ID:</b> {selectedTransaction.upi_id || "-"}</p>
              <p><b>Merchant:</b> {selectedTransaction.merchant_name || "-"}</p>
              <p><b>Agent:</b> {selectedTransaction.agent_name || "-"}</p>
              <p><b>Agent:</b> {selectedTransaction.agent_name || "-"}</p>
              <p><b>Status:</b> {selectedTransaction.transaction_status || "Pending"}</p>
              <p><b>Created:</b> {formatDate(selectedTransaction.created_at)}</p>
              <p><b>Approved/Reject:</b> {formatDate(selectedTransaction.approved_or_reject_date)}</p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="rounded-lg bg-[#1E88FF] px-5 py-2 font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showUtrModal && utrTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-5 text-2xl font-bold">Update UTR Proof</h2>

            <form onSubmit={handleUpdateUtr}>
              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  UTR Number <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  value={utrNumber}
                  onChange={(e) => setUtrNumber(e.target.value)}
                  placeholder="Enter UTR Number"
                  className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                />
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Proof (image or PDF)
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#1E88FF] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                />
                {proofFile && (
                  <p className="mt-1 text-xs text-gray-500">Selected: {proofFile.name}</p>
                )}
                {utrTransaction?.proof && !proofFile && (
                  <p className="mt-1 text-xs text-gray-500">
                    A proof is already uploaded. Choosing a new file replaces it.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeUtrModal}
                  className="rounded-lg border px-5 py-2 font-semibold text-gray-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={updatingUtr}
                  className="rounded-lg bg-[#1E88FF] px-5 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {updatingUtr ? "Updating..." : "Update Proof"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
            <button
              type="button"
              onClick={() => setShowExportModal(false)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-400 hover:bg-gray-200"
            >
              ×
            </button>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Start Date
                </label>

                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  End Date
                </label>

                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="rounded-lg bg-red-600 px-8 py-3 text-sm font-bold text-white hover:bg-red-700"
              >
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettlementTransactionsList;
