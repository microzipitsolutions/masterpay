import { useState, useEffect, useCallback } from "react";
import MerchantLayout from "../../layouts/MerchantLayout";
import { API_BASE_URL } from "../../config/apiConfig";
import api from "../../api";

// ─── Sandbox API caller ───────────────────────────────────────────────────────
// Adds x-rdpay-sandbox: 1 so the backend routes through the sandbox interceptor
// instead of production handlers.  On the production subdomain (sandbox.masterpay.live)
// the hostname detection already does this, but the header works everywhere.

async function sandboxFetch(method, path, body, extraHeaders = {}) {
  const start = Date.now();
  try {
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-rdpay-sandbox": "1",
        ...extraHeaders,
      },
    };
    if (body && method !== "GET") opts.body = JSON.stringify(body);
    const res  = await fetch(`${API_BASE_URL}${path}`, opts);
    const elapsed = Date.now() - start;
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data, elapsed };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message }, elapsed: Date.now() - start };
  }
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function MethodBadge({ method }) {
  const s = { GET: "bg-blue-50 text-blue-700 border border-blue-200", POST: "bg-emerald-50 text-emerald-700 border border-emerald-200" };
  return <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${s[method] || "bg-gray-50 text-gray-700 border border-gray-200"}`}>{method}</span>;
}

function HttpBadge({ status }) {
  if (status == null) return null;
  const c = status >= 200 && status < 300 ? "bg-emerald-100 text-emerald-800" : status >= 400 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{status || "ERR"}</span>;
}

function ResponseBox({ result, loading }) {
  if (loading) return (
    <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
      <div className="w-4 h-4 border-2 border-gray-300 border-t-[#2B7DE9] rounded-full animate-spin flex-shrink-0" />
      Waiting for sandbox response…
    </div>
  );
  if (!result) return (
    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">Response appears here</div>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <HttpBadge status={result.status} />
        <span className="text-xs text-gray-400">{result.elapsed}ms</span>
        <span className="text-xs text-purple-600 font-semibold ml-1">sandbox</span>
        <button type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(result.data, null, 2))}
          className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors">Copy</button>
      </div>
      <pre className="bg-[#111827] text-emerald-400 rounded-xl p-4 overflow-auto text-xs max-h-72 whitespace-pre-wrap leading-relaxed">
        {JSON.stringify(result.data, null, 2)}
      </pre>
      {result.data?.checkout_url && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
          <p className="text-xs font-semibold text-indigo-700 mb-1">Sandbox Checkout URL</p>
          <p className="font-mono text-xs text-indigo-600 break-all">{result.data.checkout_url}</p>
        </div>
      )}
    </div>
  );
}

// Generic POST endpoint card — editable JSON body + real sandbox API call
function EndpointCard({ step, title, method, path, defaultBody, headersFn, onSuccess, hint, extraControls }) {
  const [body, setBody]     = useState(JSON.stringify(defaultBody, null, 2));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bodyErr, setBodyErr] = useState(null);

  async function handleSend() {
    let parsed = null;
    if (method !== "GET") {
      try { parsed = JSON.parse(body); setBodyErr(null); }
      catch { setBodyErr("Invalid JSON — fix the body before sending"); return; }
    }
    setLoading(true);
    const res = await sandboxFetch(method, path, parsed, headersFn?.() || {});
    setResult(res);
    setLoading(false);
    if (res.ok && onSuccess) onSuccess(res.data);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
        <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">{step}</span>
        <MethodBadge method={method} />
        <code className="text-sm font-mono text-gray-700 flex-1 truncate">{path}</code>
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
        {hint && <p className="text-xs text-gray-400 mb-4">{hint}</p>}
        {extraControls}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Body</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={9} spellCheck={false}
              className={`w-full font-mono text-xs bg-[#111827] text-emerald-400 rounded-xl p-4 resize-y outline-none focus:ring-2 focus:ring-blue-500 ${bodyErr ? "ring-2 ring-red-500" : ""}`} />
            {bodyErr && <p className="text-xs text-red-500">{bodyErr}</p>}
            <button type="button" onClick={handleSend} disabled={loading}
              className="w-full bg-[#2B7DE9] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
              {loading ? "Sending…" : "Send Request"}
            </button>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Response</p>
            <ResponseBox result={result} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}

// GET endpoint card with a dynamic path param input
function GetStatusCard({ step, title, path, pathLabel, placeholder, headersFn, hint, prefillId }) {
  const [localId, setLocalId] = useState("");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);

  const effectiveId = prefillId || localId;

  async function handleSend() {
    const id = effectiveId.trim();
    if (!id) return;
    setLoading(true);
    // path is a function that builds the full path from id
    const fullPath = typeof path === "function" ? path(id) : `${path}/${id}`;
    const res = await sandboxFetch("GET", fullPath, null, headersFn?.() || {});
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
        <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">{step}</span>
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-700">{typeof path === "function" ? path(":id") : `${path}/:id`}</code>
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
        {hint && <p className="text-xs text-gray-400 mb-4">{hint}</p>}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">{pathLabel}</label>
              <input type="text" value={prefillId || localId} onChange={e => setLocalId(e.target.value)}
                placeholder={placeholder}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {prefillId && <p className="text-xs text-emerald-600 mt-1">Auto-filled from previous step</p>}
            </div>
            <button type="button" onClick={handleSend} disabled={loading || !effectiveId.trim()}
              className="w-full bg-[#2B7DE9] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
              {loading ? "Sending…" : "Send Request"}
            </button>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Response</p>
            <ResponseBox result={result} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PayIn tab ────────────────────────────────────────────────────────────────

function PayInTab({ payinKey }) {
  const [mode, setMode]     = useState("A");
  const [lastTxId, setLastTxId] = useState("");

  const hdr = useCallback(() => ({ "x-api-key": payinKey }), [payinKey]);

  const createBody = {
    merchant_order_id: "ORD1001",
    amount: 500,
    customer_name: "Test User",
    customer_mobile: "9999999999",
    webhook_url: "https://yourwebsite.com/webhook",
    redirect_url: "https://yourwebsite.com/success",
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {["A", "B"].map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${mode === m ? "bg-white text-[#2B7DE9] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            Mode {m} — {m === "A" ? "Direct API" : "Hosted Checkout"}
          </button>
        ))}
      </div>

      {mode === "A" ? (
        <>
          <EndpointCard step="1A" title="Create PayIn" method="POST" path="/api/payin/create"
            defaultBody={createBody} headersFn={hdr}
            hint="Returns bank details. transaction_id is auto-filled below on success."
            onSuccess={d => d?.transaction_id && setLastTxId(String(d.transaction_id))} />

          {/* key resets card so default body picks up the new transaction_id */}
          <EndpointCard key={lastTxId || "no-tx"} step="2A" title="Submit UTR" method="POST" path="/api/payin/submit-utr"
            defaultBody={{ transaction_id: Number(lastTxId) || lastTxId || 1, utr_number: "UTR123456789012" }}
            headersFn={hdr}
            hint={lastTxId ? `transaction_id auto-filled from step 1A: ${lastTxId}` : "Enter the transaction_id from step 1A"} />

          <GetStatusCard step="3A" title="Check Transaction Status"
            path={id => `/api/payin/status/${id}`} pathLabel="Transaction ID or Ref"
            placeholder="e.g. 54231 or a1b2c3d4e5f6..."
            headersFn={hdr} prefillId={lastTxId}
            hint="Poll to watch the full lifecycle: Pending → UTR Submitted → Approved (~10 s). Webhook fires on Approved." />
        </>
      ) : (
        <>
          <EndpointCard step="1B" title="Create Hosted Checkout" method="POST" path="/api/payin/checkout/create"
            defaultBody={createBody} headersFn={hdr}
            hint="Returns checkout_url. The sandbox checkout page works end-to-end — open it in a browser to test the customer UTR submission flow."
            onSuccess={d => d?.transaction_id && setLastTxId(String(d.transaction_id))} />

          <GetStatusCard step="2B" title="Check Status (optional)"
            path={id => `/api/payin/status/${id}`} pathLabel="Transaction ID or Ref"
            placeholder="e.g. 54231 or a1b2c3d4e5f6..."
            headersFn={hdr} prefillId={lastTxId}
            hint="Poll this to track status without relying solely on the webhook." />
        </>
      )}
    </div>
  );
}

// ─── Payout tab ───────────────────────────────────────────────────────────────

function PayoutTab({ withdrawalKey }) {
  const [lastTxId, setLastTxId] = useState("");
  const [type, setType]         = useState("upi");

  const hdr = useCallback(() => ({ "api-key": withdrawalKey }), [withdrawalKey]);

  const bodies = {
    upi:     { amount: 100, upi_id: "test@ybl", transaction_type: "upi", webhookUrl: "https://yourwebsite.com/webhook" },
    account: { amount: 100, account_name: "Test User", account_number: "358461356", ifsc_code: "SBIN0000691", transaction_type: "account", webhookUrl: "https://yourwebsite.com/webhook" },
  };

  return (
    <div className="space-y-5">
      <EndpointCard key={type} step="1" title="Create Payout Transaction" method="POST" path="/api/withdrawal/payout-create"
        defaultBody={bodies[type]} headersFn={hdr}
        hint="transaction_id auto-fills in step 2 on success."
        onSuccess={d => d?.data?.transaction_id && setLastTxId(d.data.transaction_id)}
        extraControls={
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit mb-4">
            {[["upi","UPI"],["account","Bank Account"]].map(([t, label]) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${type === t ? "bg-white text-[#2B7DE9] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>
        }
      />

      <GetStatusCard step="2" title="Check Payout Status"
        path={id => `/api/withdrawal/transactions/status?transactionId=${encodeURIComponent(id)}`}
        pathLabel="Transaction ID" placeholder="e.g. a1b2c3d4e5f6..."
        headersFn={hdr} prefillId={lastTxId}
        hint="Status progresses: pending (0 s) → picked (5 s) → utr_submitted (10 s) → cleared (20 s) with UTR. Webhook fires on cleared." />
    </div>
  );
}

// ─── Sandbox Keys card ────────────────────────────────────────────────────────

function SandboxKeysCard({ onKeysLoaded }) {
  const [keys, setKeys]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied]   = useState(null);

  async function loadKeys() {
    setLoading(true);
    try {
      const r = await api.get("/api/sandbox/keys");
      setKeys(r.data.keys);
      if (r.data.keys) onKeysLoaded(r.data.keys);
    } catch { setKeys(null); }
    finally { setLoading(false); }
  }

  async function generate() {
    setRotating(true);
    try {
      const r = await api.post("/api/sandbox/keys");
      setKeys(r.data.keys);
      onKeysLoaded(r.data.keys);
    } catch (e) {
      alert(e?.response?.data?.message || "Could not generate keys");
    } finally { setRotating(false); }
  }

  function copy(val, which) {
    navigator.clipboard?.writeText(val);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => { loadKeys(); }, []);

  const SANDBOX_URL = "https://sandbox.masterpay.live";

  if (loading) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex items-center gap-3 text-sm text-gray-400">
      <div className="w-4 h-4 border-2 border-gray-300 border-t-[#2B7DE9] rounded-full animate-spin" />
      Loading sandbox keys…
    </div>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-gray-800">Sandbox API Keys</h2>
        <button type="button" onClick={generate} disabled={rotating}
          className="text-sm bg-[#2B7DE9] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-xl transition-colors">
          {rotating ? "Generating…" : keys ? "Rotate Keys" : "Generate Keys"}
        </button>
      </div>

      <div className="p-6 space-y-5">
        {!keys ? (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm mb-1">No sandbox keys yet.</p>
            <p className="text-gray-400 text-xs">Click "Generate Keys" above to create your sandbox API keys.</p>
          </div>
        ) : (
          <>
            <KeyRow label="PayIn API Key" desc="Send as x-api-key header" value={keys.payin_key} copied={copied === "payin"} onCopy={() => copy(keys.payin_key, "payin")} />
            <KeyRow label="Withdrawal API Key" desc="Send as api-key header" value={keys.withdrawal_key} copied={copied === "withdrawal"} onCopy={() => copy(keys.withdrawal_key, "withdrawal")} />
          </>
        )}

        {/* How to use */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3 text-sm">
          <p className="font-semibold text-gray-700">How to use the sandbox</p>
          <div className="space-y-2 text-xs text-gray-600">
            <div>
              <span className="font-semibold text-gray-700">Production Base URL:</span>
              <span className="ml-2 font-mono bg-white border border-gray-200 rounded px-2 py-0.5">https://masterpay.live</span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Sandbox Base URL:</span>
              <span className="ml-2 font-mono bg-purple-50 border border-purple-200 text-purple-800 rounded px-2 py-0.5">{SANDBOX_URL}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Point your integration at <code className="bg-gray-100 px-1 rounded">{SANDBOX_URL}</code> and use your sandbox API keys.
            Switch to production by changing the base URL to <code className="bg-gray-100 px-1 rounded">https://masterpay.live</code> and using your production keys — no other code changes needed.
          </p>
        
        </div>
      </div>
    </div>
  );
}

function KeyRow({ label, desc, value, copied, onCopy }) {
  const [visible, setVisible] = useState(false);
  const display = visible ? value : value.slice(0, 12) + "●●●●●●●●●●●●●●";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          <span className="ml-2 text-xs text-gray-400">{desc}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setVisible(v => !v)} className="text-xs text-gray-400 hover:text-gray-700">
            {visible ? "Hide" : "Show"}
          </button>
          <button type="button" onClick={onCopy}
            className={`text-xs font-medium px-3 py-1 rounded-lg transition-all ${copied ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <div className="bg-[#111827] text-emerald-400 rounded-xl px-4 py-2.5 font-mono text-xs break-all select-all">
        {display}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Sandbox() {
  const [activeTab, setActiveTab] = useState("payin");
  const [payinKey, setPayinKey]         = useState("");
  const [withdrawalKey, setWithdrawalKey] = useState("");

  function handleKeysLoaded(keys) {
    if (keys?.payin_key)      setPayinKey(keys.payin_key);
    if (keys?.withdrawal_key) setWithdrawalKey(keys.withdrawal_key);
  }

  return (
    <MerchantLayout>
      <div className="max-w-5xl mx-auto space-y-6 px-3 sm:px-0 py-4 sm:py-0">

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">API Sandbox</h1>
              <p className="text-sm text-gray-500 max-w-xl">
                Test your PayIn and Payout integration end-to-end.
                Sandbox requests never create database records, affect balances,
                trigger agent workflows, or fire real webhooks.
                Request and response shapes are identical to production.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="px-3 py-1.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold border border-purple-200 uppercase tracking-wide">
                Sandbox — no real data
              </span>
              <span className="text-xs text-gray-400">Identical request/response shapes as production</span>
            </div>
          </div>
        </div>

        {/* Keys + base URL */}
        <SandboxKeysCard onKeysLoaded={handleKeysLoaded} />

        {/* Tabs */}
        <div className="flex gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm w-full sm:w-fit overflow-x-auto">
          {[{ id: "payin", label: "PayIn" }, { id: "payout", label: "Payout (Withdrawal)" }].map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === tab.id ? "bg-[#2B7DE9] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* API key display for active tab */}
        {activeTab === "payin" ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              PayIn API Key in use{" "}
              <code className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">x-api-key header</code>
            </label>
            <input type="text" value={payinKey} onChange={e => setPayinKey(e.target.value)}
              placeholder="Generate sandbox keys above or paste one manually"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Withdrawal API Key in use{" "}
              <code className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">api-key header</code>
            </label>
            <input type="text" value={withdrawalKey} onChange={e => setWithdrawalKey(e.target.value)}
              placeholder="Generate sandbox keys above or paste one manually"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}

        {/* Endpoint tester */}
        {activeTab === "payin"
          ? <PayInTab payinKey={payinKey} />
          : <PayoutTab withdrawalKey={withdrawalKey} />}

      </div>
    </MerchantLayout>
  );
}

export default Sandbox;
