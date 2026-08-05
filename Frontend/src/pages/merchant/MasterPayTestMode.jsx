import { useEffect, useState, useCallback, useRef } from "react";
import {
  FlaskConical, Plus, RefreshCw, CheckCircle2, Clock, XCircle,
  Loader2, AlertTriangle, ChevronDown, ChevronUp,
  ArrowDownLeft, ArrowUpRight, Timer,
  ShieldAlert, MessageCircleWarning,
  Key, Eye, EyeOff, Copy, Building2,
} from "lucide-react";
import MerchantLayout from "../../layouts/MerchantLayout";
import api from "../../api";
import MPTestApiDocs from "../../components/MPTestApiDocs";

// ============================================================
// TEST MODE — MERCHANT SIDE
// Available to merchants with is_test_merchant=true on a test_mode_enabled client.
// Data lives in test_mode_* tables — never touches production.
//
// The merchant now owns the full PayIn lifecycle in test mode (create,
// submit UTR, dispute) — this used to be delegated to a separate
// Merchant role; that role has been folded into Merchant.
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
  Expired:         { cls: "bg-gray-100 text-gray-600 border-slate-200",       Icon: XCircle,              label: "Expired" },
  Failed:          { cls: "bg-red-100 text-red-800 border-red-200",          Icon: ShieldAlert,          label: "Failed" },
  Disputed:        { cls: "bg-purple-100 text-purple-800 border-purple-200", Icon: MessageCircleWarning, label: "Disputed" },
};

const PAYIN_ACTIVE   = new Set(["Pending", "UTR Submitted"]);
const PAYIN_TERMINAL = new Set(["Approved", "Expired", "Failed", "Disputed"]);

function WdBadge({ status }) {
  const s = WD_STATUS[status] || WD_STATUS.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.cls}`}>
      <s.Icon size={11} />{s.label}
    </span>
  );
}
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
function fmtSecs(s) {
  if (!s || s <= 0) return "0:00";
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Live countdown from an ISO timestamp
function useCountdown(targetIso) {
  const [secs, setSecs] = useState(() =>
    targetIso ? Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!targetIso) { setSecs(0); return; }
    const tick = () => setSecs(Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return secs;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-xs text-gray-400 hover:text-[#1E88FF] flex items-center gap-1">
      <Copy size={11} />{copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Section card wrapper ──────────────────────────────────────
function SectionCard({ title, badge, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plus size={15} className="text-[#1E88FF]" />
          <span className="font-semibold text-gray-800">{title}</span>
        </div>
        {badge && (
          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Withdrawal section (unchanged) ───────────────────────────

const BLANK_UPI     = { transaction_type: "upi",     amount: "", upi_id: "",      webhook_url: "", notes: "" };
const BLANK_ACCOUNT = { transaction_type: "account", amount: "", account_name: "", account_number: "", ifsc_code: "", webhook_url: "", notes: "" };

function WithdrawalSection({ balance, onBalanceRefresh }) {
  const [txMode,    setTxMode]    = useState("upi");
  const [form,      setForm]      = useState({ ...BLANK_UPI });
  const [creating,  setCreating]  = useState(false);
  const [createMsg, setCreateMsg] = useState(null);
  const [history,   setHistory]   = useState([]);
  const [histLoad,  setHistLoad]  = useState(false);
  const [histErr,   setHistErr]   = useState("");
  const [expanded,  setExpanded]  = useState(null);

  const fetchHistory = useCallback(async () => {
    setHistLoad(true); setHistErr("");
    try {
      const r = await api.get("/api/masterpay-test/withdrawals");
      setHistory(r.data || []);
    } catch { setHistErr("Could not load withdrawal history."); }
    finally { setHistLoad(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function switchMode(m) { setTxMode(m); setForm(m === "upi" ? { ...BLANK_UPI } : { ...BLANK_ACCOUNT }); setCreateMsg(null); }
  function onChange(e) { setForm(p => ({ ...p, [e.target.name]: e.target.value })); }

  async function onSubmit(e) {
    e.preventDefault();
    setCreateMsg(null); setCreating(true);
    try {
      const r = await api.post("/api/masterpay-test/withdrawal/create", form);
      setCreateMsg({ ok: true, text: `Created — ID: ${r.data.data.transaction_id}`, txId: r.data.data.transaction_id });
      setForm(txMode === "upi" ? { ...BLANK_UPI } : { ...BLANK_ACCOUNT });
      onBalanceRefresh(); fetchHistory();
    } catch (err) {
      setCreateMsg({ ok: false, text: err?.response?.data?.message || "Failed to create withdrawal" });
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Test Balance (Withdrawal)</p>
          <p className="text-3xl font-extrabold tracking-tight text-navy-900">{money(balance)}</p>
          <p className="text-xs text-gray-400 mt-1">Virtual funds added by your admin technician</p>
        </div>
        <button type="button" onClick={() => { onBalanceRefresh(); fetchHistory(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <SectionCard title="Create Test Withdrawal" badge="Test data only">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit mb-5">
          {[["upi", "UPI"], ["account", "Bank Account"]].map(([t, label]) => (
            <button key={t} type="button" onClick={() => switchMode(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${txMode === t ? "bg-white text-[#1E88FF] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹) *</label>
            <input name="amount" type="number" min="1" value={form.amount} onChange={onChange} required
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {txMode === "upi" ? (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">UPI ID *</label>
              <input name="upi_id" type="text" value={form.upi_id} onChange={onChange} required placeholder="test@ybl"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Account Name *</label>
                <input name="account_name" type="text" value={form.account_name} onChange={onChange} required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Account Number *</label>
                  <input name="account_number" type="text" value={form.account_number} onChange={onChange} required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">IFSC Code *</label>
                  <input name="ifsc_code" type="text" value={form.ifsc_code} onChange={onChange} required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Webhook URL (optional)</label>
            <input name="webhook_url" type="url" value={form.webhook_url} onChange={onChange}
              placeholder="https://your-domain.com/webhook"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label>
            <input name="notes" type="text" value={form.notes} onChange={onChange}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {createMsg && (
            <div className={`rounded-xl border p-3 text-sm ${createMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
              {createMsg.text}
              {createMsg.ok && createMsg.txId && (
                <button type="button" onClick={() => navigator.clipboard?.writeText(createMsg.txId)}
                  className="ml-3 inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                  <Copy size={11} /> Copy ID
                </button>
              )}
            </div>
          )}
          <button type="submit" disabled={creating}
            className="w-full bg-[#1E88FF] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {creating ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : "Create Test Withdrawal"}
          </button>
        </form>
      </SectionCard>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <span className="font-semibold text-gray-800">Withdrawal History</span>
          <button type="button" onClick={fetchHistory} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        {histLoad ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400"><Loader2 size={18} className="animate-spin" /> Loading…</div>
        ) : histErr ? (
          <div className="py-6 text-center text-sm text-red-500">{histErr}</div>
        ) : history.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No test withdrawals yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[620px]">
              <thead className="bg-gray-50 border-b border-slate-200">
                <tr>{["Transaction ID","Amount","Type","Status","UTR","Created",""].map(h => <th key={h} className="px-4 py-3 text-left font-bold text-gray-600">{h}</th>)}</tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <>
                    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-[10px] text-gray-600 max-w-[150px] truncate">{row.transaction_id}</td>
                      <td className="px-4 py-3 font-semibold">{money(row.amount)}</td>
                      <td className="px-4 py-3 capitalize">{row.transaction_type}</td>
                      <td className="px-4 py-3"><WdBadge status={row.status} /></td>
                      <td className="px-4 py-3 font-mono">{row.utr_number || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                          className="text-[#1E88FF] hover:underline flex items-center gap-1">
                          {expanded === row.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Details
                        </button>
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr key={`${row.id}-d`} className="bg-blue-50 border-t border-blue-100">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                            {row.transaction_type === "upi"
                              ? <div><span className="text-gray-400">UPI ID</span><br /><strong>{row.upi_id || "—"}</strong></div>
                              : <><div><span className="text-gray-400">Account</span><br /><strong>{row.account_name} / {row.account_number}</strong></div><div><span className="text-gray-400">IFSC</span><br /><strong>{row.ifsc_code}</strong></div></>}
                            {row.webhook_url && <div><span className="text-gray-400">Webhook</span><br /><span className="break-all">{row.webhook_url}</span></div>}
                            {row.notes && <div><span className="text-gray-400">Notes</span><br />{row.notes}</div>}
                            <div><span className="text-gray-400">Webhook Fired</span><br /><span className={row.webhook_sent ? "text-green-700" : "text-gray-400"}>{row.webhook_sent ? "Yes" : "No"}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Test API key section ─────────────────────────────────────
// Shows the merchant's dedicated Test API key, only valid for /api/test/*
// endpoints. All writes go to test_mode_* tables only.
function ApiKeySection({ onKeyLoaded }) {
  const [apiKey,      setApiKey]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [revealed,    setRevealed]    = useState(false);
  const [regenerating,setRegenerating]= useState(false);
  const [copied,      setCopied]      = useState(false);

  const fetchKey = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/api/masterpay-test/api-key");
      setApiKey(r.data.api_key);
      onKeyLoaded?.(r.data.api_key);
    } catch { /* silent — key section just won't show */ }
    finally { setLoading(false); }
  }, [onKeyLoaded]);

  useEffect(() => { fetchKey(); }, [fetchKey]);

  async function handleRegenerate() {
    if (!window.confirm("Regenerate your Test API key? The old key stops working immediately.")) return;
    setRegenerating(true);
    try {
      const r = await api.post("/api/masterpay-test/api-key/regenerate");
      setApiKey(r.data.api_key);
      onKeyLoaded?.(r.data.api_key);
      setRevealed(true);
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to regenerate key");
    } finally { setRegenerating(false); }
  }

  function copyKey() {
    navigator.clipboard?.writeText(apiKey || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const masked = apiKey ? apiKey.slice(0, 11) + "••••••••••••••••••••••••••••••••••••" : "";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center gap-2">
        <Key size={14} className="text-[#1E88FF]" />
        <span className="font-semibold text-gray-800">Test Mode API Key</span>
        <span className="ml-auto text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
          Test only
        </span>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-sm text-gray-600">
          Use this key for all Test Mode API calls. Send it as the{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">x-api-key</code> request header.
          All requests are processed entirely within the Test Mode environment — no live data is affected.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 size={14} className="animate-spin" /> Loading key…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-slate-200 rounded-xl px-4 py-3">
              <code className="flex-1 text-xs font-mono text-gray-800 break-all select-all">
                {revealed ? apiKey : masked}
              </code>
              <button type="button" onClick={() => setRevealed(v => !v)}
                title={revealed ? "Hide key" : "Show key"}
                className="text-gray-400 hover:text-[#1E88FF] flex-shrink-0 transition-colors">
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button type="button" onClick={copyKey}
                className="text-gray-400 hover:text-[#1E88FF] flex-shrink-0 flex items-center gap-1 text-xs transition-colors">
                <Copy size={12} />{copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <button type="button" onClick={handleRegenerate} disabled={regenerating}
              className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 disabled:opacity-50 transition-colors">
              <RefreshCw size={11} className={regenerating ? "animate-spin" : ""} />
              {regenerating ? "Regenerating…" : "Regenerate key"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Active test PayIn card ────────────────────────────────────
function CheckoutCard({ checkout, onUtrSubmitted, onDisputed }) {
  const [utr,       setUtr]       = useState("");
  const [proof,     setProof]     = useState("");
  const [disputed,  setDisputed]  = useState("");
  const [submitting,setSubmitting]= useState(false);
  const [submitMsg, setSubmitMsg] = useState(null);
  const [disputing, setDisputing] = useState(false);

  const checkoutSecs = useCountdown(checkout.expires_at);
  const verifySecs   = useCountdown(checkout.verification_expires_at);

  const MP_ACCOUNT = checkout.bank_details || {};

  async function handleUtrSubmit(e) {
    e.preventDefault();
    setSubmitMsg(null); setSubmitting(true);
    try {
      await api.post("/api/masterpay-test/payin/submit-utr", {
        transaction_id: checkout.transaction_ref,
        utr_number: utr.trim(),
        payment_proof: proof.trim() || undefined,
      });
      setSubmitMsg({ ok: true, text: "UTR submitted — your PayIn is now pending review." });
      onUtrSubmitted();
    } catch (err) {
      setSubmitMsg({ ok: false, text: err?.response?.data?.message || "Submission failed" });
    } finally { setSubmitting(false); }
  }

  async function handleDispute(e) {
    e.preventDefault();
    setDisputing(true);
    try {
      await api.post("/api/masterpay-test/payin/dispute", {
        transaction_id: checkout.transaction_ref,
        disputed_utr: disputed.trim(),
      });
      onDisputed();
    } catch (err) {
      alert(err?.response?.data?.message || "Dispute failed");
    } finally { setDisputing(false); }
  }

  const status = checkout.status;
  const bank   = MP_ACCOUNT;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-[#1E88FF] to-blue-500 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs opacity-75 mb-0.5">Virtual Test Checkout</p>
            <p className="text-2xl font-bold">{money(checkout.amount)}</p>
          </div>
          <PiBadge status={status} />
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs opacity-75">
          <span className="font-mono">{checkout.transaction_ref}</span>
          <CopyBtn text={checkout.transaction_ref} />
        </div>
      </div>

      <div className="p-5 space-y-4">
        {(status === "Pending" || status === "UTR Submitted") && (
          <>
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                <Building2 size={15} /> Test Bank Account
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {[
                  ["Bank Name", bank.bank_name],
                  ["Account Holder", bank.account_holder_name],
                  ["Account Number", bank.account_number],
                  ["IFSC Code", bank.ifsc_code],
                  ["UPI ID", bank.upi_id],
                ].map(([k, v]) => v ? (
                  <div key={k}>
                    <span className="text-gray-400 block">{k}</span>
                    <div className="flex items-center gap-1">
                      <strong className="font-mono text-gray-900 break-all">{v}</strong>
                      <CopyBtn text={v} />
                    </div>
                  </div>
                ) : null)}
              </div>
            </div>

            {status === "Pending" && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
                checkoutSecs > 120 ? "bg-green-50 border-green-200 text-green-800" :
                checkoutSecs > 0   ? "bg-amber-50 border-amber-200 text-amber-800" :
                "bg-red-50 border-red-200 text-red-700"
              }`}>
                <Timer size={14} />
                {checkoutSecs > 0
                  ? <span>Checkout expires in <strong>{fmtSecs(checkoutSecs)}</strong> — submit UTR before it expires</span>
                  : <span>Checkout has expired</span>}
              </div>
            )}

            {status === "UTR Submitted" && (
              <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
                verifySecs > 120 ? "bg-blue-50 border-blue-200 text-blue-800" :
                verifySecs > 0   ? "bg-amber-50 border-amber-200 text-amber-800" :
                "bg-gray-50 border-slate-200 text-gray-600"
              }`}>
                <Timer size={14} />
                {verifySecs > 0
                  ? <span>UTR is under review — <strong>{fmtSecs(verifySecs)}</strong> remaining</span>
                  : <span>Review window has elapsed — the PayIn will be approved or failed shortly</span>}
              </div>
            )}
          </>
        )}

        {(status === "Pending" || status === "UTR Submitted") && (
          <form onSubmit={handleUtrSubmit} className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              {status === "UTR Submitted" ? "Re-submit UTR (updates existing):" : "Submit payment UTR:"}
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">UTR Number *</label>
              <input type="text" value={utr} onChange={e => setUtr(e.target.value)} required
                placeholder={checkout.utr_number || "Bank transaction reference"}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Proof / Screenshot URL (optional)</label>
              <input type="text" value={proof} onChange={e => setProof(e.target.value)}
                placeholder="https://…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={submitting || !utr.trim()}
              className="w-full bg-[#1E88FF] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : "Submit UTR"}
            </button>
            {submitMsg && (
              <div className={`rounded-xl border p-3 text-sm ${submitMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                {submitMsg.text}
              </div>
            )}
          </form>
        )}

        {status === "Approved" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-1">
            <CheckCircle2 size={28} className="text-green-600 mx-auto" />
            <p className="font-bold text-green-800">Payment Approved</p>
            <p className="text-xs text-green-700">Webhook <code>payin.approved</code> fired to your configured URL</p>
            {checkout.utr_number && <p className="text-xs font-mono text-green-600">UTR: {checkout.utr_number}</p>}
          </div>
        )}
        {status === "Expired" && (
          <div className="bg-gray-50 border border-slate-200 rounded-xl p-4 text-center space-y-1">
            <XCircle size={28} className="text-gray-400 mx-auto" />
            <p className="font-bold text-gray-700">Checkout Expired</p>
            <p className="text-xs text-gray-500">Webhook <code>payin.expired</code> fired. Create a new test PayIn to retry.</p>
          </div>
        )}
        {status === "Failed" && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center space-y-1">
              <ShieldAlert size={28} className="text-red-500 mx-auto" />
              <p className="font-bold text-red-800">Payment Failed</p>
              <p className="text-xs text-red-600">Webhook <code>payin.failed</code> fired. You can raise a dispute.</p>
            </div>
            <form onSubmit={handleDispute} className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">Raise a dispute:</p>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Your Actual UTR (disputed) *</label>
                <input type="text" value={disputed} onChange={e => setDisputed(e.target.value)} required
                  placeholder="UTR from your bank statement"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
              </div>
              <button type="submit" disabled={disputing || !disputed.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                {disputing ? <><Loader2 size={15} className="animate-spin" /> Disputing…</> : "Raise Dispute → payin.disputed"}
              </button>
            </form>
          </div>
        )}
        {status === "Disputed" && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center space-y-1">
            <MessageCircleWarning size={28} className="text-purple-500 mx-auto" />
            <p className="font-bold text-purple-800">Dispute Raised</p>
            <p className="text-xs text-purple-600">Webhook <code>payin.disputed</code> fired.</p>
            {checkout.disputed_utr && <p className="text-xs font-mono text-purple-700">Disputed UTR: {checkout.disputed_utr}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PayIn create + lifecycle section ─────────────────────────
const BLANK_FORM = {
  amount: "", merchant_order_id: "", unique_id: "",
  customer_name: "", customer_mobile: "",
  webhook_url: "", redirect_url: "",
};

function PayInSection() {
  const [form,       setForm]       = useState({ ...BLANK_FORM });
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState("");

  const [checkout,   setCheckout]   = useState(null);
  const [history,    setHistory]    = useState([]);
  const [histLoad,   setHistLoad]   = useState(false);
  const [histErr,    setHistErr]    = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const pollRef = useRef(null);

  function onChange(e) { setForm(p => ({ ...p, [e.target.name]: e.target.value })); }

  const fetchHistory = useCallback(async () => {
    setHistLoad(true); setHistErr("");
    try {
      const r = await api.get("/api/masterpay-test/payins");
      setHistory(r.data || []);
    } catch { setHistErr("Could not load PayIn history."); }
    finally { setHistLoad(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  function startPolling(transactionRef) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.get("/api/masterpay-test/payin/status", { params: { transactionId: transactionRef } });
        if (PAYIN_TERMINAL.has(r.data.status)) {
          setCheckout(prev => prev ? { ...prev, ...r.data } : null);
          stopPolling();
          fetchHistory();
        } else {
          setCheckout(prev => prev ? { ...prev, ...r.data } : null);
        }
      } catch { /* silent */ }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  async function onCreateSubmit(e) {
    e.preventDefault();
    setCreateErr(""); setCreating(true);
    try {
      const r = await api.post("/api/masterpay-test/payin/create", {
        ...form,
        amount: Number(form.amount),
      });
      const co = {
        transaction_id:    r.data.transaction_id,
        transaction_ref:   r.data.transaction_ref,
        merchant_order_id: r.data.merchant_order_id,
        amount:            r.data.amount,
        status:            r.data.status,
        expires_at:        r.data.expires_at,
        expires_in_seconds: r.data.expires_in_seconds,
        bank_details:      r.data.bank_details,
        utr_number:        null,
        disputed_utr:      null,
        verification_expires_at: null,
      };
      setCheckout(co);
      setForm({ ...BLANK_FORM });
      fetchHistory();
      startPolling(co.transaction_ref);
    } catch (err) {
      setCreateErr(err?.response?.data?.message || "Failed to create test PayIn");
    } finally { setCreating(false); }
  }

  function onUtrSubmitted() {
    if (checkout) {
      api.get("/api/masterpay-test/payin/status", { params: { transactionId: checkout.transaction_ref } })
        .then(r => setCheckout(prev => prev ? { ...prev, ...r.data } : null))
        .catch(() => {});
    }
  }

  function onDisputed() {
    if (checkout) {
      api.get("/api/masterpay-test/payin/status", { params: { transactionId: checkout.transaction_ref } })
        .then(r => { setCheckout(prev => prev ? { ...prev, ...r.data } : null); stopPolling(); fetchHistory(); })
        .catch(() => {});
    }
  }

  const settled = history.filter(p => PAYIN_TERMINAL.has(p.status));

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 space-y-2">
        <p className="text-sm font-semibold text-blue-900">How Test Mode PayIn works:</p>
        <ol className="text-xs text-blue-800 space-y-1 ml-4 list-decimal">
          <li>Create a test PayIn using the form below or via <code>POST /api/test/payin/checkout/create</code></li>
          <li>Note the test bank details and submit a UTR via the form or <code>POST /api/test/payin/submit-utr</code></li>
          <li>The PayIn status changes to Approved, Failed, or Expired — webhooks fire to your configured URL</li>
          <li>If a PayIn is <strong>Failed</strong>, you can raise a dispute from this page</li>
        </ol>
      </div>

      {/* Create form */}
      {!checkout && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center gap-2">
            <Plus size={15} className="text-[#1E88FF]" />
            <span className="font-semibold text-gray-800">Create Test PayIn</span>
            <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase">
              Test data only
            </span>
          </div>
          <form onSubmit={onCreateSubmit} className="p-5 space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (₹) *</label>
                <input name="amount" type="number" min="1" value={form.amount} onChange={onChange} required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Merchant Order ID</label>
                <input name="merchant_order_id" type="text" value={form.merchant_order_id} onChange={onChange}
                  placeholder="e.g. ORD-001"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Customer Name</label>
                <input name="customer_name" type="text" value={form.customer_name} onChange={onChange}
                  placeholder="Test Customer"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Customer Mobile</label>
                <input name="customer_mobile" type="text" value={form.customer_mobile} onChange={onChange}
                  placeholder="9876543210"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Webhook URL</label>
              <input name="webhook_url" type="url" value={form.webhook_url} onChange={onChange}
                placeholder="https://your-domain.com/webhook"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Redirect URL</label>
              <input name="redirect_url" type="url" value={form.redirect_url} onChange={onChange}
                placeholder="https://your-domain.com/payment-complete"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {createErr && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{createErr}</div>
            )}
            <button type="submit" disabled={creating || !form.amount}
              className="w-full bg-[#1E88FF] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
              {creating ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : <>
                <Plus size={15} /> Create Test PayIn
              </>}
            </button>
          </form>
        </div>
      )}

      {/* Active checkout simulation */}
      {checkout && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Active Test Checkout</p>
            {PAYIN_TERMINAL.has(checkout.status) && (
              <button type="button" onClick={() => { setCheckout(null); fetchHistory(); }}
                className="text-xs text-[#1E88FF] hover:underline flex items-center gap-1">
                <Plus size={12} /> Create another
              </button>
            )}
          </div>
          <CheckoutCard
            checkout={checkout}
            onUtrSubmitted={onUtrSubmitted}
            onDisputed={onDisputed}
          />
          {PAYIN_ACTIVE.has(checkout.status) && (
            <div className="flex items-center gap-2 text-xs text-gray-400 justify-center">
              <Loader2 size={11} className="animate-spin" /> Polling status every 3 s
            </div>
          )}
        </div>
      )}

      {/* History table */}
      {settled.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="font-semibold text-gray-800">Settled PayIn History</span>
            </div>
            <button type="button" onClick={fetchHistory}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {histLoad ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
          ) : histErr ? (
            <div className="py-6 text-center text-sm text-red-500">{histErr}</div>
          ) : (
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
                          <button type="button"
                            onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            className="text-[#1E88FF] hover:underline flex items-center gap-1">
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
          )}
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────

export default function MasterPayTestMode() {
  const [status,  setStatus]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [tab,     setTab]     = useState("payin");
  const [testApiKey, setTestApiKey] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/api/masterpay-test/status");
      setStatus(r.data);
    } catch { setError("Could not verify test mode access."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  if (loading) {
    return (
      <MerchantLayout>
        <div className="flex items-center justify-center min-h-64 gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin" /> Verifying access…
        </div>
      </MerchantLayout>
    );
  }

  if (error || !status?.enabled) {
    return (
      <MerchantLayout>
        <div className="max-w-lg mx-auto mt-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
            <XCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-500">
            {error || "Test mode is only available for the designated test merchant on a test-mode-enabled client."}
          </p>
        </div>
      </MerchantLayout>
    );
  }

  return (
    <MerchantLayout>
      <div className="max-w-5xl mx-auto space-y-5 px-3 sm:px-0 py-4 sm:py-0">

        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                <FlaskConical size={22} className="text-amber-600" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-navy-900 mb-1">Test Mode</h1>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Test PayIns and Withdrawals are processed end-to-end within the Test Mode environment.
                  No live transactions, balances, commissions, or settlements are affected.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 uppercase tracking-wide self-start">
              Test Mode
            </span>
          </div>
        </div>

        {/* Notice */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 space-y-1">
            <p><strong>Test Mode only.</strong> All data is processed entirely within the Test Mode environment. No live transactions, balances, or settlements are affected.</p>
            <p className="text-xs text-amber-700">
              Create test PayIns, submit UTRs, and raise disputes below using your Test API key. Switch to the
              Withdrawal tab to manage your test payout balance.
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
          <button type="button" onClick={() => setTab("payin")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "payin" ? "bg-white text-[#1E88FF] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <ArrowDownLeft size={16} /> PayIn
          </button>
          <button type="button" onClick={() => setTab("withdrawal")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "withdrawal" ? "bg-white text-[#1E88FF] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            <ArrowUpRight size={16} /> Withdrawal Testing
          </button>
        </div>

        {tab === "payin"
          ? (
            <div className="space-y-5">
              <ApiKeySection onKeyLoaded={setTestApiKey} />
              <MPTestApiDocs apiKey={testApiKey} />
              <PayInSection />
            </div>
          )
          : <WithdrawalSection balance={status.balance} onBalanceRefresh={fetchStatus} />
        }
      </div>
    </MerchantLayout>
  );
}
