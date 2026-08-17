import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_API_URL } from "../config/apiConfig";
import { inLocalDateRange } from "../utils/dateRange";
import usePolling from "../lib/usePolling";

const API_BASE_URL = API_BASE_API_URL;

// Newest N rows per poll. This screen previously downloaded the entire
// transactions table every 10 seconds for every open tab — the single largest
// source of API and database load in the app. Status and date filters are now
// pushed into the query so narrowing the view narrows the request too; search,
// the merchant/agent filters and paging still run client-side over this window.
// The CSV export must not be capped at whatever the live poll happens to hold,
// so it runs its own paged query. EXPORT_PAGE_SIZE matches the backend's
// LIST_MAX_LIMIT; EXPORT_MAX_PAGES bounds a runaway loop at 10k rows.
const EXPORT_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 20;

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
  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);

  const [transactions, setTransactions] = useState([]);
  const [payinReport, setPayinReport] = useState({ breakdown: [], totals: {} });
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [webhookTransaction, setWebhookTransaction] = useState(null);
  const [editTxn, setEditTxn] = useState(null);
  const [editForm, setEditForm] = useState({ amount: "", utr_number: "", status: "Pending" });
  const [savingEdit, setSavingEdit] = useState(false);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState(initialQuery.get("source") || "");
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState(initialQuery.get("startDate") || "");
  const [endDate, setEndDate] = useState(initialQuery.get("endDate") || "");

  const [loading, setLoading] = useState(true);
  const [triggeringWebhook, setTriggeringWebhook] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }),
    [token],
  );

  // Server-side filters shared by the live list and the CSV export. The
  // merchant/agent filters stay client-side: they match on the joined display
  // name, whereas the API filters on numeric IDs.
  const buildQuery = useCallback(
    ({ page, limit, from, to }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (merchantFilter) params.set("source", merchantFilter);
      if (agentFilter) params.set("agent_id", agentFilter);
      if (from) params.set("startDate", from);
      if (to) params.set("endDate", to);
      return params;
    },
    [statusFilter, merchantFilter, agentFilter],
  );

  const fetchTransactions = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setMessage("");
        }

        const params = buildQuery({
          page: 1,
          limit: EXPORT_PAGE_SIZE,
          from: startDate,
          to: endDate,
        });

        const response = await fetch(
          `${API_BASE_URL}/admin/payins?${params.toString()}`,
          { headers: authHeaders },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Could not fetch payin transactions");
        }

        const firstRows = Array.isArray(data.rows) ? data.rows : [];
        const pageCount = Math.ceil(Number(data.totals?.total_transaction_count || 0) / EXPORT_PAGE_SIZE);
        const remaining = pageCount > 1
          ? await Promise.all(Array.from({ length: pageCount - 1 }, async (_, index) => {
              const pageParams = buildQuery({ page: index + 2, limit: EXPORT_PAGE_SIZE, from: startDate, to: endDate });
              const pageResponse = await fetch(`${API_BASE_URL}/admin/payins?${pageParams.toString()}`, { headers: authHeaders });
              const pageData = await pageResponse.json();
              if (!pageResponse.ok) throw new Error(pageData.message || "Could not fetch all Pay-In pages");
              return Array.isArray(pageData.rows) ? pageData.rows : [];
            }))
          : [];
        setTransactions([...firstRows, ...remaining.flat()]);
        setPayinReport({ breakdown: data.breakdown || [], totals: data.totals || {} });
      } catch (error) {
        if (!silent) {
          setMessageType("error");
          setMessage(error.message || "Something went wrong");
        }
      } finally {
        // Cleared unconditionally: `loading` starts true and the mount fetch
        // arrives through usePolling's silent path, so a `!silent` guard here
        // would leave the table stuck on its loading state forever.
        setLoading(false);
      }
    },
    [authHeaders, buildQuery, startDate, endDate],
  );

  // Walks pages for its own date range rather than reusing the polled window,
  // so shrinking that window does not shrink the export.
  const fetchTransactionsForExport = useCallback(async () => {
    const rows = [];

    for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
      const params = buildQuery({
        page,
        limit: EXPORT_PAGE_SIZE,
        from: exportStartDate,
        to: exportEndDate,
      });

      const response = await fetch(
        `${API_BASE_URL}/admin/payins?${params.toString()}`,
        { headers: authHeaders },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not fetch transactions to export");
      }

      const batch = Array.isArray(data.rows) ? data.rows : [];
      rows.push(...batch);

      if (batch.length < EXPORT_PAGE_SIZE) return { rows, truncated: false };
    }

    return { rows, truncated: true };
  }, [authHeaders, buildQuery, exportStartDate, exportEndDate]);

  usePolling(
    () => {
      fetchTransactions(true);
    },
    10000,
    [fetchTransactions],
  );

  // "Merchant Name" here is the TrustPay merchant/sub-merchant behind the
  // incoming transaction (trustpay_merchant_name, joined server-side from the
  // TrustPay integration's own assignment mapping), not MasterPay's own
  // merchant. Falls back to MasterPay's merchant_name for transactions that
  // didn't come through the TrustPay integration.
  const allRows = useMemo(
    () => transactions.map((t) => ({
        ...t,
        _id: `txn-${t.id}`,
        merchant_name: t.source_name,
      })),
    [transactions],
  );

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

      const merchantMatch = !merchantFilter || row.source_key === merchantFilter;

      const agentMatch = !agentFilter || String(row.agent_id) === agentFilter;

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
  const sourceSummary = payinReport.breakdown || [];

  useEffect(() => {
    setCurrentPage(1);
  }, [search, merchantFilter, agentFilter, statusFilter, startDate, endDate, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const pagedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const handleDownloadCsv = async () => {
    setExporting(true);

    let fetched;
    try {
      fetched = await fetchTransactionsForExport();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Could not fetch transactions to export.");
      setExporting(false);
      return;
    } finally {
      setExporting(false);
    }

    // The server bounds dates by IST day; this re-applies the local-day
    // semantics the rest of the screen uses, so the CSV matches what the user
    // picked in the date inputs.
    const exportRows = fetched.rows.filter((row) =>
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

    setMessageType(fetched.truncated ? "error" : "success");
    setMessage(
      fetched.truncated
        ? `Exported the newest ${exportRows.length} transactions — the range holds more than the ${EXPORT_PAGE_SIZE * EXPORT_MAX_PAGES}-row export limit. Narrow the date range to export the rest.`
        : "CSV downloaded successfully.",
    );
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
        <h1 className="mb-5 text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">
          Payin Transaction List
        </h1>

        <div className="mb-6 rounded-card border border-slate-200 bg-slate-50/60 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-transparent select-none" aria-hidden="true">
                Export
              </label>
              <button
                type="button"
                onClick={() => setShowExportModal(true)}
                className="h-10 w-full whitespace-nowrap rounded-control brand-gradient px-4 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(30,136,255,0.35)] hover:brightness-[1.06]"
              >
                Export
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-900">
                Search
              </label>
              <input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-900">
                Merchant
              </label>
              <select
                value={merchantFilter}
                onChange={(e) => setMerchantFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue"
              >
                <option value="">All merchants</option>
                {sourceSummary.map((source) => (
                  <option key={source.source_key} value={source.source_key}>
                    {source.source_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-900">
                Agent
              </label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue"
              >
                <option value="">All agents</option>
                {[...new Map(allRows.filter((row) => row.agent_id && row.agent_name).map((row) => [String(row.agent_id), row.agent_name])).entries()].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-900">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue"
              >
                <option value="">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Agent Verified">Agent Verified</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-900">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-900">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue"
              />
            </div>
          </div>
        </div>

        {sourceSummary.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <div className="rounded-lg border-2 border-brand-blue bg-blue-50 p-3 shadow-sm">
              <div className="text-sm font-semibold text-navy-900">Overall approved Pay-In</div>
              <div className="mt-1 text-xs text-slate-500">{Number(payinReport.totals.total_transaction_count || 0).toLocaleString("en-IN")} total · {Number(payinReport.totals.successful_count || 0).toLocaleString("en-IN")} successful</div>
              <div className="mt-1 text-base font-bold text-navy-900 tabular-nums">₹{Number(payinReport.totals.approved_amount || 0).toLocaleString("en-IN")}</div>
            </div>
            {sourceSummary.map((m) => (
              <div key={m.source_key} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="truncate text-sm font-semibold text-navy-900" title={m.source_name}>
                  {m.source_name}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {m.successful_count} successful · {m.total_transaction_count} total · {m.share_percent}%
                </div>
                <div className="mt-1 text-base font-bold text-navy-900 tabular-nums">
                  ₹{Number(m.approved_amount || 0).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        )}

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

        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
              <tr>
                <th className="min-w-[56px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">ID</th>
                <th className="min-w-[170px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Transaction ID</th>
                <th className="min-w-[100px] whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500">Amount</th>
                <th className="min-w-[150px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">UTR Number</th>
                <th className="min-w-[120px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Status</th>
                <th className="min-w-[140px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Bank Name</th>
                <th className="min-w-[150px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Account Number</th>
                <th className="min-w-[170px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">TrustPay Merchant Name</th>
                <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Created Date</th>
                <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Approved/Reject Date</th>
                <th className="min-w-[160px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">UTR Submitted Date</th>
                <th className="min-w-[90px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">View All</th>
                <th className="min-w-[170px] whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">Action</th>
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
                  <tr key={row._id || row.id} className="border-b border-gray-100 align-middle">
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-700">
                      {row.transaction_id || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold tabular-nums text-slate-900">{row.amount || 0}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-700">
                      {row.utr_number || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                          row.status
                        )}`}
                      >
                        {row.status || "Pending"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">{row.bank_name || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-700">
                      {row.account_number || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                      {row.merchant_name || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs tabular-nums text-slate-500">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs tabular-nums text-slate-500">
                      {formatDate(row.approved_or_reject_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs tabular-nums text-slate-500">
                      {formatDate(row.utr_submitted_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                      <button
                        type="button"
                        onClick={() => setSelectedTransaction(row)}
                        className="whitespace-nowrap font-medium text-[#1E88FF] underline"
                      >
                        View All
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        {!row._isReceivedProof && (
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="whitespace-nowrap rounded-full brand-gradient px-3 py-1.5 text-sm font-semibold text-white hover:brightness-[1.06]"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setWebhookTransaction(row)}
                          disabled={!row.webhook_url}
                          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
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
                  disabled={exporting}
                  className="rounded-lg bg-red-600 px-8 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exporting ? "Preparing…" : "Download CSV"}
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
