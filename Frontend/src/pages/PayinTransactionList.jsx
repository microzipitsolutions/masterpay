import { useEffect, useMemo, useState } from "react";
import { API_BASE_API_URL } from "../config/apiConfig";
import { inLocalDateRange } from "../utils/dateRange";

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

function formatDuration(from, to) {
  if (!from || !to) return "--";
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return "--";
  let s = Math.max(0, Math.floor((toMs - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  s = s % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value === "approved") return "bg-success-bg text-success";
  if (value === "rejected" || value === "declined") {
    return "bg-danger-bg text-danger";
  }
  if (value === "disputed") return "bg-info-bg text-brand-blue-dark";

  return "bg-warning-bg text-warning";
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";

  const cleanValue = String(value).replace(/"/g, '""');

  return `"${cleanValue}"`;
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

function PayinTransactionList() {
  const token = localStorage.getItem("rdpay_token");

  const [transactions, setTransactions] = useState([]);
  const [receivedProofs, setReceivedProofs] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [webhookTransaction, setWebhookTransaction] = useState(null);
  const [editTxn, setEditTxn] = useState(null);
  const [editForm, setEditForm] = useState({ amount: "", utr_number: "", status: "Pending" });
  const [savingEdit, setSavingEdit] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [triggeringWebhook, setTriggeringWebhook] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const fetchTransactions = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setMessage("");
      }

      const response = await fetch(`${API_BASE_URL}/transactions`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not fetch payin transactions");
      }

      setTransactions(data);
    } catch (error) {
      if (!silent) {
        setMessageType("error");
        setMessage(error.message || "Something went wrong");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Agent-received proofs recorded when the UTR already existed with a different
  // amount (kept out of `transactions` by the unique-UTR rule). Shown here so admin
  // still sees what the agent submitted.
  const fetchReceivedProofs = async (silent = false) => {
    try {
      const response = await fetch(`${API_BASE_URL}/agent-received-proofs`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (response.ok) setReceivedProofs(Array.isArray(data) ? data : []);
    } catch (error) {
      if (!silent) console.log(error);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchReceivedProofs();
    const i = setInterval(() => {
      fetchTransactions(true);
      fetchReceivedProofs(true);
    }, 10000);
    return () => clearInterval(i);
  }, []);

  // Normalize received proofs into the same row shape as transactions so they render
  // in the table and obey the same filters.
  const normalizedReceived = useMemo(
    () =>
      receivedProofs.map((p) => ({
        ...p,
        _id: `recv-${p.id}`,
        transaction_id: `received-${p.id}`,
        status: p.status || "Agent Verified",
        _isReceivedProof: true,
      })),
    [receivedProofs],
  );

  // "Merchant Name" here is the TrustPay merchant/sub-merchant behind the
  // incoming transaction (trustpay_merchant_name, joined server-side from the
  // TrustPay integration's own assignment mapping), not MasterPay's own
  // merchant. Falls back to MasterPay's merchant_name for transactions that
  // didn't come through the TrustPay integration.
  const allRows = useMemo(
    () => [
      ...transactions.map((t) => ({
        ...t,
        _id: `txn-${t.id}`,
        merchant_name: t.trustpay_merchant_name || t.merchant_name,
      })),
      ...normalizedReceived,
    ],
    [transactions, normalizedReceived],
  );

  const uniqueValues = (key) => {
    return [...new Set(allRows.map((item) => item[key]).filter(Boolean))];
  };

  const filteredTransactions = useMemo(() => {
    return allRows.filter((row) => {
      const searchText = search.toLowerCase();

      const searchMatch =
        !searchText ||
        String(row.transaction_id || "").toLowerCase().includes(searchText) ||
        String(row.merchant_order_id || "").toLowerCase().includes(searchText) ||
        String(row.unique_id || "").toLowerCase().includes(searchText) ||
        String(row.amount || "").toLowerCase().includes(searchText) ||
        String(row.utr_number || "").toLowerCase().includes(searchText) ||
        String(row.bank_name || "").toLowerCase().includes(searchText) ||
        String(row.ifsc_code || "").toLowerCase().includes(searchText) ||
        String(row.account_number || "").toLowerCase().includes(searchText) ||
        String(row.account_holder_name || "")
          .toLowerCase()
          .includes(searchText) ||
        String(row.upi_id || "").toLowerCase().includes(searchText) ||
        String(row.merchant_name || "").toLowerCase().includes(searchText) ||
        String(row.merchant_name || "")
          .toLowerCase()
          .includes(searchText) ||
        String(row.agent_name || "").toLowerCase().includes(searchText) ||
        String(row.agent_name || "").toLowerCase().includes(searchText);

      const merchantMatch =
        !merchantFilter || row.merchant_name === merchantFilter;

      const agentMatch =
        !agentFilter || row.agent_name === agentFilter;

      const statusMatch = !statusFilter || row.status === statusFilter;

      const dateMatch = inLocalDateRange(row.created_at, startDate, endDate);

      return (
        dateMatch &&
        searchMatch &&
        merchantMatch &&
        agentMatch &&
        statusMatch
      );
      })
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : Number(a.id || 0);
        const tb = b.created_at ? new Date(b.created_at).getTime() : Number(b.id || 0);
        return tb - ta;
      });
  }, [
    allRows,
    search,
    merchantFilter,
    agentFilter,
    statusFilter,
    startDate,
    endDate,
  ]);

  // Successful-transaction statuses, matching the definition used elsewhere in
  // the project for "received"/successful Pay-In totals (Approved, the
  // Agent Verified bank-proof match, and the legacy 'Success' synonym).
  const trustpayMerchantSummary = useMemo(() => {
    const successfulStatuses = new Set(["Approved", "Agent Verified", "Success"]);
    const map = new Map();
    for (const row of filteredTransactions) {
      const name = row.trustpay_merchant_name;
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, count: 0, amount: 0 });
      if (successfulStatuses.has(row.status)) {
        const entry = map.get(name);
        entry.count += 1;
        entry.amount += Number(row.amount || 0);
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, merchantFilter, agentFilter, statusFilter, startDate, endDate, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const pagedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleDownloadCsv = () => {
    const exportRows = filteredTransactions.filter((row) =>
      inLocalDateRange(row.created_at, exportStartDate, exportEndDate),
    );

    if (exportRows.length === 0) {
      setMessageType("error");
      setMessage("No transactions found for selected export date range.");
      setShowExportModal(false);
      return;
    }

    const rows = [
      [
        "ID",
        "Transaction ID",
        "Amount",
        "UTR Number",
        "Transaction Status",
        "Bank Name",
        "IFSC Code",
        "Account Number",
        "Account Holder Name",
        "UPI ID",
        "Merchant Name",
        "merchant Name",
        "Agent Name",
        "Agent Name",
        "Created Date",
        "UTR Submitted Date",
        "Time to UTR",
        "Approved Or Reject Date",
        "Time UTR → Approve",
        "Total Time",
        "Webhook URL",
        "Unique ID",
      ],
      ...exportRows.map((row, index) => [
        index + 1,
        row.transaction_id || "",
        row.amount || 0,
        row.utr_number || "",
        row.status || "Pending",
        row.bank_name || "",
        row.ifsc_code || "",
        row.account_number || "",
        row.account_holder_name || "",
        row.upi_id || "",
        row.merchant_name || "",
        row.merchant_name || "",
        row.agent_name || "",
        row.agent_name || "",
        formatDate(row.created_at),
        formatDate(row.utr_submitted_at),
        formatDuration(row.created_at, row.utr_submitted_at),
        formatDate(row.approved_or_reject_date),
        formatDuration(row.utr_submitted_at, row.approved_or_reject_date),
        formatDuration(row.created_at, row.approved_or_reject_date),
        row.webhook_url || "",
        row.unique_id || "",
      ]),
    ];

    downloadCsv("payin-transactions.csv", rows);

    setMessageType("success");
    setMessage("CSV downloaded successfully.");
    setShowExportModal(false);
  };

  const openEdit = (row) => {
    setEditTxn(row);
    setEditForm({
      amount: row.amount ?? "",
      utr_number: row.utr_number ?? "",
      status: row.status || "Pending",
    });
  };

  const saveEdit = async () => {
    if (!editTxn) return;
    setSavingEdit(true);
    try {
      // Send the full existing row back so the full-row PUT doesn't blank the
      // account/bank fields; only amount, UTR and status are changed here.
      const isTerminal =
        editForm.status === "Approved" || editForm.status === "Rejected";
      const payload = {
        transaction_id: editTxn.transaction_id || "",
        bank_name: editTxn.bank_name || "",
        ifsc_code: editTxn.ifsc_code || "",
        account_number: editTxn.account_number || "",
        account_holder_name: editTxn.account_holder_name || "",
        upi_id: editTxn.upi_id || "",
        amount: Number(editForm.amount) || 0,
        utr_number: String(editForm.utr_number || "").trim(),
        status: editForm.status,
        approved_or_reject_date: isTerminal
          ? editTxn.approved_or_reject_date || new Date().toISOString()
          : editTxn.approved_or_reject_date || null,
      };

      const response = await fetch(
        `${API_BASE_URL}/transactions/${editTxn.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Update failed");

      setMessageType("success");
      setMessage("Transaction updated successfully.");
      setEditTxn(null);
      fetchTransactions(true);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Could not update transaction");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleTriggerWebhook = async () => {
    if (!webhookTransaction) return;

    if (!webhookTransaction.webhook_url) {
      setMessageType("error");
      setMessage("No webhook URL found for this transaction.");
      setWebhookTransaction(null);
      return;
    }

    try {
      setTriggeringWebhook(true);

      const token = localStorage.getItem("rdpay_token") || "";
      const role = localStorage.getItem("rdpay_role") || "";
      // Note: API_BASE_URL in this file is the aliased API_BASE_API_URL which already includes /api
      const response = await fetch(
        `${API_BASE_URL}/transactions/${webhookTransaction.id}/trigger-webhook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            role,
          },
        }
      );

      if (!response.ok) {
        let serverMsg = "";
        try {
          const j = await response.json();
          serverMsg = j.message || "";
        } catch {
          /* noop */
        }
        throw new Error(serverMsg || `Webhook trigger failed (HTTP ${response.status})`);
      }

      setMessageType("success");
      setMessage("Webhook triggered successfully.");
      setWebhookTransaction(null);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Could not trigger webhook.");
    } finally {
      setTriggeringWebhook(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="p-4 md:p-6 overflow-x-hidden">
        <div className="mb-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">
              Payin Transaction List
            </h1>

            <div className="flex flex-wrap items-end gap-3">
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="h-11 rounded-control brand-gradient px-5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(30,136,255,0.35)] hover:brightness-[1.06]"
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
                  className="h-11 w-48 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
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
                  className="h-11 w-44 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
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
                  className="h-11 w-44 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
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
                {uniqueValues("merchant_name").map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                Select Agents
              </label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
              >
                <option value="">Search...</option>
                {uniqueValues("agent_name").map((name) => (
                  <option key={name} value={name}>
                    {name}
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
                {uniqueValues("agent_name").map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

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
                <option value="Agent Verified">Agent Verified</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>

          {trustpayMerchantSummary.length > 0 && (
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trustpayMerchantSummary.map((m) => (
                <div key={m.name} className="rounded-card border border-slate-200 bg-white p-4 shadow-card">
                  <div className="font-semibold text-navy-900">{m.name}</div>
                  <div className="mt-2 text-sm text-slate-500">
                    {m.count} successful transaction{m.count === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-lg font-bold text-navy-900">
                    ₹{m.amount.toLocaleString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          )}
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

        <div className="overflow-auto rounded-card border border-slate-200 bg-white shadow-card">
          <table className="w-full min-w-[1000px]">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
              <tr>
                {[
                  "ID",
                  "Transaction ID",
                  "Amount",
                  "UTR Number",
                  "Transaction Status",
                  "Bank Name",
                  "Account Number",
                  "Merchant Name",
                  "Created Date",
                  "Approved/Reject Date",
                  "UTR Submitted Date",
                  "View All",
                  "Action",
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
                  <td colSpan="13" className="px-5 py-8 text-sm text-gray-500">
                    Loading payin transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="13" className="px-5 py-8 text-sm text-gray-500">
                    No payin transactions found.
                  </td>
                </tr>
              ) : (
                pagedTransactions.map((row, index) => (
                  <tr key={row._id || row.id} className="border-b border-gray-100">
                    <td className="px-5 py-5 text-sm">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-5 py-5 text-sm">
                      {row.transaction_id || "-"}
                    </td>
                    <td className="px-5 py-5 text-sm">{row.amount || 0}</td>
                    <td className="px-5 py-5 text-sm">
                      {row.utr_number || "-"}
                    </td>
                    <td className="px-5 py-5 text-sm">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                          row.status
                        )}`}
                      >
                        {row.status || "Pending"}
                      </span>
                    </td>
                    <td className="px-5 py-5 text-sm">{row.bank_name || "-"}</td>
                    <td className="px-5 py-5 text-sm">
                      {row.account_number || "-"}
                    </td>
                    <td className="px-5 py-5 text-sm">
                      {row.merchant_name || "-"}
                    </td>
                    <td className="px-5 py-5 text-sm">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-5 py-5 text-sm">
                      {formatDate(row.approved_or_reject_date)}
                    </td>
                    <td className="px-5 py-5 text-sm">
                      {formatDate(row.utr_submitted_at)}
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
                      <div className="flex items-center gap-2">
                        {!row._isReceivedProof && (
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="rounded-full brand-gradient px-3 py-2 text-sm font-semibold text-white hover:brightness-[1.06]"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setWebhookTransaction(row)}
                          disabled={!row.webhook_url}
                          className={`rounded-full px-3 py-2 text-sm font-semibold ${
                            row.webhook_url
                              ? "bg-[#dbe7f5] text-[#0b2a5b]"
                              : "cursor-not-allowed bg-gray-100 text-gray-400"
                          }`}
                        >
                          Trigger
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-slate-200 bg-white px-5 py-4 shadow-card">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium text-slate-500">
                Page <span className="font-semibold text-navy-900">{currentPage}</span> / {totalPages} · {filteredTransactions.length} total
              </p>
              <label className="flex items-center gap-2 text-sm text-slate-500">
                Rows:
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-control border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-blue"
                >
                  {[50, 100, 200, 500].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="rounded-control border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="rounded-control border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {selectedTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-5 text-2xl font-bold">
                Payin Transaction Details
              </h2>

              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <p>
                  <b>ID:</b> {selectedTransaction.id}
                </p>
                <p>
                  <b>Transaction ID:</b>{" "}
                  {selectedTransaction.transaction_id || "-"}
                </p>
                <p>
                  <b>Amount:</b> {selectedTransaction.amount || 0}
                </p>
                <p>
                  <b>UTR Number:</b> {selectedTransaction.utr_number || "-"}
                </p>
                <p>
                  <b>Bank Name:</b> {selectedTransaction.bank_name || "-"}
                </p>
                <p>
                  <b>IFSC Code:</b> {selectedTransaction.ifsc_code || "-"}
                </p>
                <p>
                  <b>Account Number:</b>{" "}
                  {selectedTransaction.account_number || "-"}
                </p>
                <p>
                  <b>Account Holder:</b>{" "}
                  {selectedTransaction.account_holder_name || "-"}
                </p>
                <p>
                  <b>UPI ID:</b> {selectedTransaction.upi_id || "-"}
                </p>
                <p>
                  <b>Merchant:</b> {selectedTransaction.merchant_name || "-"}
                </p>
                <p>
                  <b>merchant:</b>{" "}
                  {selectedTransaction.merchant_name || "-"}
                </p>
                <p>
                  <b>Agent:</b> {selectedTransaction.agent_name || "-"}
                </p>
                <p>
                  <b>Agent:</b> {selectedTransaction.agent_name || "-"}
                </p>
                <p>
                  <b>Status:</b> {selectedTransaction.status || "Pending"}
                </p>
                {selectedTransaction._isReceivedProof && (
                  <p className="md:col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                    <b>Agent-received proof:</b> recorded because this UTR already
                    exists with a different amount
                    {selectedTransaction.existing_amount != null
                      ? ` (existing ₹${selectedTransaction.existing_amount}, left untouched)`
                      : ""}
                    . Needs admin reconciliation.
                  </p>
                )}
                <p>
                  <b>Webhook URL:</b> {selectedTransaction.webhook_url || "-"}
                </p>
                <p>
                  <b>Unique ID:</b> {selectedTransaction.unique_id || "-"}
                </p>
                <p>
                  <b>Created:</b> {formatDate(selectedTransaction.created_at)}
                </p>
                <p>
                  <b>UTR Submitted:</b>{" "}
                  {formatDate(selectedTransaction.utr_submitted_at)}
                </p>
                <p>
                  <b>Approved/Reject:</b>{" "}
                  {formatDate(selectedTransaction.approved_or_reject_date)}
                </p>

                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
                  <div className="font-bold text-slate-700 mb-2">Time analysis</div>
                  <p>
                    <b>Created → UTR Submitted:</b>{" "}
                    {formatDuration(
                      selectedTransaction.created_at,
                      selectedTransaction.utr_submitted_at
                    )}
                  </p>
                  <p>
                    <b>UTR Submitted → Approved:</b>{" "}
                    {formatDuration(
                      selectedTransaction.utr_submitted_at,
                      selectedTransaction.approved_or_reject_date
                    )}
                  </p>
                  <p>
                    <b>Total time (Created → Approved):</b>{" "}
                    {formatDuration(
                      selectedTransaction.created_at,
                      selectedTransaction.approved_or_reject_date
                    )}
                  </p>
                </div>
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

        {editTxn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-1 text-xl font-bold">Edit Transaction</h2>
              <p className="mb-5 text-xs text-gray-500">
                {editTxn.transaction_id || `#${editTxn.id}`}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, amount: e.target.value })
                    }
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#1E88FF]"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">
                    UTR Number
                  </label>
                  <input
                    value={editForm.utr_number}
                    onChange={(e) =>
                      setEditForm({ ...editForm, utr_number: e.target.value })
                    }
                    className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono outline-none focus:border-[#1E88FF]"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    UTR is unique system-wide — saving a UTR already used elsewhere
                    will be rejected.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">
                    Status
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none"
                  >
                    {!["Pending", "Approved", "Rejected"].includes(
                      editForm.status,
                    ) && (
                      <option value={editForm.status}>{editForm.status}</option>
                    )}
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                  {editForm.status === "Approved" && (
                    <p className="mt-1 text-[11px] text-amber-600">
                      Saving as Approved will fire the merchant webhook.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditTxn(null)}
                  className="rounded-lg border border-slate-200 px-5 py-2 font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="rounded-lg bg-[#1E88FF] px-5 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {savingEdit ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {webhookTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-lg">
              <h2 className="mb-3 text-xl font-bold">Trigger Webhook</h2>

              <p className="mb-6 text-sm text-gray-600">
                Are you sure you want to trigger this webhook?
              </p>

              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setWebhookTransaction(null)}
                  className="rounded-lg border px-5 py-2 font-semibold text-gray-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleTriggerWebhook}
                  disabled={triggeringWebhook}
                  className="rounded-lg bg-red-600 px-5 py-2 font-semibold text-white disabled:opacity-60"
                >
                  {triggeringWebhook ? "Triggering..." : "Confirm"}
                </button>
              </div>
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
    </div>
  );
}

export default PayinTransactionList;
