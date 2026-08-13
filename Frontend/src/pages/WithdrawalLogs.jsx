import { useCallback, useMemo, useState } from "react";
import { RefreshCw, X, Search } from "lucide-react";
import api from "../api";
import usePolling from "../lib/usePolling";

// Newest N rows. Matches the backend's LIST_DEFAULT_LIMIT — this list used to
// pull every withdrawal ever recorded on a 10s timer. The status filter is
// applied server-side; `search` still scans this bounded window client-side.
const LIST_LIMIT = 200;

function StatusPill({ status }) {
  const styles = {
    pending: "bg-amber-100 text-amber-700",
    picked: "bg-blue-100 text-blue-700",
    utr_submitted: "bg-indigo-100 text-indigo-700",
    cleared: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  const label = { pending: "Pending", picked: "Picked", utr_submitted: "UTR Submitted", cleared: "Cleared", rejected: "Rejected" };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-700"}`}>{label[status] || status}</span>;
}

function SspayPill({ status }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const upper = String(status).toUpperCase();
  const styles = {
    SUCCESS: "bg-green-100 text-green-700",
    PENDING: "bg-amber-100 text-amber-700",
    PROCESSING: "bg-amber-100 text-amber-700",
    FAILED: "bg-red-100 text-red-700",
    REVERSED: "bg-red-100 text-red-700",
    EXPIRED: "bg-red-100 text-red-700",
  };
  return <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold ${styles[upper] || "bg-slate-100 text-slate-700"}`}>{upper}</span>;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function WithdrawalLogs() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sspayFilter, setSspayFilter] = useState("");
  const [webhookFilter, setWebhookFilter] = useState("");
  const [search, setSearch] = useState("");
  // Starts true: the mount fetch runs through usePolling's silent path, so
  // this is what shows the initial loading state.
  const [refreshing, setRefreshing] = useState(true);
  const [responseModal, setResponseModal] = useState(null);
  const [checkingId, setCheckingId] = useState(null);

  const fetchList = useCallback(async (silent = false) => {
    try {
      if (!silent) setRefreshing(true);
      const r = await api.get("/api/withdrawal/transactions", {
        params: {
          page: 1,
          limit: LIST_LIMIT,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      });
      setList(r.data || []);
      setError("");
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load");
    } finally {
      setRefreshing(false);
    }
  }, [statusFilter]);

  usePolling(() => fetchList(true), 10000, [fetchList]);

  const checkStatus = async (id) => {
    setCheckingId(id);
    try {
      const r = await api.post(`/api/withdrawal/transactions/${id}/check-status`);
      await fetchList(true);
      if (r.data?.message) alert(r.data.message);
    } catch (e) {
      alert(e?.response?.data?.message || "Could not check status");
    } finally {
      setCheckingId(null);
    }
  };

  const filtered = useMemo(() => {
    return list.filter((w) => {
      if (statusFilter && String(w.status) !== statusFilter) return false;
      if (sspayFilter) {
        if (sspayFilter === "NONE" && w.sspay_status) return false;
        if (sspayFilter !== "NONE" && String(w.sspay_status || "").toUpperCase() !== sspayFilter) return false;
      }
      if (webhookFilter === "sent" && !w.webhook_sent) return false;
      if (webhookFilter === "failed" && (w.webhook_sent || !w.webhook_response)) return false;
      if (webhookFilter === "none" && w.webhook_response) return false;
      if (search) {
        const s = search.toLowerCase();
        const hay = `${w.id} ${w.transaction_id || ""} ${w.merchant_name || ""} ${w.utr_number || ""} ${w.sspay_order_id || ""} ${w.account_number || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [list, statusFilter, sspayFilter, webhookFilter, search]);

  const counts = useMemo(() => {
    const c = { total: list.length, sspayManaged: 0, sspayFailed: 0, webhookFailed: 0, stuck: 0 };
    const hourAgo = Date.now() - 3600 * 1000;
    for (const w of list) {
      if (w.sspay_order_id) c.sspayManaged++;
      if (["FAILED", "REVERSED", "EXPIRED"].includes(String(w.sspay_status || "").toUpperCase())) c.sspayFailed++;
      if (w.webhook_response && !w.webhook_sent) c.webhookFailed++;
      if (["pending", "picked"].includes(w.status) && new Date(w.created_at).getTime() < hourAgo) c.stuck++;
    }
    return c;
  }, [list]);

  return (
    <div className="px-2 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Withdrawal Logs</h1>
          <p className="text-sm text-slate-600 mt-1">Diagnostic view — SSPay status, webhook delivery, failure reasons. Auto-refreshes every 10s.</p>
        </div>
        <button onClick={() => fetchList()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2.5 disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="rounded-lg bg-white border border-slate-200 p-3">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-2xl font-bold">{counts.total}</div>
        </div>
        <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
          <div className="text-xs text-indigo-700">SSPay-managed</div>
          <div className="text-2xl font-bold text-indigo-900">{counts.sspayManaged}</div>
        </div>
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <div className="text-xs text-red-700">SSPay failures</div>
          <div className="text-2xl font-bold text-red-900">{counts.sspayFailed}</div>
        </div>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <div className="text-xs text-amber-700">Webhook failed</div>
          <div className="text-2xl font-bold text-amber-900">{counts.webhookFailed}</div>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-700">Stuck &gt; 1h</div>
          <div className="text-2xl font-bold text-slate-900">{counts.stuck}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Search (ID / txn ref / merchant / UTR / account)</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 pl-8 pr-3 rounded border border-slate-300 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="picked">Picked</option>
            <option value="utr_submitted">UTR Submitted</option>
            <option value="cleared">Cleared</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">SSPay status</label>
          <select value={sspayFilter} onChange={(e) => setSspayFilter(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
            <option value="">All</option>
            <option value="NONE">Not SSPay</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="FAILED">FAILED</option>
            <option value="REVERSED">REVERSED</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Webhook delivery</label>
          <select value={webhookFilter} onChange={(e) => setWebhookFilter(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
            <option value="">All</option>
            <option value="sent">Sent OK</option>
            <option value="failed">Failed</option>
            <option value="none">Never attempted</option>
          </select>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[1400px]">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-bold">ID</th>
              <th className="text-left px-3 py-2 font-bold">Merchant</th>
              <th className="text-left px-3 py-2 font-bold">Type</th>
              <th className="text-right px-3 py-2 font-bold">Amount</th>
              <th className="text-left px-3 py-2 font-bold">Status</th>
              <th className="text-left px-3 py-2 font-bold">SSPay</th>
              <th className="text-left px-3 py-2 font-bold">SSPay Order</th>
              <th className="text-left px-3 py-2 font-bold">SSPay Failure</th>
              <th className="text-left px-3 py-2 font-bold">UTR</th>
              <th className="text-left px-3 py-2 font-bold">Webhook</th>
              <th className="text-left px-3 py-2 font-bold">Created</th>
              <th className="text-left px-3 py-2 font-bold">Cleared/Rejected</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="12" className="text-center py-6 text-slate-500">No matching rows</td></tr>
            ) : filtered.map((w) => (
              <tr key={w.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                <td className="px-3 py-2 font-mono">{w.id}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold">{w.merchant_name || "—"}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{(w.transaction_id || "").substring(0, 12)}…</div>
                </td>
                <td className="px-3 py-2 uppercase text-slate-600">{w.transaction_type}</td>
                <td className="px-3 py-2 text-right font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <StatusPill status={w.status} />
                    <button
                      type="button"
                      onClick={() => checkStatus(w.id)}
                      disabled={checkingId === w.id}
                      title="Check Latest Status"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={checkingId === w.id ? "animate-spin" : ""} />
                    </button>
                  </span>
                </td>
                <td className="px-3 py-2"><SspayPill status={w.sspay_status} /></td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{(w.sspay_order_id || "").substring(0, 16) || "—"}</td>
                <td className="px-3 py-2 text-red-700 text-[11px] max-w-[200px] truncate" title={w.sspay_failure_reason || ""}>
                  {w.sspay_failure_reason || "—"}
                </td>
                <td className="px-3 py-2 font-mono">{w.utr_number || "—"}</td>
                <td className="px-3 py-2">
                  {w.webhook_response ? (
                    <button onClick={() => setResponseModal(w)} className="inline-flex items-center gap-1 text-[11px]">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${w.webhook_sent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {w.webhook_sent ? "Sent" : "Failed"}
                      </span>
                      <span className="text-indigo-600 underline">view</span>
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(w.created_at)}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatDate(w.cleared_or_rejected_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {responseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 max-h-[80vh] overflow-y-auto">
            <button onClick={() => setResponseModal(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            <h2 className="text-xl font-bold mb-2">Webhook delivery — txn {responseModal.id}</h2>
            <p className="text-sm text-slate-600 mb-3">
              <span className="font-semibold">Status:</span>{" "}
              <span className={responseModal.webhook_sent ? "text-green-700" : "text-red-700"}>
                {responseModal.webhook_sent ? "Sent (success)" : "Failed"}
              </span>
            </p>
            {responseModal.webhook_url && (
              <div className="mb-3 text-sm">
                <span className="font-semibold">URL:</span>{" "}
                <code className="font-mono text-xs break-all">{responseModal.webhook_url}</code>
              </div>
            )}
            <div className="text-sm font-semibold mb-1">Response log:</div>
            <pre className="bg-slate-900 text-green-300 rounded p-3 text-[11px] overflow-auto whitespace-pre-wrap break-all">
              {responseModal.webhook_response || "(empty)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
