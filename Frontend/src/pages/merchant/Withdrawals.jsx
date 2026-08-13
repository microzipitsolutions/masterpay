import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X, CheckCircle2, XCircle, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import MerchantLayout from "../../layouts/MerchantLayout";
import api from "../../api";
import usePolling from "../../lib/usePolling";
import { Badge, PageHeader } from "../../components/ui";

// Newest N rows; matches the backend's LIST_DEFAULT_LIMIT.
const LIST_LIMIT = 200;

const STATUS_LABEL = {
  pending: "Pending",
  picked: "Picked",
  utr_submitted: "UTR Submitted",
  cleared: "Cleared ✓",
  rejected: "Rejected",
  refunded: "Refunded",
};

function StatusPill({ status }) {
  return <Badge status={status}>{STATUS_LABEL[status] || status}</Badge>;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB");
}

export default function MerchantWithdrawals() {
  const [list, setList] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ amount: "", transaction_type: "upi", upi_id: "", account_name: "", account_number: "", ifsc_code: "", webhook_url: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [wallet, setWallet] = useState(null);

  // Date filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // Dispute state
  const [disputeItem, setDisputeItem] = useState(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [disputeSuccess, setDisputeSuccess] = useState(null); // { ticketId }

  // Dispute history (withdrawal-linked tickets)
  const [disputes, setDisputes] = useState([]);
  const [showDisputeHistory, setShowDisputeHistory] = useState(false);

  // Bounded to the newest LIST_LIMIT rows — this polled the merchant's entire
  // withdrawal history every 7 seconds. Search and date filters below still
  // narrow this window client-side.
  const fetchList = useCallback(async () => {
    try {
      const r = await api.get("/api/withdrawal/transactions", {
        params: { page: 1, limit: LIST_LIMIT },
      });
      setList(r.data || []);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load");
    }
  }, []);
  const fetchWallet = async () => {
    try {
      const r = await api.get("/api/withdrawal/my-sspay-balance");
      setWallet(r.data || null);
    } catch {
      setWallet(null);
    }
  };
  const fetchDisputes = async () => {
    try {
      const r = await api.get("/api/tickets");
      setDisputes((r.data || []).filter((t) => t.withdrawal_id != null));
    } catch {
      setDisputes([]);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  usePolling(() => {
    fetchList();
    fetchWallet();
  }, 7000, [fetchList]);

  const walletInfo = wallet && wallet.enabled && wallet.ok && wallet.balance != null
    ? { balance: Number(wallet.balance), min: Number(wallet.min || 0), max: Number(wallet.max || 0), mode: wallet.mode }
    : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((w) => {
      if (startDate && new Date(w.created_at) < new Date(startDate)) return false;
      if (endDate && new Date(w.created_at) > new Date(endDate + "T23:59:59")) return false;
      if (q) {
        const hay = [w.utr_number, w.account_number, w.upi_id, w.account_name, w.id, w.amount]
          .map((v) => String(v ?? "").toLowerCase());
        if (!hay.some((v) => v.includes(q))) return false;
      }
      return true;
    });
  }, [list, startDate, endDate, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  useEffect(() => {
    setCurrentPage(1);
  }, [search, startDate, endDate]);

  const totalPaidOut = useMemo(
    () => list.filter((w) => w.status === "cleared").reduce((s, w) => s + Number(w.amount), 0),
    [list],
  );

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.amount || Number(form.amount) <= 0) { setError("Valid amount required"); return; }
    if (form.transaction_type === "upi" && !form.upi_id.trim()) { setError("UPI ID required"); return; }
    if (form.transaction_type === "account" && (!form.account_number.trim() || !form.account_name.trim() || !form.ifsc_code.trim())) {
      setError("All bank fields required"); return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/withdrawal/transactions", { ...form, amount: Number(form.amount) });
      setShowCreate(false);
      setForm({ amount: "", transaction_type: "upi", upi_id: "", account_name: "", account_number: "", ifsc_code: "", webhook_url: "" });
      fetchList();
    } catch (e2) {
      setError(e2?.response?.data?.message || "Could not create");
    } finally {
      setSubmitting(false);
    }
  };

  const [checking, setChecking] = useState(null);
  const checkStatus = async (id) => {
    setChecking(id);
    try {
      const r = await api.post(`/api/withdrawal/transactions/${id}/check-status`);
      if (r.data?.transaction) {
        setViewItem((prev) => (prev && prev.id === id ? r.data.transaction : prev));
        setList((prev) => prev.map((w) => w.id === id ? { ...w, ...r.data.transaction } : w));
      }
      await fetchList();
      if (r.data?.message) alert(r.data.message);
    } catch (e) {
      alert(e?.response?.data?.message || "Could not check status");
    } finally {
      setChecking(null);
    }
  };

  const act = async (id, action) => {
    if (!window.confirm(`${action === "approve" ? "Approve" : "Reject"} this withdrawal?`)) return;
    setActing(id);
    try {
      await api.post(`/api/withdrawal/transactions/${id}/${action}`);
      fetchList();
    } catch (e) {
      alert(e?.response?.data?.message || "Action failed");
    } finally {
      setActing(null);
    }
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
      const r = await api.post(`/api/withdrawal/transactions/${disputeItem.id}/dispute`, { reason: disputeReason });
      setDisputeItem(null);
      setDisputeSuccess({ ticketId: r.data?.ticket_id });
      await fetchList();
      await fetchDisputes();
      setShowDisputeHistory(true);
    } catch (e) {
      setDisputeError(e?.response?.data?.message || "Could not raise dispute");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  return (
    <MerchantLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        <PageHeader
          className="mb-6"
          title="Withdrawals"
          actions={
            <>
              {walletInfo && (
                <div className="rounded-control border border-slate-200 bg-white px-4 py-2 text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Wallet balance</div>
                  <div className={`text-lg font-bold leading-none ${walletInfo.balance < 250000 ? "text-danger" : "text-success"}`}>
                    ₹{walletInfo.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )}
              <div className="rounded-control border border-brand-teal/25 bg-brand-teal-light px-4 py-2 text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-teal-dark/70">Total Paid Out</div>
                <div className="text-lg font-bold leading-none text-brand-teal-dark">
                  ₹{totalPaidOut.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>
              <button onClick={() => { setShowCreate(true); fetchWallet(); }} className="inline-flex items-center gap-2 rounded-control brand-gradient text-white font-semibold px-4 py-2.5 shadow-[0_4px_14px_rgba(30,136,255,0.35)] hover:brightness-[1.06]">
                <Plus size={16} /> New Withdrawal
              </button>
            </>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="UTR / account / UPI..."
              className="h-9 w-56 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600 whitespace-nowrap">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }} className="h-9 px-3 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">
              Clear
            </button>
          )}
        </div>

        {/* Dispute submitted success banner */}
        {disputeSuccess && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start justify-between gap-3">
            <div className="text-sm text-emerald-800">
              <span className="font-semibold">Dispute raised.</span> Ticket #{disputeSuccess.ticketId} has been created. Our team will review it and reply shortly. You can track it in the{" "}
              <span className="font-semibold cursor-pointer underline" onClick={() => setShowDisputeHistory(true)}>Dispute History</span> section below.
            </div>
            <button onClick={() => setDisputeSuccess(null)} className="text-emerald-600 hover:text-emerald-800 shrink-0">
              <X size={16} />
            </button>
          </div>
        )}

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-bold">#</th>
                <th className="text-left px-4 py-3 font-bold">Amount</th>
                <th className="text-left px-4 py-3 font-bold">Destination</th>
                <th className="text-left px-4 py-3 font-bold">UTR</th>
                <th className="text-left px-4 py-3 font-bold">Created</th>
                <th className="text-left px-4 py-3 font-bold">Cleared/Rejected</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-right px-4 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-8 text-slate-500">No withdrawals yet</td></tr>
              ) : paged.map((w, index) => (
                <tr key={w.id} className={`border-b border-slate-100 last:border-b-0 ${w.merchant_disputed_at ? "bg-orange-50/40" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs">{(currentPage - 1) * PAGE_SIZE + index + 1}</td>
                  <td className="px-4 py-3 font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-xs">
                    {w.transaction_type === "upi" ? (
                      <span className="font-mono">{w.upi_id}</span>
                    ) : (
                      <span>{w.account_name} · <span className="font-mono">{w.account_number}</span></span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{w.utr_number || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(w.created_at)}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(w.cleared_or_rejected_date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusPill status={w.status} />
                      <button
                        type="button"
                        onClick={() => checkStatus(w.id)}
                        disabled={checking === w.id}
                        title="Check Latest Status"
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={checking === w.id ? "animate-spin" : ""} />
                      </button>
                      {w.merchant_disputed_at && (
                        <span title={w.merchant_dispute_reason} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                          <AlertTriangle size={10} /> Disputed
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setViewItem(w)} className="text-[#1E88FF] underline text-xs mr-2">View</button>
                    {w.status === "utr_submitted" && (
                      <>
                        <button disabled={acting === w.id} onClick={() => act(w.id, "approve")} className="inline-flex items-center gap-1 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50 mr-1">
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        <button disabled={acting === w.id} onClick={() => act(w.id, "reject")} className="inline-flex items-center gap-1 rounded border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold px-3 py-1.5 disabled:opacity-50">
                          <XCircle size={12} /> Reject
                        </button>
                      </>
                    )}
                    {w.status === "cleared" && !w.merchant_disputed_at && (
                      <button onClick={() => openDispute(w)} className="inline-flex items-center gap-1 rounded border border-orange-300 text-orange-700 hover:bg-orange-50 text-xs font-semibold px-3 py-1.5">
                        <AlertTriangle size={12} /> Raise Dispute
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="mt-3 flex items-center justify-between px-1">
            <p className="text-sm text-slate-600">
              Page {currentPage} / {totalPages} · {filtered.length} total
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-control border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-control border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Withdrawal Dispute History */}
        {disputes.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowDisputeHistory((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3 hover:text-[#1E88FF]"
            >
              <AlertTriangle size={15} className="text-orange-500" />
              Withdrawal Dispute History ({disputes.length})
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
                          }`}>
                            {t.status}
                          </span>
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

        {/* New Withdrawal Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <form onSubmit={submit} className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
              <button type="button" onClick={() => setShowCreate(false)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
              <h2 className="text-xl font-bold mb-5">New Withdrawal</h2>

              {walletInfo && (
                <div className={`mb-4 rounded-lg border px-4 py-3 ${walletInfo.balance < 250000 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Available wallet balance</span>
                    <span className={`text-lg font-bold ${walletInfo.balance < 250000 ? "text-red-600" : "text-emerald-700"}`}>
                      ₹{walletInfo.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {(walletInfo.min > 0 || walletInfo.max > 0) && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Per payout: min ₹{walletInfo.min.toLocaleString("en-IN")} · max ₹{walletInfo.max.toLocaleString("en-IN")}
                    </div>
                  )}
                </div>
              )}

              {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Amount</label>
                  <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" required />
                  {walletInfo && Number(form.amount) > walletInfo.balance && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      Amount exceeds your wallet balance (₹{walletInfo.balance.toLocaleString("en-IN")}).
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Payout Type</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm({ ...form, transaction_type: "upi" })} className={`flex-1 h-11 rounded-lg border text-sm font-semibold ${form.transaction_type === "upi" ? "border-[#1E88FF] bg-blue-50 text-[#1E88FF]" : "border-slate-300 bg-white text-slate-700"}`}>UPI</button>
                    <button type="button" onClick={() => setForm({ ...form, transaction_type: "account" })} className={`flex-1 h-11 rounded-lg border text-sm font-semibold ${form.transaction_type === "account" ? "border-[#1E88FF] bg-blue-50 text-[#1E88FF]" : "border-slate-300 bg-white text-slate-700"}`}>Bank Account</button>
                  </div>
                </div>

                {form.transaction_type === "upi" ? (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">UPI ID</label>
                    <input type="text" value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="example@bank" className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono" />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Account Holder Name</label>
                      <input type="text" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">Account Number</label>
                      <input type="text" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">IFSC Code</label>
                      <input type="text" value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono" />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Webhook URL (optional)</label>
                  <input type="text" value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-lg brand-gradient text-white px-5 py-2.5 text-sm font-semibold shadow-[0_4px_14px_rgba(30,136,255,0.35)] disabled:opacity-50">{submitting ? "Saving..." : "Create"}</button>
              </div>
            </form>
          </div>
        )}

        {/* View Details Modal */}
        {viewItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
              <button onClick={() => setViewItem(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
              <h2 className="text-xl font-bold mb-5">Withdrawal Details</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Transaction Ref</span><span className="font-mono text-xs">{viewItem.transaction_id}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-semibold">₹{Number(viewItem.amount).toLocaleString("en-IN")}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Type</span><span>{viewItem.transaction_type}</span></div>
                {viewItem.transaction_type === "upi" ? (
                  <div className="flex justify-between"><span className="text-slate-500">UPI</span><span className="font-mono">{viewItem.upi_id}</span></div>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">Holder</span><span>{viewItem.account_name}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">A/C</span><span className="font-mono">{viewItem.account_number}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">IFSC</span><span className="font-mono">{viewItem.ifsc_code}</span></div>
                  </>
                )}
                <div className="flex justify-between"><span className="text-slate-500">UTR</span><span className="font-mono">{viewItem.utr_number || "—"}</span></div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="flex items-center gap-2">
                    <StatusPill status={viewItem.status} />
                    <button
                      type="button"
                      onClick={() => checkStatus(viewItem.id)}
                      disabled={checking === viewItem.id}
                      title="Check Latest Status"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={checking === viewItem.id ? "animate-spin" : ""} />
                    </button>
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-xs">{formatDate(viewItem.created_at)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Settled/Rejected</span><span className="text-xs">{formatDate(viewItem.cleared_or_rejected_date)}</span></div>
                {viewItem.notes && <div><span className="text-slate-500">Notes:</span> <span className="text-xs">{viewItem.notes}</span></div>}
                {viewItem.merchant_disputed_at && (
                  <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                    <div className="text-xs font-semibold text-orange-700 flex items-center gap-1 mb-1">
                      <AlertTriangle size={12} /> Dispute raised on {formatDate(viewItem.merchant_disputed_at)}
                    </div>
                    <div className="text-xs text-slate-600">{viewItem.merchant_dispute_reason}</div>
                  </div>
                )}
              </div>
              {viewItem.status === "cleared" && !viewItem.merchant_disputed_at && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button onClick={() => { setViewItem(null); openDispute(viewItem); }} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 text-sm font-semibold px-4 py-2.5">
                    <AlertTriangle size={14} /> Raise Dispute
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dispute Modal */}
        {disputeItem && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <form onSubmit={submitDispute} className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6">
              <button type="button" onClick={() => setDisputeItem(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
              <h2 className="text-xl font-bold mb-1">Raise Dispute</h2>
              <p className="text-sm text-slate-500 mb-5">
                Withdrawal of <span className="font-semibold">₹{Number(disputeItem.amount).toLocaleString("en-IN")}</span> · Ref: <span className="font-mono text-xs">{disputeItem.transaction_id}</span>
              </p>
              {disputeError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{disputeError}</div>}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Reason for Dispute</label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Describe the issue with this withdrawal..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none"
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setDisputeItem(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
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
