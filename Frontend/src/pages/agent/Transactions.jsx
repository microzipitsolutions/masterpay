import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import { X } from "lucide-react";

import AgentLayout from "../../layouts/AgentLayout";

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
};

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

function StatusBadge({ value }) {
  const text = value === true ? "Yes" : value === false ? "No" : value || "-";
  const ok = ["Approved", "Success", "Yes", true].includes(value) || value === "Approved";
  const pending = value === "Pending";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        ok
          ? "bg-green-50 text-green-700"
          : pending
          ? "bg-yellow-50 text-yellow-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {text}
    </span>
  );
}

function Toolbar({
  search,
  setSearch,
  status,
  setStatus,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onExport,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Search
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full sm:w-56 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]"
        />
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Select Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]"
        >
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="UTR Submitted">UTR Submitted</option>
          <option value="Approved">Approved</option>
          <option value="Disputed">Disputed</option>
          <option value="Failed">Failed</option>
          <option value="Expired">Expired</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          Start Date
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]"
        />
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">
          End Date
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]"
        />
      </div>

      {onExport && (
        <button
          onClick={onExport}
          className="w-full sm:w-auto rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Export ⬇
        </button>
      )}
    </div>
  );
}

function downloadCsv(filename, rows) {
  if (!rows.length) return alert("No data to export");

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function Transactions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [viewItem, setViewItem] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [rescueUtr, setRescueUtr] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/transactions");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase().trim();

    return rows
      .filter((item) => {
        const haystack = Object.values(item).join(" ").toLowerCase();

        if (term && !haystack.includes(term)) return false;

        if (status) {
          if (status === "true" || status === "false") {
            const boolStatus = status === "true";
            if (item.is_active !== boolStatus) return false;
          } else if ((item.status || item.transaction_status) !== status) {
            return false;
          }
        }

        const created = item.created_at ? new Date(item.created_at) : null;

        if (startDate && created && created < new Date(startDate)) return false;

        if (endDate && created) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (created > end) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
  }, [rows, search, status, startDate, endDate]);

  const disputedCount = useMemo(
    () => filteredRows.filter((t) => String(t.status) === "Disputed").length,
    [filteredRows]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRows, currentPage]);

  const openView = (item) => {
    setViewItem(item);
    setResolveError("");
    setRescueUtr("");
  };

  const resolveDispute = async (action) => {
    if (!viewItem) return;
    if (!window.confirm(`Are you sure you want to ${action} this dispute?`)) return;
    setResolving(true);
    setResolveError("");
    try {
      const res = await api.post(`/api/transactions/${viewItem.id}/resolve-dispute`, { action });
      if (!res.data?.success && res.data?.success !== undefined) {
        setResolveError(res.data.message || `Could not ${action} dispute`);
        return;
      }
      await load();
      setViewItem(null);
    } catch (e) {
      setResolveError(e?.response?.data?.message || e.message || "Network error");
    } finally {
      setResolving(false);
    }
  };

  const rescueTxn = async () => {
    if (!viewItem) return;
    const utr = rescueUtr.trim();
    if (!utr) {
      setResolveError("UTR is required");
      return;
    }
    if (!window.confirm(`Approve this ${viewItem.status} order with UTR ${utr}? This credits the merchant.`)) return;
    setResolving(true);
    setResolveError("");
    try {
      const res = await api.post(`/api/transactions/${viewItem.id}/rescue`, { utr_number: utr });
      if (!res.data?.success && res.data?.success !== undefined) {
        setResolveError(res.data.message || "Could not rescue this order");
        return;
      }
      await load();
      setViewItem(null);
      setRescueUtr("");
    } catch (e) {
      setResolveError(e?.response?.data?.message || e.message || "Network error");
    } finally {
      setResolving(false);
    }
  };

  return (
    <AgentLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Transactions List
            </h1>
            {disputedCount > 0 && (
              <button
                type="button"
                onClick={() => setStatus("Disputed")}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                {disputedCount} dispute{disputedCount === 1 ? "" : "s"} awaiting review →
              </button>
            )}
          </div>

          <Toolbar
            search={search}
            setSearch={setSearch}
            status={status}
            setStatus={setStatus}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onExport={() =>
              downloadCsv(
                "transactions-list.csv",
                filteredRows.map((item) => ({
                  ID: item.id,
                  Amount: item.amount,
                  "UTR Number": item.utr_number || "-",
                  Agent: item.agent_name || "-",
                  "Bank Name": item.bank_name || "-",
                  "Account Number": item.account_number || "-",
                  "Created Date": formatDate(item.created_at),
                  "Approved Or Reject Date": formatDate(
                    item.approved_or_reject_date
                  ),
                  Status: item.status || "-",
                }))
              )
            }
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-950">
              <tr>
                <th className="px-5 py-4">ID</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">UTR Number</th>
                <th className="px-5 py-4">Agent</th>
                <th className="px-5 py-4">merchant</th>
                <th className="px-5 py-4">Bank Name</th>
                <th className="px-5 py-4">Account Number</th>
                <th className="px-5 py-4">Created Date</th>
                <th className="px-5 py-4">Approved Or Reject Date</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">View</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-5 py-8 text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-8 text-slate-500">
                    No records found.
                  </td>
                </tr>
              ) : (
                paginatedRows.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-5 py-4">{item.id}</td>
                    <td className="px-5 py-4">{money(item.amount)}</td>
                    <td className="px-5 py-4">{item.utr_number || "-"}</td>
                    <td className="px-5 py-4">{item.agent_name || "-"}</td>
                    <td className="px-5 py-4">
                      {item.merchant_name || "-"}
                    </td>
                    <td className="px-5 py-4">{item.bank_name || "-"}</td>
                    <td className="px-5 py-4">
                      {item.account_number || "-"}
                    </td>
                    <td className="px-5 py-4">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      {formatDate(item.approved_or_reject_date)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge value={item.status} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openView(item)}
                        className="text-[#2B7DE9] underline cursor-pointer"
                      >
                        View All
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredRows.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-sm font-medium text-slate-600">
              Page {currentPage}/{totalPages}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {viewItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
            <div className="relative w-full max-w-xl rounded-t-2xl sm:rounded-3xl bg-white p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setViewItem(null)}
                className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X size={24} />
              </button>

              <h2 className="mb-6 text-2xl font-bold">Transaction Details</h2>

              <div className="max-h-[430px] overflow-y-auto pr-3">
                <Row label="Amount" value={money(viewItem.amount)} />
                <Row label="UTR Number" value={viewItem.utr_number || "-"} />
                {viewItem.disputed_utr && (
                  <Row
                    label="Disputed UTR (customer-provided)"
                    value={viewItem.disputed_utr}
                    emphasize
                  />
                )}
                <Row label="Agent" value={viewItem.agent_name || "-"} />
                <Row label="merchant" value={viewItem.merchant_name || "-"} />
                <Row label="Bank Name" value={viewItem.bank_name} />
                <Row label="Account Number" value={viewItem.account_number} />
                <Row label="Transaction Status" value={viewItem.status} />
                <Row
                  label="Created Date"
                  value={formatDate(viewItem.created_at)}
                />
                <Row
                  label="Approved Or Reject Date"
                  value={formatDate(viewItem.approved_or_reject_date)}
                />
              </div>

              {String(viewItem.status) === "Disputed" && (
                <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm text-blue-900">
                    The customer reports they paid with UTR{" "}
                    <span className="font-mono font-semibold">{viewItem.disputed_utr || "-"}</span>.
                    Verify it against the bank statement for account{" "}
                    <span className="font-mono">{viewItem.account_number}</span> at amount{" "}
                    <span className="font-semibold">{money(viewItem.amount)}</span>.
                  </p>
                  {resolveError && (
                    <div className="mt-3 text-xs text-red-600">{resolveError}</div>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() => resolveDispute("reject")}
                      disabled={resolving}
                      className="flex-1 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject dispute
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveDispute("approve")}
                      disabled={resolving}
                      className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {resolving ? "Working…" : "Approve dispute"}
                    </button>
                  </div>
                </div>
              )}

              {["Expired", "Failed", "Pending", "UTR Submitted"].includes(String(viewItem.status)) && (
                <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-sm text-emerald-900">
                    Customer paid but the order didn't match? Enter the UTR from the bank
                    credit for <span className="font-semibold">{money(viewItem.amount)}</span>
                    {viewItem.account_number ? (
                      <> on account <span className="font-mono">{viewItem.account_number}</span></>
                    ) : null}{" "}
                    to approve it and credit the merchant.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={rescueUtr}
                      onChange={(e) => setRescueUtr(e.target.value)}
                      placeholder="Bank UTR / reference no."
                      className="h-11 flex-1 rounded-lg border border-emerald-300 px-3 font-mono text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={rescueTxn}
                      disabled={resolving || !rescueUtr.trim()}
                      className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {resolving ? "Working…" : "Approve with UTR"}
                    </button>
                  </div>
                  {resolveError && (
                    <div className="mt-2 text-xs text-red-600">{resolveError}</div>
                  )}
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setViewItem(null)}
                  className="rounded-lg border border-gray-300 px-8 py-3 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AgentLayout>
  );
}

function Row({ label, value, emphasize = false }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-200 py-2">
      <span className="font-semibold">{label}</span>
      <span className={`text-right ${emphasize ? "font-mono font-semibold text-blue-700" : "text-gray-600"}`}>{value || "-"}</span>
    </div>
  );
}

export default Transactions;
