import { useEffect, useState, useCallback } from "react";
import {
  FlaskConical, RefreshCw, CheckCircle2, Clock, XCircle,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  ShieldAlert, MessageCircleWarning, Timer,
} from "lucide-react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";

// ============================================================
// TEST MODE — AGENT SIDE
// Available to agents of any client with test_mode_enabled=true.
//
// In production, the agent (who owns the collection bank/UPI accounts) is
// responsible for:
//   1. Owning bank/UPI accounts that receive merchant customer payments
//   2. Submitting UTRs when they see incoming payments (agent-submitutr)
//      → This matches a pending merchant PayIn and auto-approves it
//   3. PayIns whose UTRs can't be auto-matched end up as Approved via payment-proof flow
//
// In test mode the agent manually drives the same outcomes:
//   Pending        → [Approve] (payin.approved)  |  [Expire] (payin.expired)
//   UTR Submitted  → [Approve] (payin.approved)  |  [Fail]   (payin.failed)
//
// Merchant can then Dispute a Failed order (payin.disputed).
//
// All data stays inside masterpay_test_payins — no real tables touched.
// Remove this file and its route/sidebar link when testing is complete.
// ============================================================

// ── Status maps ───────────────────────────────────────────────

const PI_STATUS = {
  Pending:         { cls: "bg-amber-100 text-amber-800 border-amber-200",    Icon: Clock,                label: "Pending" },
  "UTR Submitted": { cls: "bg-blue-100 text-blue-800 border-blue-200",       Icon: Timer,                label: "UTR Submitted" },
  Approved:        { cls: "bg-green-100 text-green-800 border-green-200",    Icon: CheckCircle2,         label: "Approved" },
  Expired:         { cls: "bg-gray-100 text-gray-600 border-slate-200",       Icon: XCircle,              label: "Expired" },
  Failed:          { cls: "bg-red-100 text-red-800 border-red-200",          Icon: ShieldAlert,          label: "Failed" },
  Disputed:        { cls: "bg-purple-100 text-purple-800 border-purple-200", Icon: MessageCircleWarning, label: "Disputed" },
};

function PiBadge({ status }) {
  const s = PI_STATUS[status] || PI_STATUS.Pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.cls}`}>
      <s.Icon size={11} />{s.label}
    </span>
  );
}

function money(v) { return `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleString("en-IN") : "—"; }

// ── Main page ─────────────────────────────────────────────────

export default function MasterPayTest() {
  const [status,    setStatus]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const [payins,    setPayins]    = useState([]);
  const [piLoad,    setPiLoad]    = useState(false);
  const [piErr,     setPiErr]     = useState("");

  const [utrInputs, setUtrInputs] = useState({});
  const [actioning, setActioning] = useState({});
  const [actioned,  setActioned]  = useState({});
  const [expandedId, setExpandedId] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/api/masterpay-test/status");
      setStatus(r.data);
    } catch { setError("Could not verify test mode access."); }
    finally { setLoading(false); }
  }, []);

  const fetchPayIns = useCallback(async () => {
    setPiLoad(true); setPiErr("");
    try {
      const r = await api.get("/api/masterpay-test/payins");
      setPayins(r.data || []);
    } catch { setPiErr("Could not load test PayIns."); }
    finally { setPiLoad(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { if (status?.enabled) fetchPayIns(); }, [status?.enabled, fetchPayIns]);

  // Context-aware actions mirror production agent UTR flow:
  //   Pending      → Approve (payin.approved) | Expire (payin.expired)
  //   UTR Submitted → Approve (payin.approved) | Fail   (payin.failed)
  async function handleAction(transaction_id, action) {
    setActioning(p => ({ ...p, [transaction_id]: action }));
    try {
      const utr = (utrInputs[transaction_id] || "").trim();
      let endpoint, body, newStatus;
      if (action === "approve") {
        endpoint = "/api/masterpay-test/payin/approve";
        body = { transaction_id, utr_number: utr || undefined };
        newStatus = "Approved";
      } else if (action === "expire") {
        endpoint = "/api/masterpay-test/payin/expire";
        body = { transaction_id };
        newStatus = "Expired";
      } else if (action === "fail") {
        endpoint = "/api/masterpay-test/payin/fail";
        body = { transaction_id };
        newStatus = "Failed";
      }
      await api.post(endpoint, body);
      setActioned(p => ({ ...p, [transaction_id]: newStatus }));
      fetchPayIns();
    } catch (err) {
      alert(err?.response?.data?.message || "Action failed");
    } finally { setActioning(p => ({ ...p, [transaction_id]: null })); }
  }

  // ── Render states ─────────────────────────────────────────────

  if (loading) {
    return (
      <AgentLayout>
        <div className="flex items-center justify-center min-h-64 gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin" /> Verifying access…
        </div>
      </AgentLayout>
    );
  }

  if (error || !status?.enabled) {
    return (
      <AgentLayout>
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
            <XCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500">
            {error || "Test Mode is only available to agents belonging to a test-mode-enabled client."}
          </p>
        </div>
      </AgentLayout>
    );
  }

  const actionable = payins.filter(p => ["Pending", "UTR Submitted"].includes(p.status));
  const settled    = payins.filter(p => !["Pending", "UTR Submitted"].includes(p.status));

  return (
    <AgentLayout>
      <div className="max-w-5xl mx-auto space-y-5 px-3 sm:px-0 py-4 sm:py-0">

        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                <FlaskConical size={22} className="text-amber-600" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-navy-900 mb-1">Test Mode — Agent Panel</h1>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Drive virtual PayIn approvals exactly like production: review pending orders, verify any
                  submitted UTRs, then approve, expire, or fail each one to trigger the correct webhook.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 uppercase tracking-wide self-start">
              Agent — Test Mode
            </span>
          </div>
        </div>

        {/* Flow explanation */}
        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-900">Production agent role, replicated in test mode:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-blue-800">
            <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-1">
              <p className="font-bold">In production:</p>
              <p>Agent submits UTR via Payment Proof → system auto-matches a Pending PayIn → Approved + webhook fires</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-1">
              <p className="font-bold">In test mode (you control this):</p>
              <p><strong>Pending</strong> → <span className="text-green-700">[Approve]</span> fires <code>payin.approved</code> · <span className="text-gray-600">[Expire]</span> fires <code>payin.expired</code></p>
              <p><strong>UTR Submitted</strong> → <span className="text-green-700">[Approve]</span> fires <code>payin.approved</code> · <span className="text-red-600">[Fail]</span> fires <code>payin.failed</code> (merchant can then Dispute)</p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            <strong>Virtual orders only.</strong> All data is in isolated
            <code className="bg-amber-100 px-1 rounded mx-1">masterpay_test_payins</code> table.
            No real bank accounts, transactions, balances, or commissions are affected.
          </p>
        </div>

        {/* Actionable PayIns */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-600" />
              <span className="font-semibold text-gray-800">Pending / UTR Submitted Test PayIns</span>
              {actionable.length > 0 && (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                  {actionable.length} awaiting action
                </span>
              )}
            </div>
            <button type="button" onClick={fetchPayIns}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {piLoad ? (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : piErr ? (
            <div className="py-6 text-center text-sm text-red-500">{piErr}</div>
          ) : actionable.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <CheckCircle2 size={28} className="text-green-400 mx-auto" />
              <p className="text-sm text-gray-500">No pending test PayIns. All orders are settled.</p>
              <p className="text-xs text-gray-400">The test merchant must create a test PayIn first.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {actionable.map(row => {
                const currentStatus = actioned[row.transaction_id] || row.status;
                const isActioning   = actioning[row.transaction_id];
                const isUtrRow      = row.status === "UTR Submitted";

                return (
                  <div key={row.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      {/* Order details */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded break-all">
                            {row.transaction_id}
                          </code>
                          <PiBadge status={currentStatus} />
                        </div>
                        <div className="flex items-center gap-4 text-sm flex-wrap">
                          <span className="font-bold text-gray-900 text-base">{money(row.amount)}</span>
                          {row.merchant_order_id && (
                            <span className="text-gray-500 text-xs">Order: {row.merchant_order_id}</span>
                          )}
                          {row.customer_name && (
                            <span className="text-gray-500 text-xs">Customer: {row.customer_name}</span>
                          )}
                        </div>

                        {/* UTR Submitted: show the UTR for verification — this is the core agent action */}
                        {isUtrRow && (
                          <div className="text-sm bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1">
                            <p className="font-semibold text-blue-900 flex items-center gap-2">
                              <Timer size={14} />
                              Merchant submitted UTR — verify before acting:
                            </p>
                            <p className="font-mono font-bold text-blue-800 text-base">{row.utr_number}</p>
                            {row.payment_proof && (
                              <p className="text-xs text-blue-600">Proof: {row.payment_proof}</p>
                            )}
                          </div>
                        )}

                        <div className="text-xs text-gray-400">
                          Merchant: <strong>{row.merchant_username || "—"}</strong>
                          {" · "}Created: {fmtDate(row.created_at)}
                        </div>
                        {row.webhook_url && (
                          <div className="text-xs text-gray-400">
                            Webhook fires to: <span className="text-blue-600">{row.webhook_url}</span>
                          </div>
                        )}
                      </div>

                      {/* Action panel */}
                      {!actioned[row.transaction_id] ? (
                        <div className="flex flex-col gap-2 w-[220px] flex-shrink-0">
                          {/* UTR to record on approval */}
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              UTR to record{isUtrRow ? " (pre-filled from merchant)" : " (optional — auto-gen if blank)"}
                            </label>
                            <input
                              type="text"
                              value={utrInputs[row.transaction_id] ?? (isUtrRow ? row.utr_number || "" : "")}
                              onChange={e => setUtrInputs(p => ({ ...p, [row.transaction_id]: e.target.value }))}
                              placeholder={isUtrRow ? row.utr_number || "UTR number" : "auto-generated if blank"}
                              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                            />
                          </div>

                          {/* Approve — available for both Pending and UTR Submitted */}
                          <button
                            type="button"
                            onClick={() => handleAction(row.transaction_id, "approve")}
                            disabled={!!isActioning}
                            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors"
                          >
                            {isActioning === "approve"
                              ? <Loader2 size={13} className="animate-spin" />
                              : <CheckCircle2 size={13} />}
                            Approve → payin.approved
                          </button>

                          {/* Pending only: Expire */}
                          {!isUtrRow && (
                            <button
                              type="button"
                              onClick={() => handleAction(row.transaction_id, "expire")}
                              disabled={!!isActioning}
                              className="w-full bg-gray-500 hover:bg-gray-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors"
                            >
                              {isActioning === "expire"
                                ? <Loader2 size={13} className="animate-spin" />
                                : <XCircle size={13} />}
                              Expire → payin.expired
                            </button>
                          )}

                          {/* UTR Submitted only: Fail */}
                          {isUtrRow && (
                            <button
                              type="button"
                              onClick={() => handleAction(row.transaction_id, "fail")}
                              disabled={!!isActioning}
                              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1 transition-colors"
                            >
                              {isActioning === "fail"
                                ? <Loader2 size={13} className="animate-spin" />
                                : <ShieldAlert size={13} />}
                              Fail → payin.failed
                            </button>
                          )}

                          <p className="text-[10px] text-gray-400 text-center leading-tight">
                            Webhook fires immediately to the merchant's configured URL with the production payload shape
                          </p>
                        </div>
                      ) : (
                        <div className={`px-4 py-3 rounded-xl text-sm font-semibold border flex-shrink-0 ${
                          actioned[row.transaction_id] === "Approved"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : actioned[row.transaction_id] === "Expired"
                            ? "bg-gray-50 text-gray-600 border-slate-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          {actioned[row.transaction_id]} ✓
                          <p className="text-xs font-normal mt-0.5 opacity-70">webhook fired</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Settled PayIn history */}
        {settled.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="font-semibold text-gray-800">Settled PayIn History</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[600px]">
                <thead className="bg-gray-50 border-b border-slate-200">
                  <tr>
                    {["Ref","Amount","Status","UTR","Settled At","Webhook",""].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-bold text-gray-600">{h}</th>
                    ))}
                  </tr>
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
                          <span className={`font-semibold ${row.webhook_sent ? "text-green-700" : "text-gray-400"}`}>
                            {row.webhook_sent ? "Fired ✓" : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            className="text-[#1E88FF] hover:underline flex items-center gap-1"
                          >
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
                              {row.customer_name && <div><span className="text-gray-400">Customer</span><br />{row.customer_name}{row.customer_mobile ? ` · ${row.customer_mobile}` : ""}</div>}
                              {row.webhook_url && <div><span className="text-gray-400">Webhook URL</span><br /><span className="break-all">{row.webhook_url}</span></div>}
                              {row.disputed_utr && <div><span className="text-gray-400">Disputed UTR</span><br /><strong className="text-purple-700">{row.disputed_utr}</strong></div>}
                              {row.payment_proof && <div><span className="text-gray-400">Proof</span><br />{row.payment_proof}</div>}
                              {row.webhook_response && (
                                <div className="col-span-2 sm:col-span-3">
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
    </AgentLayout>
  );
}
