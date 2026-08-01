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

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function TransactionsPaymentProofList() {
  const token = localStorage.getItem("rdpay_token");

  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const [agentFilter, setAgentFilter] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(`${API_BASE_URL}/transactions`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not fetch payment proofs");
      }

      const onlyPayinProofs = data
        .filter((item) => item.utr_number && String(item.utr_number).trim() !== "")
        .sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });

      setTransactions(onlyPayinProofs);
      setPage(1);
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

  const uniqueAgents = useMemo(() => {
    return [...new Set(transactions.map((item) => item.agent_name).filter(Boolean))];
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((row) => {
      const searchText = search.toLowerCase();

      const searchMatch =
        !searchText ||
        String(row.amount || "").toLowerCase().includes(searchText) ||
        String(row.utr_number || "").toLowerCase().includes(searchText) ||
        String(row.bank_name || "").toLowerCase().includes(searchText) ||
        String(row.ifsc_code || "").toLowerCase().includes(searchText) ||
        String(row.account_number || "").toLowerCase().includes(searchText) ||
        String(row.account_holder_name || "").toLowerCase().includes(searchText) ||
        String(row.upi_id || "").toLowerCase().includes(searchText) ||
        String(row.agent_name || "").toLowerCase().includes(searchText);

      const agentMatch = !agentFilter || row.agent_name === agentFilter;

      const dateMatch = inLocalDateRange(row.created_at, startDate, endDate);

      return searchMatch && agentMatch && dateMatch;
    });
  }, [transactions, search, agentFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage));

  const paginatedTransactions = filteredTransactions.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  useEffect(() => {
    setPage(1);
  }, [search, agentFilter, startDate, endDate]);

  const handleDownloadCsv = () => {
    const exportRows = filteredTransactions.filter((row) =>
      inLocalDateRange(row.created_at, exportStartDate, exportEndDate),
    );

    if (exportRows.length === 0) {
      setMessageType("error");
      setMessage("No payment proofs found for selected export date range.");
      setShowExportModal(false);
      return;
    }

    const rows = [
      [
        "ID",
        "Transaction ID",
        "Amount",
        "UTR Number",
        "Bank Name",
        "IFSC Code",
        "Account Number",
        "Account Holder Name",
        "UPI ID",
        "Merchant Name",
        "merchant Name",
        "Agent Name",
        "Agent Name",
        "Status",
        "Created Date",
      ],
      ...exportRows.map((row, index) => [
        index + 1,
        row.transaction_id || "",
        row.amount || 0,
        row.utr_number || "",
        row.bank_name || "",
        row.ifsc_code || "",
        row.account_number || "",
        row.account_holder_name || "",
        row.upi_id || "",
        row.merchant_name || "",
        row.merchant_name || "",
        row.agent_name || "",
        row.agent_name || "",
        row.status || "Pending",
        formatDate(row.created_at),
      ]),
    ];

    downloadCsv("transactions-payment-proof.csv", rows);

    setMessageType("success");
    setMessage("CSV downloaded successfully.");
    setShowExportModal(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-6">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Transactions Payment Proof List
        </h1>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                Select Agent
              </label>

              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="h-11 w-full sm:w-56 rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none"
              >
                <option value="">Search...</option>

                {uniqueAgents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                Start Date
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 w-full sm:w-52 rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none"
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
                className="h-11 w-full sm:w-52 rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="h-10 rounded-lg bg-green-600 px-5 text-sm font-semibold text-white"
            >
              Export
            </button>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-900">
                Search
              </label>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-10 w-full sm:w-48 rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none"
              />
            </div>
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

      <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1150px]">
          <thead className="border-b border-gray-200">
            <tr>
              {[
                "ID",
                "Amount",
                "UTR Number",
                "Bank Name",
                "IFSC Code",
                "Account Number",
                "Account Holder Name",
                "UPI ID",
                "Created Date",
                "View",
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
                <td colSpan="10" className="px-5 py-8 text-sm text-gray-500">
                  Loading payment proofs...
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-5 py-8 text-sm text-gray-500">
                  No payment proofs found.
                </td>
              </tr>
            ) : (
              paginatedTransactions.map((row, index) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-5 py-5 text-sm">
                    {(page - 1) * rowsPerPage + index + 1}
                  </td>
                  <td className="px-5 py-5 text-sm">{row.amount || 0}</td>
                  <td className="px-5 py-5 text-sm">{row.utr_number || "-"}</td>
                  <td className="px-5 py-5 text-sm">{row.bank_name || "-"}</td>
                  <td className="px-5 py-5 text-sm">{row.ifsc_code || "-"}</td>
                  <td className="px-5 py-5 text-sm">{row.account_number || "-"}</td>
                  <td className="px-5 py-5 text-sm">
                    {row.account_holder_name || "-"}
                  </td>
                  <td className="px-5 py-5 text-sm">{row.upi_id || "-"}</td>
                  <td className="px-5 py-5 text-sm">{formatDate(row.created_at)}</td>
                  <td className="px-5 py-5 text-sm">
                    <button
                      type="button"
                      onClick={() => setSelectedTransaction(row)}
                      className="font-medium text-[#2B7DE9] underline"
                    >
                      View All
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && filteredTransactions.length > 0 && (
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
                className="rounded-lg bg-[#2B7DE9] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-5 text-2xl font-bold">Payment Proof Details</h2>

            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p><b>ID:</b> {selectedTransaction.id}</p>
              <p><b>Transaction ID:</b> {selectedTransaction.transaction_id || "-"}</p>
              <p><b>Amount:</b> {selectedTransaction.amount || 0}</p>
              <p><b>UTR Number:</b> {selectedTransaction.utr_number || "-"}</p>
              <p><b>Bank Name:</b> {selectedTransaction.bank_name || "-"}</p>
              <p><b>IFSC Code:</b> {selectedTransaction.ifsc_code || "-"}</p>
              <p><b>Account Number:</b> {selectedTransaction.account_number || "-"}</p>
              <p><b>Account Holder:</b> {selectedTransaction.account_holder_name || "-"}</p>
              <p><b>UPI ID:</b> {selectedTransaction.upi_id || "-"}</p>
              <p><b>Merchant:</b> {selectedTransaction.merchant_name || "-"}</p>
              <p><b>merchant:</b> {selectedTransaction.merchant_name || "-"}</p>
              <p><b>Agent:</b> {selectedTransaction.agent_name || "-"}</p>
              <p><b>Agent:</b> {selectedTransaction.agent_name || "-"}</p>
              <p><b>Status:</b> {selectedTransaction.status || "Pending"}</p>
              <p><b>Created:</b> {formatDate(selectedTransaction.created_at)}</p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                className="rounded-lg bg-[#2B7DE9] px-5 py-2 font-semibold text-white"
              >
                Close
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
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none"
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
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm outline-none"
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

export default TransactionsPaymentProofList;