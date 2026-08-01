import { useEffect, useState, useCallback } from "react";
import {
  FlaskConical, Plus, RefreshCw, CheckCircle2, Clock, XCircle,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  ArrowDownLeft, ArrowUpRight, ShieldAlert,
  MessageCircleWarning, Timer,
} from "lucide-react";
import api from "../../api";

// ============================================================
// TEST MODE — ADMIN SIDE
// Available to admins of any client with test_mode_enabled=true.
// Admin responsibilities in test mode:
//   (a) Add virtual test balance to the designated test merchant (for withdrawal testing)
//   (b) View all virtual PayIns (read-only) — no approve / expire / fail here
//
// PayIn approval flow is handled by the Agent Panel (/agent/masterpay-test),
// matching the production role hierarchy where agents drive PayIn outcomes.
// No production tables (transactions, balances, commissions) are touched.
// Remove this file and its route/sidebar link when testing is complete.
// ============================================================

// ── Shared helpers ────────────────────────────────────────────

const WD_STATUS = {
  pending:  { cls: "bg-amber-100 text-amber-800 border-amber-200",  Icon: Clock,        label: "Pending" },
  cleared:  { cls: "bg-green-100 text-green-800 border-green-200",  Icon: CheckCircle2, label: "Cleared" },
  rejected: { cls: "bg-red-100 text-red-800 border-red-200",        Icon: XCircle,      label: "Rejected" },
};

const PI_STATUS = {
  Pending:         { cls: "bg-amber-100 text-amber-800 border-amber-200",    Icon: Clock,                label: "Pending" },
  "UTR Submitted": { cls: "bg-blue-100 text-blue-800 border-blue-200",       Icon: Timer,                label: "UTR Submitted" },
  Approved:        { cls: "bg-green-100 text-green-800 border-green-200",    Icon: CheckCircle2,         label: "Approved" },
  Expired:         { cls: "bg-gray-100 text-gray-600 border-gray-200",       Icon: XCircle,              label: "Expired" },
  Failed:          { cls: "bg-red-100 text-red-800 border-red-200",          Icon: ShieldAlert,          label: "Failed" },
  Disputed:        { cls: "bg-purple-100 text-purple-800 border-purple-200", Icon: MessageCircleWarning, label: "Disputed" },
};

function WdBadge({ status }) {
  const s = WD_STATUS[status] || WD_STATUS.pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.cls}`}><s.Icon size={11} />{s.label}</span>;
}
function PiBadge({ status }) {
  const s = PI_STATUS[status] || PI_STATUS.Pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.cls}`}><s.Icon size={11} />{s.label}</span>;
}

function money(v) { return `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleString("en-IN") : "—"; }

// ── Withdrawal section ────────────────────────────────────────

function WithdrawalSection({ enabled }) {
  const [txns,      setTxns]      = useState([]);
  const [txnLoad,   setTxnLoad]   = useState(false);
  const [txnErr,    setTxnErr]    = useState("");
  const [utrInputs, setUtrInputs] = useState({});
  const [actioning, setActioning] = useState({});
  const [actioned,  setActioned]  = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const fetchTxns = useCallback(async () => {
    setTxnLoad(true); setTxnErr("");
    try {
      const r = await api.get("/api/masterpay-test/withdrawals");
      setTxns(r.data || []);
    } catch { setTxnErr("Could not load test withdrawals."); }
    finally { setTxnLoad(false); }
  }, []);

  useEffect(() => { if (enabled) fetchTxns(); }, [enabled, fetchTxns]);

  async function handleAction(transaction_id, action) {
    setActioning(p => ({ ...p, [transaction_id]: action }));
    try {
      if (action === "success") {
        const utr = (utrInputs[transaction_id] || "").trim();
        await api.post("/api/masterpay-test/withdrawal/manual-success", { transaction_id, utr_number: utr || undefined });
        setActioned(p => ({ ...p, [transaction_id]: "cleared" }));
      } else {
        await api.post("/api/masterpay-test/withdrawal/manual-reject", { transaction_id });
        setActioned(p => ({ ...p, [transaction_id]: "rejected" }));
      }
      fetchTxns();
    } catch (err) {
      alert(err?.response?.data?.message || "Action failed");
    } finally { setActioning(p => ({ ...p, [transaction_id]: null })); }
  }

  const pending = txns.filter(t => t.status === "pending");
  const settled = txns.filter(t => t.status !== "pending");

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-600" />
            <span className="font-semibold text-gray-800">Pending Test Withdrawals</span>
            {pending.length > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                {pending.length} awaiting action
              </span>
            )}
          </div>
          <button type="button" onClick={fetchTxns} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {txnLoad ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Loading…</div>
        ) : txnErr ? (
          <div className="py-6 text-center text-sm text-red-500">{txnErr}</div>
        ) : pending.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No pending test withdrawals.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pending.map(row => {
              const isActioning = actioning[row.transaction_id];
              return (
                <div key={row.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{row.transaction_id}</code>
                        <WdBadge status={actioned[row.transaction_id] || row.status} />
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-bold text-gray-900">{money(row.amount)}</span>
                        <span className="text-gray-500 capitalize">{row.transaction_type}</span>
                        {row.transaction_type === "upi"
                          ? <span className="text-gray-600">{row.upi_id}</span>
                          : <span className="text-gray-600">{row.account_name} / {row.ifsc_code}</span>}
                      </div>
                      <div className="text-xs text-gray-400">
                        Merchant: <strong>{row.merchant_username || "—"}</strong> · Created: {fmtDate(row.created_at)}
                      </div>
                      {row.webhook_url && <div className="text-xs text-gray-400">Webhook: <span className="text-blue-600">{row.webhook_url}</span></div>}
                    </div>
                    {!actioned[row.transaction_id] ? (
                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">UTR Number (optional)</label>
                          <input type="text" value={utrInputs[row.transaction_id] || ""}
                            onChange={e => setUtrInputs(p => ({ ...p, [row.transaction_id]: e.target.value }))}
                            placeholder="auto-generated if blank"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400" />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleAction(row.transaction_id, "success")} disabled={!!isActioning}
                            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1">
                            {isActioning === "success" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Manual Success
                          </button>
                          <button type="button" onClick={() => handleAction(row.transaction_id, "reject")} disabled={!!isActioning}
                            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1">
                            {isActioning === "reject" ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${actioned[row.transaction_id] === "cleared" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                        {actioned[row.transaction_id] === "cleared" ? "Marked as Success ✓" : "Marked as Rejected ✕"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {settled.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" />
            <span className="font-semibold text-gray-800">Withdrawal History</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{["Transaction ID","Amount","Type","Status","UTR","Settled At",""].map(h => <th key={h} className="px-4 py-3 text-left font-bold text-gray-600">{h}</th>)}</tr>
              </thead>
              <tbody>
                {settled.map(row => (
                  <>
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-600 max-w-[140px] truncate">{row.transaction_id}</td>
                      <td className="px-4 py-3 font-semibold">{money(row.amount)}</td>
                      <td className="px-4 py-3 capitalize">{row.transaction_type}</td>
                      <td className="px-4 py-3"><WdBadge status={row.status} /></td>
                      <td className="px-4 py-3 font-mono">{row.utr_number || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(row.cleared_or_rejected_date)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                          className="text-[#2B7DE9] hover:underline flex items-center gap-1">
                          {expandedId === row.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} More
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr key={`${row.id}-d`} className="bg-blue-50">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            {row.transaction_type === "upi"
                              ? <div><span className="text-gray-400">UPI ID</span><br /><strong>{row.upi_id}</strong></div>
                              : <><div><span className="text-gray-400">Account</span><br /><strong>{row.account_name} / {row.account_number}</strong></div><div><span className="text-gray-400">IFSC</span><br /><strong>{row.ifsc_code}</strong></div></>}
                            <div><span className="text-gray-400">Webhook Fired</span><br /><span className={row.webhook_sent ? "text-green-700" : "text-gray-500"}>{row.webhook_sent ? "Yes" : "No"}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PayIn section (read-only for admin — actions are in the Agent Panel) ──

function PayInSection({ enabled }) {
  const [payins,     setPayins]     = useState([]);
  const [piLoad,     setPiLoad]     = useState(false);
  const [piErr,      setPiErr]      = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const fetchPayIns = useCallback(async () => {
    setPiLoad(true); setPiErr("");
    try {
      const r = await api.get("/api/masterpay-test/payins");
      setPayins(r.data || []);
    } catch { setPiErr("Could not load test PayIns."); }
    finally { setPiLoad(false); }
  }, []);

  useEffect(() => { if (enabled) fetchPayIns(); }, [enabled, fetchPayIns]);

  const active  = payins.filter(p => ["Pending", "UTR Submitted"].includes(p.status));
  const settled = payins.filter(p => !["Pending", "UTR Submitted"].includes(p.status));

  return (
    <div className="space-y-5">

      {/* Agent Panel pointer */}
      <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
        <ShieldAlert size={17} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <strong>To approve, expire, or fail test PayIns, use the Agent Panel.</strong>
          <br />
          Log in as a test agent and navigate to{" "}
          <code className="bg-blue-100 px-1 rounded">/agent/masterpay-test</code>.
          This matches the production flow where agents drive PayIn outcomes — not admins.
        </div>
      </div>

      {/* Active PayIns — view-only */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-600" />
            <span className="font-semibold text-gray-800">Active Test PayIns (Read-Only)</span>
            {active.length > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                {active.length} pending agent action
              </span>
            )}
          </div>
          <button type="button" onClick={fetchPayIns} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {piLoad ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Loading…</div>
        ) : piErr ? (
          <div className="py-6 text-center text-sm text-red-500">{piErr}</div>
        ) : active.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No active test PayIns.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{["Ref","Amount","Status","Merchant","UTR Submitted","Created","Webhook"].map(h => <th key={h} className="px-4 py-3 text-left font-bold text-gray-600">{h}</th>)}</tr>
              </thead>
              <tbody>
                {active.map(row => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-[10px] text-gray-600 max-w-[130px] truncate">{row.transaction_id}</td>
                    <td className="px-4 py-3 font-semibold">{money(row.amount)}</td>
                    <td className="px-4 py-3"><PiBadge status={row.status} /></td>
                    <td className="px-4 py-3">{row.merchant_username || "—"}</td>
                    <td className="px-4 py-3 font-mono">{row.utr_number || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(row.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[180px] truncate">{row.webhook_url || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settled PayIn history */}
      {settled.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" />
            <span className="font-semibold text-gray-800">PayIn History</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{["Ref","Amount","Status","UTR","Settled At","Webhook",""].map(h => <th key={h} className="px-4 py-3 text-left font-bold text-gray-600">{h}</th>)}</tr>
              </thead>
              <tbody>
                {settled.map(row => (
                  <>
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-600 max-w-[130px] truncate">{row.transaction_id}</td>
                      <td className="px-4 py-3 font-semibold">{money(row.amount)}</td>
                      <td className="px-4 py-3"><PiBadge status={row.status} /></td>
                      <td className="px-4 py-3 font-mono">{row.utr_number || row.disputed_utr || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(row.approved_or_reject_date)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${row.webhook_sent ? "text-green-700" : "text-gray-400"}`}>
                          {row.webhook_sent ? "Fired ✓" : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                          className="text-[#2B7DE9] hover:underline flex items-center gap-1">
                          {expandedId === row.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} More
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr key={`${row.id}-d`} className="bg-blue-50">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            {row.merchant_order_id && <div><span className="text-gray-400">Order ID</span><br />{row.merchant_order_id}</div>}
                            {row.unique_id && <div><span className="text-gray-400">Unique ID</span><br />{row.unique_id}</div>}
                            {row.customer_name && <div><span className="text-gray-400">Customer</span><br />{row.customer_name}</div>}
                            {row.webhook_url && <div><span className="text-gray-400">Webhook URL</span><br /><span className="break-all">{row.webhook_url}</span></div>}
                            {row.disputed_utr && <div><span className="text-gray-400">Disputed UTR</span><br /><strong className="text-purple-700">{row.disputed_utr}</strong></div>}
                            {row.payment_proof && <div><span className="text-gray-400">Proof</span><br />{row.payment_proof}</div>}
                            {row.webhook_response && (
                              <div className="col-span-2">
                                <span className="text-gray-400">Webhook Response</span><br />
                                <code className="break-all text-[10px]">{row.webhook_response}</code>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────

export default function MasterPayTestAdmin() {
  const [status,    setStatus]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState("payin");

  const [balAmt,    setBalAmt]    = useState("");
  const [balAdding, setBalAdding] = useState(false);
  const [balMsg,    setBalMsg]    = useState(null);
  const [newBal,    setNewBal]    = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/api/masterpay-test/status");
      setStatus(r.data);
    } catch { setError("Could not verify test mode access."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleAddBalance(e) {
    e.preventDefault();
    setBalMsg(null); setBalAdding(true);
    try {
      const r = await api.post("/api/masterpay-test/balance/add", { amount: Number(balAmt) });
      setBalMsg({ ok: true, text: `Balance added. New total: ₹${Number(r.data.new_balance).toLocaleString("en-IN")}` });
      setNewBal(r.data.new_balance);
      setBalAmt("");
    } catch (err) {
      setBalMsg({ ok: false, text: err?.response?.data?.message || "Failed to add balance" });
    } finally { setBalAdding(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 gap-2 text-gray-400">
        <Loader2 size={20} className="animate-spin" /> Verifying access…
      </div>
    );
  }

  if (error || !status?.enabled) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
          <XCircle size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Access Denied</h2>
        <p className="text-sm text-gray-500">
          {error || "Test mode is only available to admins of a test-mode-enabled client."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
              <FlaskConical size={22} className="text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Test Mode — Admin Panel</h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                Add virtual balance for the test merchant (withdrawal testing) and view all test PayIn activity.
                PayIn approvals, expiries, and failures are driven by the{" "}
                <strong className="text-gray-700">Agent Panel</strong> — matching the production role hierarchy.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 uppercase tracking-wide">
              Admin — Test Mode
            </span>
            <span className="text-xs text-gray-400">Test Mode clients only</span>
          </div>
        </div>
      </div>

      {/* Notice */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          <strong>Temporary testing feature.</strong> All data is isolated in
          <code className="bg-amber-100 px-1 rounded mx-1">masterpay_test_*</code> tables.
          No real transactions, balances, commissions, settlements, or agent accounts are touched.
          Webhooks fire to whatever URL the merchant configured.
        </p>
      </div>

      {/* Add test balance — always visible (applies to Withdrawal balance) */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-2">
          <Plus size={16} className="text-[#2B7DE9]" />
          <span className="font-semibold text-gray-800">Add Test Withdrawal Balance</span>
        </div>
        <div className="p-5">
          {newBal !== null && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs text-gray-400 mb-0.5">Updated Test Balance</p>
              <p className="text-2xl font-bold text-gray-900">₹{Number(newBal).toLocaleString("en-IN")}</p>
            </div>
          )}
          <form onSubmit={handleAddBalance} className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Amount to Add (₹)</label>
              <input type="number" min="1" value={balAmt} onChange={e => setBalAmt(e.target.value)}
                required placeholder="e.g. 5000"
                className="w-48 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={balAdding || !balAmt}
              className="bg-[#2B7DE9] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm flex items-center gap-2">
              {balAdding ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : "Add Balance"}
            </button>
          </form>
          {balMsg && (
            <div className={`mt-3 rounded-xl border p-3 text-sm ${balMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
              {balMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        <button type="button" onClick={() => setTab("payin")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "payin" ? "bg-white text-[#2B7DE9] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <ArrowDownLeft size={16} /> PayIn Management
        </button>
        <button type="button" onClick={() => setTab("withdrawal")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "withdrawal" ? "bg-white text-[#2B7DE9] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <ArrowUpRight size={16} /> Withdrawal Management
        </button>
      </div>

      {tab === "payin"
        ? <PayInSection enabled={status.enabled} />
        : <WithdrawalSection enabled={status.enabled} />
      }
    </div>
  );
}
