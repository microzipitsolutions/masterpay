import { useEffect, useMemo, useState } from "react";
import MerchantLayout from "../../layouts/MerchantLayout";
import { API_BASE_API_URL, fileUrl } from "../../config/apiConfig";

const API_BASE_URL = API_BASE_API_URL;

function formatDate(dateValue) {
  if (!dateValue) return "-";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "-";

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
  if (value === "rejected" || value === "declined")
    return "bg-red-100 text-red-700";

  return "bg-yellow-100 text-yellow-700";
}

function SettlementTransactions() {
  const token = localStorage.getItem("rdpay_token");

  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setMessage("");

      const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");

const response = await fetch(
  `${API_BASE_URL}/settlement-transactions?viewRole=${viewAs?.role || ""}&viewId=${viewAs?.id || ""}&t=${Date.now()}`,
  {
       headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
  ViewRole: viewAs?.role || "",
  ViewId: viewAs?.id || "",
},
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Could not fetch settlement transactions"
        );
      }

      const onlyWithUtr = data.filter(
        (item) => item.utr_number && item.utr_number.trim() !== ""
      );

      setTransactions(onlyWithUtr);
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

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((row) => {
        const searchText = search.toLowerCase().trim();

        const searchMatch =
          !searchText ||
          String(row.id || "").toLowerCase().includes(searchText) ||
          String(row.utr_number || "").toLowerCase().includes(searchText) ||
          String(row.account_number || "").toLowerCase().includes(searchText);

        const rowStatus = row.transaction_status || "Pending";

        const statusMatch =
          !status || String(rowStatus).toLowerCase() === status.toLowerCase();

        const createdDate = row.created_at ? new Date(row.created_at) : null;

        const startMatch =
          !startDate || (createdDate && createdDate >= new Date(startDate));

        const endMatch =
          !endDate || (createdDate && createdDate <= new Date(endDate + "T23:59:59.999"));

        return searchMatch && statusMatch && startMatch && endMatch;
      })
      .sort((a, b) => {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [transactions, search, status, startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, startDate, endDate]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / rowsPerPage)
  );

  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredTransactions, currentPage]);

  const exportCSV = () => {
    const headers = [
      "ID",
      "Amount",
      "UTR Number",
      "Bank Name",
      "Account Number",
      "Status",
      "Created Date",
      "Approved/Reject Date",
    ];

    const rows = filteredTransactions.map((row) => [
      row.id || "-",
      row.amount || 0,
      row.utr_number || "-",
      row.bank_name || "-",
      row.account_number || "-",
      row.transaction_status || "Pending",
      formatDate(row.created_at),
      formatDate(row.approved_or_reject_date),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "settlement_transactions.csv";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStatusUpdate = async (transactionId, newStatus) => {
    const confirmAction = window.confirm(
      `Are you sure you want to ${newStatus.toLowerCase()} this settlement?`
    );

    if (!confirmAction) return;

    try {
      setUpdatingId(transactionId);
      setMessage("");

      const response = await fetch(
        `${API_BASE_URL}/settlement-transactions/${transactionId}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            transaction_status: newStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || `Could not ${newStatus.toLowerCase()} settlement`
        );
      }

      setTransactions((prev) =>
        prev.map((item) =>
          item.id === transactionId
            ? {
                ...item,
                transaction_status: data.transaction_status,
                approved_or_reject_date: data.approved_or_reject_date,
              }
            : item
        )
      );

      setMessageType("success");
      setMessage(`Settlement ${newStatus.toLowerCase()} successfully.`);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <MerchantLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:flex-wrap sm:items-end sm:justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Settlement Transactions List</h1>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={exportCSV}
              className="h-12 rounded-lg bg-green-600 px-5 font-semibold text-white"
            >
              Export
            </button>

            <input
              placeholder="Search ID, UTR, Account"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-12 w-full sm:w-auto rounded-lg border px-4 outline-none"
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-12 w-full sm:w-auto rounded-lg border bg-white px-4 outline-none"
            >
              <option value="">Select Status</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Pending">Pending</option>
            </select>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-12 w-full sm:w-auto rounded-lg border px-4"
            />

            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-12 w-full sm:w-auto rounded-lg border px-4"
            />
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

        <div className="overflow-auto rounded-xl border bg-white">
          <table className="w-full min-w-[1150px]">
            <thead className="border-b">
              <tr>
                {[
                  "ID",
                  "Amount",
                  "UTR Number",
                  "Bank Name",
                  "Account Number",
                  "Approved Or Reject Date",
                  "Transaction Status",
                  "Action",
                  "View",
                ].map((h) => (
                  <th key={h} className="px-5 py-4 text-left font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-5 py-8 text-gray-500">
                    Loading settlement transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-5 py-8 text-gray-500">
                    No settlement transactions found.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((row, index) => {
                  const rowStatus = row.transaction_status || "Pending";
                  const isFinal =
                    rowStatus.toLowerCase() === "approved" ||
                    rowStatus.toLowerCase() === "rejected";

                  return (
                    <tr key={row.id} className="border-b">
                      <td className="px-5 py-5">
                        {(currentPage - 1) * rowsPerPage + index + 1}
                      </td>

                      <td className="px-5 py-5">{row.amount}</td>
                      <td className="px-5 py-5">{row.utr_number || "-"}</td>
                      <td className="px-5 py-5">{row.bank_name || "-"}</td>
                      <td className="px-5 py-5">{row.account_number || "-"}</td>

                      <td className="px-5 py-5">
                        {formatDate(row.approved_or_reject_date)}
                      </td>

                      <td className="px-5 py-5">
                        <span
                          className={`rounded-full px-4 py-1 text-sm font-semibold ${getStatusClass(
                            rowStatus
                          )}`}
                        >
                          {rowStatus}
                        </span>
                      </td>

                      <td className="px-5 py-5">
                        {isFinal ? (
                          <span className="text-sm text-gray-500">
                            Completed
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={updatingId === row.id}
                              onClick={() =>
                                handleStatusUpdate(row.id, "Approved")
                              }
                              className="rounded-lg bg-green-100 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-60"
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              disabled={updatingId === row.id}
                              onClick={() =>
                                handleStatusUpdate(row.id, "Rejected")
                              }
                              className="rounded-lg bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-5">
                        <button
                          type="button"
                          onClick={() => setSelectedTransaction(row)}
                          className="text-[#2B7DE9] underline"
                        >
                          View All
                        </button>
                        {row.proof && (
                          <a
                            href={fileUrl(row.proof)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-3 text-[#2B7DE9] underline"
                          >
                            Proof
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredTransactions.length > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-sm font-semibold text-gray-600">
              Page {currentPage}/{totalPages}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {selectedTransaction && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
              <h2 className="mb-5 text-2xl font-bold">Settlement Details</h2>

              <div className="space-y-3 text-sm">
                <p>
                  <b>Amount:</b> {selectedTransaction.amount}
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
                  <b>Status:</b>{" "}
                  {selectedTransaction.transaction_status || "Pending"}
                </p>

                <p>
                  <b>Created Date:</b>{" "}
                  {formatDate(selectedTransaction.created_at)}
                </p>

                <p>
                  <b>Approved/Reject Date:</b>{" "}
                  {formatDate(selectedTransaction.approved_or_reject_date)}
                </p>

                <p>
                  <b>Proof:</b>{" "}
                  {selectedTransaction.proof ? (
                    <a
                      href={fileUrl(selectedTransaction.proof)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#2B7DE9] underline"
                    >
                      View / Download
                    </a>
                  ) : (
                    "-"
                  )}
                </p>
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
      </div>
    </MerchantLayout>
  );
}

export default SettlementTransactions;
