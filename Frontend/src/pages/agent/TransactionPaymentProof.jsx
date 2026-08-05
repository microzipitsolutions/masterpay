import { useEffect, useState } from "react";
import api from "../../api";
import AgentLayout from "../../layouts/AgentLayout";
import { API_BASE_URL } from "../../config/apiConfig";

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
};

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function StatusBadge({ value }) {
  const text = value === true ? "Yes" : value === false ? "No" : value || "-";
  const ok = ["Approved", "Success", "Yes", true].includes(value) || value === "Approved";
  const pending = value === "Pending";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-green-50 text-green-700" : pending ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
      {text}
    </span>
  );
}

function Toolbar({ search, setSearch, status, setStatus, startDate, setStartDate, endDate, setEndDate, onExport, onUpload }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Search</label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full sm:w-56 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]" />
      </div>
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Select Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]">
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="Agent Verified">Agent Verified</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Start Date</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]" />
      </div>
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">End Date</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]" />
      </div>
      {onUpload && <button onClick={onUpload} className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Bulk Upload</button>}
      {onExport && <button onClick={onExport} className="w-full sm:w-auto rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white">Export ⬇</button>}
    </div>
  );
}

function downloadCsv(filename, rows) {
  if (!rows.length) return alert("No data to export");
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function TransactionPaymentProof() {
  const [rows, setRows] = useState([]);
  const [receivedProofs, setReceivedProofs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState("");
  const [uploadAccount, setUploadAccount] = useState("");
  const [uploadResults, setUploadResults] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [txRes, accRes, receivedRes] = await Promise.all([
        api.get("/api/transactions"),
        api.get("/api/agent-accounts"),
        api.get("/api/agent-received-proofs").catch(() => ({ data: [] })),
      ]);
      setRows(Array.isArray(txRes.data) ? txRes.data : []);
      setAccounts(Array.isArray(accRes.data) ? accRes.data : []);
      setReceivedProofs(Array.isArray(receivedRes.data) ? receivedRes.data : []);
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

  // Received proofs (recorded because the UTR already existed with a different
  // amount) shown alongside normal proofs with status "Pending Review" so the
  // agent sees their submission was saved even when it wasn't auto-matched.
  const receivedAsRows = receivedProofs.map((p) => ({
    ...p,
    _key: `recv-${p.id}`,
    status: p.status || "Agent Verified",
    approved_or_reject_date: null,
    _isReceivedProof: true,
  }));

  const filteredRows = [...rows.map((t) => ({ ...t, _key: `txn-${t.id}` })), ...receivedAsRows].filter((item) => {
    const term = search.toLowerCase().trim();
    const haystack = Object.values(item).join(" ").toLowerCase();
    if (term && !haystack.includes(term)) return false;

    if (status) {
      if (status === "true" || status === "false") {
        const boolStatus = status === "true";
        if (item.is_active !== boolStatus) return false;
      } else if ((item.status || item.transaction_status || "Pending") !== status) return false;
    }
    const created = item.created_at ? new Date(item.created_at) : null;
    if (startDate && created && created < new Date(startDate)) return false;
    if (endDate && created) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (created > end) return false;
    }
    return true;
  });

  const handleBulkUpload = async () => {
    if (!uploadFile) return alert("Please choose an Excel file");
    if (!uploadType) return alert("Please select type");
    if (!uploadAccount) return alert("Please select account");

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("type", uploadType);
    formData.append("account", uploadAccount);

    setUploading(true);
    try {
      const res = await api.post("/api/payment-proof/bulk-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResults(res.data);
      load();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const closeUploadModal = () => {
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadType("");
    setUploadAccount("");
    setUploadResults(null);
  };

  return (
    <AgentLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Transactions Payment Proof List</h1>
          <Toolbar
            search={search}
            setSearch={setSearch}
            status={status}
            setStatus={setStatus}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onUpload={() => setShowUploadModal(true)}
            onExport={() => downloadCsv("transactions-payment-proof-list.csv", filteredRows)}
          />
        </div>

        <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-950">
              <tr>
              <th className="px-5 py-4">ID</th>
              <th className="px-5 py-4">Amount</th>
              <th className="px-5 py-4">UTR Number</th>
              <th className="px-5 py-4">Agent</th>
              <th className="px-5 py-4">Bank Name</th>
              <th className="px-5 py-4">IFSC Code</th>
              <th className="px-5 py-4">Account Number</th>
              <th className="px-5 py-4">Account Holder Name</th>
              <th className="px-5 py-4">UPI ID</th>
              <th className="px-5 py-4">Created Date</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Proof</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="px-5 py-8 text-slate-500">Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={12} className="px-5 py-8 text-slate-500">No records found.</td></tr>
              ) : filteredRows.map((item) => (
              <tr key={item._key || item.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-5 py-4">{item.id}</td>
                <td className="px-5 py-4">{money(item.amount)}</td>
                <td className="px-5 py-4">{item.utr_number || "-"}</td>
                <td className="px-5 py-4">{item.agent_name || "-"}</td>
                <td className="px-5 py-4">{item.bank_name || "-"}</td>
                <td className="px-5 py-4">{item.ifsc_code || "-"}</td>
                <td className="px-5 py-4">{item.account_number || "-"}</td>
                <td className="px-5 py-4">{item.account_holder_name || "-"}</td>
                <td className="px-5 py-4">{item.upi_id || "-"}</td>
                <td className="px-5 py-4">{formatDate(item.created_at)}</td>
                <td className="px-5 py-4"><StatusBadge value={item.status} /></td>
                <td className="px-5 py-4">{item.payment_proof ? <a className="text-[#1E88FF] underline" href={`${API_BASE_URL}${item.payment_proof}`} target="_blank" rel="noreferrer">View Proof</a> : "-"}</td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
            <div className="relative w-full max-w-2xl rounded-t-2xl sm:rounded-3xl bg-white p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
              <button
                onClick={closeUploadModal}
                className="absolute right-6 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                ×
              </button>

              {!uploadResults ? (
                <>
                  <h2 className="mb-5 text-lg font-bold text-gray-900">Bulk Upload Payment Proof</h2>
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Upload File <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => setUploadFile(e.target.files[0])}
                        className="w-full rounded-lg border border-slate-200 px-4 py-3"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Select Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={uploadType}
                        onChange={(e) => setUploadType(e.target.value)}
                        className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
                      >
                        <option value="">Select Type</option>
                        <option value="Google Pay">Google Pay</option>
                        <option value="Yes Pay Biz">Yes Pay Biz</option>
                        <option value="Phone Pay">Phone Pay</option>
                        <option value="Bharat Pay">Bharat Pay</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-700">
                        Select Account <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={uploadAccount}
                        onChange={(e) => setUploadAccount(e.target.value)}
                        className="h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm outline-none"
                      >
                        <option value="">Select Account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.account_number}>
                            {account.bank_name} - {account.account_number}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-8 flex justify-end gap-3">
                    <button
                      onClick={closeUploadModal}
                      className="rounded-lg border border-slate-200 px-6 py-3 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkUpload}
                      disabled={uploading}
                      className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {uploading ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mb-1 text-lg font-bold text-gray-900">Upload Results</h2>
                  {uploadResults.detectedColumns && (
                    <p className="mb-4 text-xs text-gray-500">
                      Detected columns — UTR: <span className="font-medium text-gray-700">{uploadResults.detectedColumns.utr}</span>
                      {" | "}Amount: <span className="font-medium text-gray-700">{uploadResults.detectedColumns.amount}</span>
                    </p>
                  )}

                  <div className="mb-5 flex flex-wrap gap-3">
                    <span className="rounded-full bg-green-100 px-4 py-1.5 text-sm font-semibold text-green-800">
                      Approved: {uploadResults.approved || 0}
                    </span>
                    <span className="rounded-full bg-yellow-100 px-4 py-1.5 text-sm font-semibold text-yellow-800">
                      Recorded for review: {(uploadResults.results || []).filter(r => r.status === "Agent Verified").length}
                    </span>
                    <span className="rounded-full bg-red-100 px-4 py-1.5 text-sm font-semibold text-red-800">
                      Failed: {uploadResults.failed || 0}
                    </span>
                  </div>

                  {(uploadResults.results || []).length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">#</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">UTR</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Amount</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Status</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700">Reason / Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploadResults.results.map((r, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-800">{r.utr_number || "—"}</td>
                              <td className="px-3 py-2 text-gray-800">{r.amount != null ? money(r.amount) : "—"}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  r.status === "Approved"
                                    ? "bg-green-100 text-green-800"
                                    : r.status === "Agent Verified"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-red-100 text-red-800"
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{r.reason || r.note || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={closeUploadModal}
                      className="rounded-lg bg-gray-800 px-6 py-3 font-semibold text-white hover:bg-gray-900"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AgentLayout>
  );
}

export default TransactionPaymentProof;
