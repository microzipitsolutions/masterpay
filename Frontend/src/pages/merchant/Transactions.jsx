import { useEffect, useMemo, useState } from "react";
import MerchantLayout from "../../layouts/MerchantLayout";
import api from "../../api";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, X, ChevronDown, ChevronUp, UploadCloud } from "lucide-react";
import { Badge, PageHeader } from "../../components/ui";
import { utrError } from "../../utils/utr";

// Rows per request. Matches the backend's LIST_MAX_LIMIT so a "Load more"
// costs one round trip per batch.
const PAGE_LIMIT = 500;

function buildUpiUri({ upiId, payeeName, amount, note, ref }) {
  if (!upiId) return "";
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName) params.set("pn", payeeName);
  if (amount) params.set("am", String(amount));
  params.set("cu", "INR");
  if (note) params.set("tn", note);
  if (ref) params.set("tr", ref);
  return `upi://pay?${params.toString()}`;
}

function StatusPill({ status }) {
  return <Badge status={status || "Pending"} />;
}

function DisputeStatusPill({ ticket }) {
  if (!ticket) return <span className="text-xs text-slate-400">No Dispute</span>;
  const tone = ticket.status === "Resolved" ? "success" : ticket.status === "In Process" ? "info" : "warning";
  return <Badge tone={tone}>{ticket.status || "Pending"}</Badge>;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB");
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [viewItem, setViewItem] = useState(null);

  // Dispute state
  const [disputeItem, setDisputeItem] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [disputeSuccess, setDisputeSuccess] = useState(null);

  // Dispute history (payin-linked tickets)
  const [disputes, setDisputes] = useState([]);
  const [showDisputeHistory, setShowDisputeHistory] = useState(false);

  // Update Proof state
  const [proofItem, setProofItem] = useState(null);
  const [proofForm, setProofForm] = useState({ utr_number: "", payment_proof: null });
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofError, setProofError] = useState("");

  // Fetched a page at a time rather than as one unbounded query. Older records
  // stay reachable through "Load older transactions" below.
  const fetchPage = async (page) => {
    const r = await api.get("/api/transactions", {
      params: { page, limit: PAGE_LIMIT },
    });
    return Array.isArray(r.data) ? r.data : [];
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const batch = await fetchPage(1);
      setTransactions(batch);
      setLoadedPages(1);
      setHasMore(batch.length === PAGE_LIMIT);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load transactions");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = loadedPages + 1;
      const batch = await fetchPage(nextPage);
      setTransactions((previous) => [...previous, ...batch]);
      setLoadedPages(nextPage);
      setHasMore(batch.length === PAGE_LIMIT);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load more transactions");
    } finally {
      setLoadingMore(false);
    }
  };

  const fetchDisputes = async () => {
    try {
      const r = await api.get("/api/tickets");
      setDisputes((r.data || []).filter((t) => t.payin_id != null));
    } catch {
      setDisputes([]);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchDisputes();
  }, []);

  // Latest ticket per payin_id (disputes are returned newest-first)
  const disputesByPayinId = useMemo(() => {
    const map = {};
    for (const t of disputes) {
      if (t.payin_id != null && !map[t.payin_id]) map[t.payin_id] = t;
    }
    return map;
  }, [disputes]);

  const filtered = useMemo(() => {
    return transactions
      .filter((item) => {
        const q = search.toLowerCase().trim();
        if (q && !(
          String(item.transaction_id || "").toLowerCase().includes(q) ||
          String(item.merchant_order_id || "").toLowerCase().includes(q) ||
          String(item.unique_id || "").toLowerCase().includes(q) ||
          String(item.utr_number || "").toLowerCase().includes(q) ||
          String(item.account_number || "").toLowerCase().includes(q)
        )) return false;
        if (statusFilter && String(item.status || "").toLowerCase() !== statusFilter.toLowerCase()) return false;
        if (startDate && new Date(item.created_at) < new Date(startDate)) return false;
        if (endDate && new Date(item.created_at) > new Date(endDate + "T23:59:59")) return false;
        return true;
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [transactions, search, statusFilter, startDate, endDate]);

  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage),
    [filtered, currentPage],
  );

  const exportCSV = () => {
    const headers = ["Transaction ID", "Amount", "UTR Number", "Bank Name", "Account Number", "Status", "Created Date", "Approved/Reject Date"];
    const rows = filtered.map((item) => [
      item.transaction_id || "-", item.amount || 0, item.utr_number || "-",
      item.bank_name || "-", item.account_number || "-", item.status || "-",
      formatDate(item.created_at), formatDate(item.approved_or_reject_date),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(","))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = "merchant_transactions.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openDispute = (item) => {
    setDisputeItem(item);
    setDisputeReason("");
    setDisputeError("");
  };

  const submitDispute = async (e) => {
    e.preventDefault();
    if (!disputeReason.trim()) { setDisputeError("Please enter a reason"); return; }
    setDisputeSubmitting(true);
    setDisputeError("");
    try {
      const r = await api.post(`/api/transactions/${disputeItem.id}/merchant-dispute`, { reason: disputeReason });
      setDisputeItem(null);
      setDisputeSuccess({ ticketId: r.data?.ticket_id });
      await fetchTransactions();
      await fetchDisputes();
      setShowDisputeHistory(true);
    } catch (e) {
      setDisputeError(e?.response?.data?.message || "Could not raise dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const openProofModal = (item) => {
    setProofItem(item);
    setProofForm({ utr_number: item.utr_number || "", payment_proof: null });
    setProofError("");
  };

  const submitProof = async (e) => {
    e.preventDefault();
    // Proof alone is accepted, but a UTR that IS entered must be well-formed —
    // same rule the endpoint applies.
    const invalidUtr = utrError(proofForm.utr_number, { required: false });
    if (invalidUtr) {
      setProofError(invalidUtr);
      return;
    }
    setProofSubmitting(true);
    setProofError("");
    try {
      const formData = new FormData();
      formData.append("utr_number", proofForm.utr_number || "");
      if (proofForm.payment_proof) {
        formData.append("payment_proof", proofForm.payment_proof);
      }
      await api.put(`/api/transactions/${proofItem.id}/proof`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProofItem(null);
      await fetchTransactions();
    } catch (e) {
      setProofError(e?.response?.data?.message || "Could not update payment proof");
    } finally {
      setProofSubmitting(false);
    }
  };

  return (
    <MerchantLayout>
      <div className="min-h-[calc(100vh-80px)] bg-white px-3 sm:px-8 py-4 sm:py-10">
        {/* Header */}
        <PageHeader
          className="mb-6"
          title="Transactions"
          subtitle="PayIn transactions for this merchant"
          actions={
            <button onClick={exportCSV} className="h-11 rounded-control brand-gradient px-5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(30,136,255,0.35)] hover:brightness-[1.06]">
              Export CSV
            </button>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, UTR, Account"
            className="h-10 w-full sm:w-52 rounded-lg border border-slate-200 bg-white px-3 text-sm text-gray-600 outline-none focus:border-[#1E88FF]"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-gray-600"
          >
            <option value="">All Status</option>
            <option value="Approved">Approved</option>
            <option value="Pending">Pending</option>
            <option value="UTR Submitted">UTR Submitted</option>
            <option value="Rejected">Rejected</option>
            <option value="Expired">Expired</option>
            <option value="Failed">Failed</option>
            <option value="Disputed">Disputed</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Start</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">End</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm text-gray-600 hover:bg-gray-50">
              Clear dates
            </button>
          )}
        </div>

        {/* Dispute success banner */}
        {disputeSuccess && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start justify-between gap-3">
            <div className="text-sm text-emerald-800">
              <span className="font-semibold">Dispute raised.</span>{" "}
              Ticket #{disputeSuccess.ticketId} has been created. Our team will review it and reply shortly.{" "}
              <span className="font-semibold cursor-pointer underline" onClick={() => setShowDisputeHistory(true)}>
                View Dispute History
              </span>
            </div>
            <button onClick={() => setDisputeSuccess(null)} className="text-emerald-600 shrink-0"><X size={16} /></button>
          </div>
        )}

        {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Main table */}
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card">
          <table className="w-full min-w-[950px] border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur text-left">
                <th className="px-4 py-4 font-bold text-gray-900">#</th>
                <th className="px-4 py-4 font-bold text-gray-900">Transaction ID</th>
                <th className="px-4 py-4 font-bold text-gray-900">Amount</th>
                <th className="px-4 py-4 font-bold text-gray-900">UTR Number</th>
                <th className="px-4 py-4 font-bold text-gray-900">Bank / Account</th>
                <th className="px-4 py-4 font-bold text-gray-900">Created Date</th>
                <th className="px-4 py-4 font-bold text-gray-900">Approved/Reject Date</th>
                <th className="px-4 py-4 font-bold text-gray-900">Status</th>
                <th className="px-4 py-4 font-bold text-gray-900">Dispute</th>
                <th className="px-4 py-4 font-bold text-gray-900 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" className="px-4 py-8 text-sm text-gray-500">Loading transactions...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan="10" className="px-4 py-8 text-sm text-gray-500">No transactions found.</td></tr>
              ) : paginated.map((item, index) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 last:border-b-0"
                >
                  <td className="px-4 py-4 text-gray-900">{(currentPage - 1) * rowsPerPage + index + 1}</td>
                  <td className="px-4 py-4">
                    <div className="font-mono text-xs text-gray-900">{item.transaction_id || "—"}</div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-900">{money(item.amount)}</td>
                  <td className="px-4 py-4 font-mono text-xs text-gray-700">{item.utr_number || "—"}</td>
                  <td className="px-4 py-4 text-xs text-gray-700">
                    {item.bank_name && <div>{item.bank_name}</div>}
                    {item.account_number && <div className="font-mono">{item.account_number}</div>}
                    {!item.bank_name && !item.account_number && item.upi_id && (
                      <div className="font-mono">{item.upi_id}</div>
                    )}
                    {!item.bank_name && !item.account_number && !item.upi_id && "—"}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-600">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-4 text-xs text-gray-600">{formatDate(item.approved_or_reject_date)}</td>
                  <td className="px-4 py-4"><StatusPill status={item.status} /></td>
                  <td className="px-4 py-4">
                    <DisputeStatusPill ticket={disputesByPayinId[item.id]} />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => setViewItem(item)}
                        className="text-xs text-[#1E88FF] underline whitespace-nowrap"
                      >
                        View
                      </button>
                      <button
                        onClick={() => openProofModal(item)}
                        className="text-xs text-[#1E88FF] underline whitespace-nowrap"
                      >
                        Update Proof
                      </button>
                      <button
                        onClick={() => openDispute(item)}
                        className="inline-flex items-center gap-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 text-xs font-semibold px-2 py-1 whitespace-nowrap"
                      >
                        <AlertTriangle size={11} /> Dispute
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > rowsPerPage && (
          <div className="mt-4 flex items-center justify-between rounded-card border border-slate-200 bg-white px-5 py-4 shadow-card">
            <p className="text-sm font-medium text-slate-500">Page <span className="font-semibold text-navy-900">{currentPage}</span>/{totalPages}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="rounded-control border border-slate-200 px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="rounded-control border border-slate-200 px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Only the newest PAGE_LIMIT rows are fetched up front; older ones are
            pulled on demand so the initial load stays bounded. */}
        {!loading && hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-control border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load older transactions"}
            </button>
          </div>
        )}

        {/* PayIn Dispute History */}
        {disputes.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowDisputeHistory((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3 hover:text-[#1E88FF]"
            >
              <AlertTriangle size={15} className="text-orange-500" />
              PayIn Dispute History ({disputes.length})
              {showDisputeHistory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {showDisputeHistory && (
              <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-bold">Ticket #</th>
                      <th className="text-left px-4 py-3 font-bold">Subject</th>
                      <th className="text-left px-4 py-3 font-bold">Your Reason</th>
                      <th className="text-left px-4 py-3 font-bold">Status</th>
                      <th className="text-left px-4 py-3 font-bold">Admin Reply</th>
                      <th className="text-left px-4 py-3 font-bold">Raised On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1E88FF]">#{t.id}</td>
                        <td className="px-4 py-3 text-xs max-w-[220px]">
                          <div className="font-semibold text-slate-700 truncate">{t.subject}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px]">
                          <div className="whitespace-pre-wrap break-words">{t.issue?.split("\n\n---")[0]}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            t.status === "Resolved" ? "bg-green-100 text-green-700"
                            : t.status === "In Process" ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                          }`}>{t.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px]">
                          {t.admin_note || <span className="text-slate-400 italic">Awaiting reply</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{formatDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* View Details Modal */}
        {viewItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="relative w-full sm:max-w-[600px] rounded-t-2xl sm:rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
              <button onClick={() => setViewItem(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
              <h2 className="text-xl font-bold mb-5">Transaction Details</h2>

              {viewItem.upi_id && ["Pending", "UTR Submitted"].includes(String(viewItem.status)) && (() => {
                const upiUri = buildUpiUri({
                  upiId: viewItem.upi_id,
                  payeeName: viewItem.account_holder_name,
                  amount: viewItem.amount,
                  note: viewItem.unique_id || viewItem.transaction_id,
                  ref: viewItem.transaction_id,
                });
                return (
                  <div className="mb-5 flex flex-col items-center">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Scan & Pay</h3>
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <QRCodeSVG value={upiUri} size={170} level="M" includeMargin={false} />
                    </div>
                    <a
                      href={upiUri}
                      className="mt-3 inline-block bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-xs px-4 py-1.5 rounded-lg sm:hidden"
                    >
                      Open UPI App
                    </a>
                  </div>
                );
              })()}

              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Transaction Ref</span><span className="font-mono text-xs">{viewItem.transaction_id || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold">{money(viewItem.amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">UTR</span><span className="font-mono">{viewItem.utr_number || "—"}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500">Status</span><StatusPill status={viewItem.status} /></div>
                {viewItem.bank_name && <div className="flex justify-between"><span className="text-slate-500">Bank</span><span>{viewItem.bank_name}</span></div>}
                {viewItem.ifsc_code && <div className="flex justify-between"><span className="text-slate-500">IFSC</span><span className="font-mono">{viewItem.ifsc_code}</span></div>}
                {viewItem.account_number && <div className="flex justify-between"><span className="text-slate-500">Account</span><span className="font-mono">{viewItem.account_number}</span></div>}
                {viewItem.account_holder_name && <div className="flex justify-between"><span className="text-slate-500">Holder</span><span>{viewItem.account_holder_name}</span></div>}
                {viewItem.upi_id && <div className="flex justify-between"><span className="text-slate-500">UPI</span><span className="font-mono">{viewItem.upi_id}</span></div>}
                {viewItem.merchant_name && <div className="flex justify-between"><span className="text-slate-500">Merchant</span><span>{viewItem.merchant_name}</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-xs">{formatDate(viewItem.created_at)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Settled/Rejected</span><span className="text-xs">{formatDate(viewItem.approved_or_reject_date)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Dispute Status</span>
                  <DisputeStatusPill ticket={disputesByPayinId[viewItem.id]} />
                </div>
                {disputesByPayinId[viewItem.id] && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span className="font-semibold">Latest ticket:</span> #{disputesByPayinId[viewItem.id].id}
                    {disputesByPayinId[viewItem.id].admin_note && (
                      <div className="mt-1 text-slate-700">{disputesByPayinId[viewItem.id].admin_note}</div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
                <button
                  onClick={() => { setViewItem(null); openProofModal(viewItem); }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold px-4 py-2.5"
                >
                  <UploadCloud size={14} /> Update Proof
                </button>
                <button
                  onClick={() => { setViewItem(null); openDispute(viewItem); }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 text-sm font-semibold px-4 py-2.5"
                >
                  <AlertTriangle size={14} /> Raise Dispute
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button onClick={() => setViewItem(null)} className="rounded-lg bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Update Proof Modal */}
        {proofItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6">
              <button onClick={() => setProofItem(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
              <h2 className="text-xl font-bold mb-1">Update Payment Proof</h2>
              <p className="text-sm text-slate-500 mb-5">
                PayIn of <span className="font-semibold">{money(proofItem.amount)}</span>{" "}
                · Ref: <span className="font-mono text-xs">{proofItem.transaction_id || proofItem.id}</span>
              </p>
              {proofError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{proofError}</div>
              )}
              <form onSubmit={submitProof} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">UTR Number</label>
                  <input
                    type="text"
                    value={proofForm.utr_number}
                    onChange={(e) => setProofForm({ ...proofForm, utr_number: e.target.value })}
                    placeholder="UTR Number"
                    className="w-full h-11 rounded-lg border border-slate-300 px-3 font-mono text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Proof</label>
                  <input
                    type="file"
                    onChange={(e) => setProofForm({ ...proofForm, payment_proof: e.target.files?.[0] || null })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setProofItem(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">
                    Cancel
                  </button>
                  <button type="submit" disabled={proofSubmitting} className="rounded-lg bg-[#1E88FF] text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
                    {proofSubmitting ? "Saving..." : "Update Proof"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Dispute Modal */}
        {disputeItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <form onSubmit={submitDispute} className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6">
              <button type="button" onClick={() => setDisputeItem(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                <X size={18} />
              </button>
              <h2 className="text-xl font-bold mb-1">Raise Dispute</h2>
              <p className="text-sm text-slate-500 mb-5">
                PayIn of{" "}
                <span className="font-semibold">{money(disputeItem.amount)}</span>{" "}
                · Ref: <span className="font-mono text-xs">{disputeItem.transaction_id || disputeItem.id}</span>
              </p>
              {disputeError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{disputeError}</div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Reason for Dispute</label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe the issue with this transaction..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setDisputeItem(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={disputeSubmitting} className="rounded-lg bg-orange-600 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
                  {disputeSubmitting ? "Submitting..." : "Submit Dispute"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MerchantLayout>
  );
}
