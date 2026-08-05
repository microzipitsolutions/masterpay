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

function SettlementAccountsList() {
  const token = localStorage.getItem("rdpay_token");

  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");

  const [merchantFilter, setMerchantFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(`${API_BASE_URL}/settlement-accounts`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not fetch settlement accounts");
      }

      setAccounts(data);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const uniqueMerchants = useMemo(() => {
    return [
      ...new Set(accounts.map((item) => item.merchant_name).filter(Boolean)),
    ];
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const merchantMatch =
        !merchantFilter || account.merchant_name === merchantFilter;

      const statusMatch =
        !statusFilter || String(account.is_active) === statusFilter;

      const dateMatch = inLocalDateRange(account.created_at, startDate, endDate);

      return merchantMatch && statusMatch && dateMatch;
    });
  }, [accounts, merchantFilter, statusFilter, startDate, endDate]);

  const totalPages = Math.ceil(filteredAccounts.length / rowsPerPage);

  const paginatedAccounts = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredAccounts.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAccounts, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [merchantFilter, statusFilter, startDate, endDate]);

  const handleDownloadCsv = () => {
    const exportRows = filteredAccounts.filter((account) =>
      inLocalDateRange(account.created_at, exportStartDate, exportEndDate),
    );

    if (exportRows.length === 0) {
      setMessageType("error");
      setMessage("No settlement accounts found for selected export date range.");
      setShowExportModal(false);
      return;
    }

    const rows = [
      [
        "ID",
        "Bank Name",
        "IFSC Code",
        "Account Number",
        "Account Holder Name",
        "UPI ID",
        "Merchant Name",
        "Agent Name",
        "Max Payment Limit",
        "Min Transaction Amount",
        "Is Active",
        "Created Date",
      ],
      ...exportRows.map((account, index) => [
        index + 1,
        account.bank_name || "",
        account.ifsc_code || "",
        account.account_number || "",
        account.account_holder_name || "",
        account.upi_id || "",
        account.merchant_name || "",
        account.agent_name || "",
        account.max_payment_limit || 0,
        account.min_transaction_amount || 0,
        account.is_active ? "Yes" : "No",
        formatDate(account.created_at),
      ]),
    ];

    downloadCsv("settlement-accounts.csv", rows);

    setMessageType("success");
    setMessage("CSV downloaded successfully.");
    setShowExportModal(false);
  };

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">
          Settlement Accounts List
        </h1>

        <div className="flex flex-wrap items-end gap-4">
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="h-11 rounded-lg bg-green-600 px-5 text-sm font-semibold text-white"
          >
            Export
          </button>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-900">
              Select Merchant
            </label>

            <select
              value={merchantFilter}
              onChange={(e) => setMerchantFilter(e.target.value)}
              className="h-11 w-full sm:w-52 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>

              {uniqueMerchants.map((merchant) => (
                <option key={merchant} value={merchant}>
                  {merchant}
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
              className="h-11 w-full sm:w-52 rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
            >
              <option value="">Search...</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="border-b border-slate-200">
              <tr>
                {[
                  "ID",
                  "Bank Name",
                  "IFSC Code",
                  "Account Number",
                  "Account Holder Name",
                  "UPI ID",
                  "Merchant Name",
                  "Agent Name",
                  "Is Active",
                  "View All",
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
                    Loading settlement accounts...
                  </td>
                </tr>
              ) : paginatedAccounts.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-5 py-8 text-sm text-gray-500">
                    No settlement accounts found.
                  </td>
                </tr>
              ) : (
                paginatedAccounts.map((account, index) => (
                  <tr key={account.id} className="border-b border-gray-100">
                    <td className="px-5 py-4 text-sm">
                      {(currentPage - 1) * rowsPerPage + index + 1}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.bank_name || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.ifsc_code || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.account_number || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.account_holder_name || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.upi_id || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.merchant_name || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {account.agent_name || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          account.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {account.is_active ? "Yes" : "No"}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm">
                      <button
                        type="button"
                        onClick={() => setSelectedAccount(account)}
                        className="font-medium text-[#1E88FF] underline"
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

        {!loading && filteredAccounts.length > 0 && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
              className="rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(0, 5)
              .map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    currentPage === page
                      ? "bg-[#1E88FF] text-white"
                      : "border text-gray-700"
                  }`}
                >
                  {page}
                </button>
              ))}

            {totalPages > 5 && <span className="text-sm">...</span>}

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="rounded-lg border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-5 text-2xl font-bold">
              Settlement Account Details
            </h2>

            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <p>
                <b>ID:</b> {selectedAccount.id}
              </p>
              <p>
                <b>Bank Name:</b> {selectedAccount.bank_name || "-"}
              </p>
              <p>
                <b>IFSC Code:</b> {selectedAccount.ifsc_code || "-"}
              </p>
              <p>
                <b>Account Number:</b> {selectedAccount.account_number || "-"}
              </p>
              <p>
                <b>Account Holder:</b>{" "}
                {selectedAccount.account_holder_name || "-"}
              </p>
              <p>
                <b>UPI ID:</b> {selectedAccount.upi_id || "-"}
              </p>
              <p>
                <b>Merchant:</b> {selectedAccount.merchant_name || "-"}
              </p>
              <p>
                <b>Agent:</b> {selectedAccount.agent_name || "-"}
              </p>
              <p>
                <b>Max Payment Limit:</b>{" "}
                {selectedAccount.max_payment_limit || 0}
              </p>
              <p>
                <b>Min Transaction Amount:</b>{" "}
                {selectedAccount.min_transaction_amount || 0}
              </p>
              <p>
                <b>Status:</b>{" "}
                {selectedAccount.is_active ? "Active" : "Inactive"}
              </p>
              <p>
                <b>Created:</b> {formatDate(selectedAccount.created_at)}
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAccount(null)}
                className="rounded-lg bg-[#1E88FF] px-5 py-2 font-semibold text-white"
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

export default SettlementAccountsList;