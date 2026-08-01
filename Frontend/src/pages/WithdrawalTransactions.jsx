import { useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import api from "../api";

function StatusPill({ status }) {
  const styles = {
    pending: "bg-amber-100 text-amber-700",
    picked: "bg-blue-100 text-blue-700",
    utr_submitted: "bg-indigo-100 text-indigo-700",
    cleared: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    refunded: "bg-purple-100 text-purple-700",
  };
  const label = {
    pending: "Pending",
    picked: "Picked",
    utr_submitted: "UTR Submitted",
    cleared: "Cleared ✓",
    rejected: "Rejected",
    refunded: "Refunded",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-700"}`}>{label[status] || status}</span>;
}
function formatDate(d) { return d ? new Date(d).toLocaleString("en-GB") : "—"; }

export default function WithdrawalTransactions() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [disputeFilter, setDisputeFilter] = useState(false);

  const [checkingId, setCheckingId] = useState(null);

  const fetchList = async () => {
    try { const r = await api.get("/api/withdrawal/transactions"); setList(r.data || []); }
    catch (e) { setError(e?.response?.data?.message || "Could not load"); }
  };
  useEffect(() => { fetchList(); const i = setInterval(fetchList, 7000); return () => clearInterval(i); }, []);

  const checkStatus = async (id) => {
    setCheckingId(id);
    try {
      const r = await api.post(`/api/withdrawal/transactions/${id}/check-status`);
      await fetchList();
      if (r.data?.message) alert(r.data.message);
    } catch (e) {
      alert(e?.response?.data?.message || "Could not check status");
    } finally {
      setCheckingId(null);
    }
  };

  const disputeCount = useMemo(() => list.filter((w) => w.merchant_disputed_at).length, [list]);

  const filtered = useMemo(() => {
    return list.filter((w) => {
      if (statusFilter && w.status !== statusFilter) return false;
      if (disputeFilter && !w.merchant_disputed_at) return false;
      if (startDate && new Date(w.created_at) < new Date(startDate)) return false;
      if (endDate && new Date(w.created_at) > new Date(endDate + "T23:59:59")) return false;
      return true;
    });
  }, [list, statusFilter, startDate, endDate, disputeFilter]);

  return (
    <div className="px-2 py-2">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Withdrawals</h1>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-11 w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 text-sm">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="picked">Picked</option>
            <option value="utr_submitted">UTR Submitted</option>
            <option value="cleared">Cleared</option>
            <option value="rejected">Rejected</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        {/* Date filters */}
        <div className="flex flex-wrap gap-3 items-center">
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
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Dispute alert banner */}
      {disputeCount > 0 && (
        <button
          type="button"
          onClick={() => setDisputeFilter((v) => !v)}
          className={`w-full mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${disputeFilter ? "border-orange-400 bg-orange-100" : "border-orange-200 bg-orange-50 hover:bg-orange-100"}`}
        >
          <AlertTriangle size={18} className="text-orange-600 shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-orange-800">
              {disputeCount} withdrawal dispute{disputeCount > 1 ? "s" : ""} raised by merchant{disputeCount > 1 ? "s" : ""}
            </span>
            <span className="ml-2 text-xs text-orange-600">
              {disputeFilter ? "— showing disputed only (click to clear)" : "— click to filter"}
            </span>
          </div>
        </button>
      )}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-bold">ID</th>
              <th className="text-left px-4 py-3 font-bold">Merchant</th>
              <th className="text-left px-4 py-3 font-bold">Amount</th>
              <th className="text-left px-4 py-3 font-bold">Destination</th>
              <th className="text-left px-4 py-3 font-bold">UTR</th>
              <th className="text-left px-4 py-3 font-bold">Agent</th>
              <th className="text-left px-4 py-3 font-bold">Created</th>
              <th className="text-left px-4 py-3 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-8 text-slate-500">No transactions</td></tr>
            ) : filtered.map((w) => (
              <tr key={w.id} className={`border-b border-slate-100 last:border-b-0 ${w.merchant_disputed_at ? "bg-orange-50/50" : ""}`}>
                <td className="px-4 py-3 font-mono text-xs">{w.id}</td>
                <td className="px-4 py-3">
                  <div>{w.merchant_name}</div>
                  {w.merchant_disputed_at && (
                    <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                      <AlertTriangle size={9} /> Dispute: {w.merchant_dispute_reason?.slice(0, 40)}{(w.merchant_dispute_reason?.length ?? 0) > 40 ? "…" : ""}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-xs">
                  {w.transaction_type === "upi" ? (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">UPI</div>
                      <div className="font-mono text-slate-700">{w.upi_id || "—"}</div>
                    </div>
                  ) : (
                    <div className="space-y-0.5 leading-tight">
                      <div className="font-semibold text-slate-700">{w.account_name || "—"}</div>
                      {w.bank_name && <div className="text-slate-500">{w.bank_name}</div>}
                      <div className="font-mono text-slate-600">A/C {w.account_number || "—"}</div>
                      <div className="font-mono text-slate-500">IFSC {w.ifsc_code || "—"}</div>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{w.utr_number || "—"}</td>
                <td className="px-4 py-3 text-xs">
                  {w.agent_name
                    ? w.agent_name
                    : w.sspay_order_id
                      ? (w.assigned_agent_name || "Auto")
                      : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(w.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <StatusPill status={w.status} />
                    <button
                      type="button"
                      onClick={() => checkStatus(w.id)}
                      disabled={checkingId === w.id}
                      title="Check Latest Status"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={checkingId === w.id ? "animate-spin" : ""} />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
