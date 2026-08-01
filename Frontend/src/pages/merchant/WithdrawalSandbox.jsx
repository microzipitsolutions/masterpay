import { useState, useEffect, useRef } from "react";
import MerchantLayout from "../../layouts/MerchantLayout";
import { FlaskConical, CheckCircle2, Clock, Loader2, Copy, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

// ─── Pure-frontend mock sandbox — zero API calls ──────────────────────────────
// All responses are generated locally. Nothing is sent to the backend.

function genTxId() {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}
function genUTR() {
  return String(Math.floor(100000000000 + Math.random() * 900000000000));
}
function nowISO() { return new Date().toISOString(); }

const STATUS_SEQUENCE = [
  { status: "pending",       label: "Pending",        delayMs: 0,     color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200" },
  { status: "picked",        label: "Picked",          delayMs: 5000,  color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  { status: "utr_submitted", label: "UTR Submitted",   delayMs: 10000, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { status: "cleared",       label: "Cleared ✓",       delayMs: 20000, color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
];

// ─── Shared UI ─────────────────────────────────────────────────────────────────

function MethodBadge({ method }) {
  const s = {
    GET:  "bg-blue-50 text-blue-700 border border-blue-200",
    POST: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${s[method] || "bg-gray-50 text-gray-700 border"}`}>
      {method}
    </span>
  );
}

function CodeBlock({ children, onCopy, copied }) {
  return (
    <div className="relative">
      <pre className="bg-[#111827] text-emerald-400 rounded-xl p-4 overflow-auto text-xs max-h-64 whitespace-pre-wrap leading-relaxed font-mono">
        {children}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-2 right-2 flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
      >
        <Copy size={11} />
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function SectionCard({ step, method, path, title, hint, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center gap-3">
        <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">{step}</span>
        <MethodBadge method={method} />
        <code className="text-sm font-mono text-gray-700 flex-1 truncate">{path}</code>
        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
          Simulated
        </span>
      </div>
      <div className="p-5">
        <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
        {hint && <p className="text-xs text-gray-400 mb-4">{hint}</p>}
        {children}
      </div>
    </div>
  );
}

// ─── Step 1 — Create Payout ────────────────────────────────────────────────────

const BODIES = {
  upi: {
    amount: 100,
    upi_id: "test@ybl",
    transaction_type: "upi",
    webhookUrl: "https://your-domain.com/webhook",
  },
  account: {
    amount: 100,
    account_name: "Test User",
    account_number: "358461356",
    ifsc_code: "SBIN0000691",
    transaction_type: "account",
    webhookUrl: "https://your-domain.com/webhook",
  },
};

function CreatePayoutCard({ apiKey, onCreated }) {
  const [type, setType]       = useState("upi");
  const [body, setBody]       = useState(JSON.stringify(BODIES.upi, null, 2));
  const [bodyErr, setBodyErr] = useState(null);
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied]   = useState(false);

  function switchType(t) {
    setType(t);
    setBody(JSON.stringify(BODIES[t], null, 2));
    setBodyErr(null);
    setResult(null);
  }

  function simulate() {
    let parsed;
    try { parsed = JSON.parse(body); setBodyErr(null); }
    catch { setBodyErr("Invalid JSON — fix before sending"); return; }

    setLoading(true);
    setResult(null);
    setTimeout(() => {
      const txId = genTxId();
      const ok = true; // always succeed in sandbox
      const res = {
        status: 200,
        body: {
          message: "Transaction Create Successfully",
          code: 200,
          data: { transaction_id: txId },
        },
      };
      setResult(res);
      setLoading(false);
      if (ok) onCreated({ txId, amount: parsed.amount || 0, type, parsed });
    }, 600);
  }

  const json = result ? JSON.stringify(result.body, null, 2) : "";

  return (
    <SectionCard step="STEP 1" method="POST" path="/api/withdrawal/payout-create"
      title="Create Payout Transaction"
      hint="Choose UPI or Bank Account. Click Simulate to get a mocked transaction_id — auto-fills in the next steps.">
      {/* type toggle */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit mb-4">
        {[["upi", "UPI"], ["account", "Bank Account"]].map(([t, label]) => (
          <button key={t} type="button" onClick={() => switchType(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${type === t ? "bg-white text-[#2B7DE9] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Headers</p>
            <pre className="bg-[#111827] text-emerald-400 rounded-xl p-3 text-xs font-mono">
{`api-key: ${apiKey || "<your-withdrawal-api-key>"}
Content-Type: application/json`}
            </pre>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Request Body</p>
            <textarea
              value={body} onChange={e => setBody(e.target.value)} rows={9} spellCheck={false}
              className={`w-full font-mono text-xs bg-[#111827] text-emerald-400 rounded-xl p-4 resize-y outline-none focus:ring-2 focus:ring-blue-500 ${bodyErr ? "ring-2 ring-red-500" : ""}`}
            />
            {bodyErr && <p className="text-xs text-red-500">{bodyErr}</p>}
          </div>
          <button type="button" onClick={simulate} disabled={loading}
            className="w-full bg-[#2B7DE9] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={15} className="animate-spin" /> Simulating…</> : "Simulate Request"}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Simulated Response</p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
              <Loader2 size={16} className="animate-spin text-[#2B7DE9]" />
              Generating mock response…
            </div>
          ) : result ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">200</span>
                <span className="text-xs text-amber-600 font-semibold">mock · no DB write</span>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-700">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="bg-[#111827] text-emerald-400 rounded-xl p-4 overflow-auto text-xs max-h-64 whitespace-pre-wrap leading-relaxed">
                {json}
              </pre>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-semibold text-emerald-700 mb-0.5">Auto-filled below</p>
                <p className="font-mono text-xs text-emerald-800 break-all">{result.body.data.transaction_id}</p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
              Simulated response appears here
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Step 2 — Status progression ──────────────────────────────────────────────

function StatusCheckCard({ txData }) {
  const [running, setRunning]     = useState(false);
  const [stepIdx, setStepIdx]     = useState(-1);
  const [utr, setUtr]             = useState("");
  const [elapsed, setElapsed]     = useState(0);
  const [copied, setCopied]       = useState(false);
  const timerRef                  = useRef(null);
  const startRef                  = useRef(null);

  function start() {
    if (running) return;
    const fakeUtr = genUTR();
    setUtr(fakeUtr);
    setRunning(true);
    setStepIdx(0);
    setElapsed(0);
    startRef.current = Date.now();

    STATUS_SEQUENCE.forEach((s, i) => {
      if (i === 0) return; // already set to 0 above
      setTimeout(() => setStepIdx(i), s.delayMs);
    });

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 500);

    setTimeout(() => {
      clearInterval(timerRef.current);
      setRunning(false);
    }, STATUS_SEQUENCE[STATUS_SEQUENCE.length - 1].delayMs + 200);
  }

  function reset() {
    clearInterval(timerRef.current);
    setRunning(false);
    setStepIdx(-1);
    setElapsed(0);
    setUtr("");
  }

  const currentStatus = stepIdx >= 0 ? STATUS_SEQUENCE[stepIdx] : null;
  const done = stepIdx === STATUS_SEQUENCE.length - 1;

  const statusResponse = currentStatus
    ? JSON.stringify({
        message: "ok",
        code: 200,
        data: {
          transaction_id: txData?.txId || "sandbox_tx_id",
          amount: String(txData?.amount || 100),
          status: currentStatus.status,
          transaction_type: txData?.type || "upi",
          ...(txData?.type === "upi"
            ? { upi_id: txData?.parsed?.upi_id || "test@ybl" }
            : {
                account_name: txData?.parsed?.account_name || "Test User",
                account_number: txData?.parsed?.account_number || "358461356",
              }),
          created_at: nowISO(),
          ...(done ? { utr_number: utr, cleared_or_rejected_date: nowISO() } : {}),
        },
      }, null, 2)
    : null;

  return (
    <SectionCard step="STEP 2" method="GET" path="/api/withdrawal/transactions/status?transactionId=:id"
      title="Check Payout Status (Simulated Lifecycle)"
      hint="Watch the status progress from pending → picked → utr_submitted → cleared in real time. Takes ~20 seconds.">

      {!txData && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 mb-4">
          Complete Step 1 first — transaction_id will be auto-filled here.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="space-y-4">
          {/* Transaction ID input */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Transaction ID</label>
            <input readOnly value={txData?.txId || ""}
              placeholder="Auto-filled from Step 1"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono bg-gray-50 outline-none" />
            {txData && <p className="text-xs text-emerald-600 mt-1">Auto-filled from Step 1</p>}
          </div>

          {/* Status timeline */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Status Lifecycle</p>
            <div className="space-y-2">
              {STATUS_SEQUENCE.map((s, i) => {
                const active = i === stepIdx;
                const past   = i < stepIdx;
                const future = i > stepIdx;
                return (
                  <div key={s.status}
                    className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border transition-all ${
                      active ? `${s.bg} ${s.border} shadow-sm` :
                      past   ? "bg-green-50 border-green-200" :
                      "bg-gray-50 border-gray-100"
                    }`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      active ? `${s.bg} ${s.color}` :
                      past   ? "bg-green-100 text-green-600" :
                      "bg-gray-100 text-gray-300"
                    }`}>
                      {past ? <CheckCircle2 size={14} /> :
                       active && running ? <Loader2 size={14} className="animate-spin" /> :
                       <Clock size={14} />}
                    </div>
                    <div className="flex-1">
                      <code className={`text-xs font-bold ${active ? s.color : past ? "text-green-700" : "text-gray-400"}`}>
                        {s.status}
                      </code>
                      {active && running && (
                        <span className="ml-2 text-[10px] text-gray-400">{elapsed}s elapsed</span>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium ${active ? s.color : past ? "text-green-600" : "text-gray-300"}`}>
                      {past ? "Done" : active ? (running ? "Active" : "Active") : `~${s.delayMs / 1000}s`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={start} disabled={running || !txData}
              className="flex-1 bg-[#2B7DE9] hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
              {running ? <><Loader2 size={15} className="animate-spin" /> Progressing…</> : "Start Simulation"}
            </button>
            {stepIdx >= 0 && !running && (
              <button type="button" onClick={reset}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Current Status Response</p>
          {statusResponse ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">200</span>
                <span className="text-xs text-amber-600 font-semibold">mock · no DB read</span>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(statusResponse); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-700">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="bg-[#111827] text-emerald-400 rounded-xl p-4 overflow-auto text-xs max-h-72 whitespace-pre-wrap leading-relaxed">
                {statusResponse}
              </pre>
              {done && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
                  <p className="text-xs font-semibold text-green-700">Transaction cleared! Webhook would fire now.</p>
                  <p className="font-mono text-xs text-green-800 mt-0.5">UTR: {utr}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-400">
              Start the simulation to see live status responses
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Step 3 — Webhook payload viewer ──────────────────────────────────────────

const WEBHOOK_EXAMPLES = {
  cleared: {
    transactionId: "69b413bff3567e2b4f431829",
    status: "cleared",
    amount: 100,
    utr_number: "615034567890",
  },
  rejected: {
    transactionId: "69b413bff3567e2b4f431829",
    status: "rejected",
    amount: 100,
    utr_number: null,
  },
};

function WebhookCard({ txData, lastUtr }) {
  const [scenario, setScenario] = useState("cleared");
  const [copiedCleared, setCopiedCleared]   = useState(false);
  const [copiedRejected, setCopiedRejected] = useState(false);

  const clearedPayload = JSON.stringify({
    ...WEBHOOK_EXAMPLES.cleared,
    transactionId: txData?.txId || WEBHOOK_EXAMPLES.cleared.transactionId,
    amount: txData?.amount || 100,
    utr_number: lastUtr || WEBHOOK_EXAMPLES.cleared.utr_number,
  }, null, 2);

  const rejectedPayload = JSON.stringify({
    ...WEBHOOK_EXAMPLES.rejected,
    transactionId: txData?.txId || WEBHOOK_EXAMPLES.rejected.transactionId,
    amount: txData?.amount || 100,
  }, null, 2);

  return (
    <SectionCard step="STEP 3" method="POST" path="https://your-domain.com/webhook  (fired by server)"
      title="Webhook Callback Payloads"
      hint="Fired to the webhookUrl you provided in Step 1 when the transaction reaches a terminal state (cleared or rejected). Respond with HTTP 200 to acknowledge.">

      <div className="space-y-5">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
          {[["cleared", "✓ Cleared"], ["rejected", "✕ Rejected"]].map(([s, label]) => (
            <button key={s} type="button" onClick={() => setScenario(s)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${scenario === s ? "bg-white text-[#2B7DE9] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {label}
            </button>
          ))}
        </div>

        {scenario === "cleared" ? (
          <div>
            <p className="text-xs text-gray-500 mb-2">Fired when the agent pays and the merchant approves the UTR.</p>
            <CodeBlock copied={copiedCleared} onCopy={() => { navigator.clipboard?.writeText(clearedPayload); setCopiedCleared(true); setTimeout(() => setCopiedCleared(false), 2000); }}>
              {clearedPayload}
            </CodeBlock>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-2">Fired when the transaction is rejected by the agent or expires.</p>
            <CodeBlock copied={copiedRejected} onCopy={() => { navigator.clipboard?.writeText(rejectedPayload); setCopiedRejected(true); setTimeout(() => setCopiedRejected(false), 2000); }}>
              {rejectedPayload}
            </CodeBlock>
          </div>
        )}

        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-700">Webhook handling guide</p>
          <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
            <li>Verify the <code className="bg-gray-100 px-1 rounded">transactionId</code> matches a payout you created.</li>
            <li>Check <code className="bg-gray-100 px-1 rounded">status === "cleared"</code> before crediting the recipient.</li>
            <li>Return <strong>HTTP 200</strong> immediately — do heavy work asynchronously.</li>
            <li>Implement idempotency: the same event may be re-delivered if your endpoint was unreachable.</li>
          </ol>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Reference docs panel ─────────────────────────────────────────────────────

function ReferenceDocs() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-700">API Reference</span>
          <span className="text-xs text-gray-400">— Endpoints, status values, error codes</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {/* Create */}
          <div>
            <h4 className="font-bold text-sm text-gray-800 mb-2">POST /api/withdrawal/payout-create</h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">UPI body</p>
                <pre className="bg-[#111827] text-emerald-400 rounded-xl p-3 text-xs overflow-auto">{`{
  "amount": 100,
  "upi_id": "test@ybl",
  "transaction_type": "upi",
  "webhookUrl": "https://your-domain.com/webhook"
}`}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Bank account body</p>
                <pre className="bg-[#111827] text-emerald-400 rounded-xl p-3 text-xs overflow-auto">{`{
  "amount": 100,
  "account_name": "Test User",
  "account_number": "358461356",
  "ifsc_code": "SBIN0000691",
  "transaction_type": "account",
  "webhookUrl": "https://your-domain.com/webhook"
}`}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Success response</p>
                <pre className="bg-[#111827] text-emerald-400 rounded-xl p-3 text-xs overflow-auto">{`{
  "message": "Transaction Create Successfully",
  "code": 200,
  "data": { "transaction_id": "69b413bff3567e2b4f431829" }
}`}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Error (invalid key)</p>
                <pre className="bg-[#111827] text-emerald-400 rounded-xl p-3 text-xs overflow-auto">{`{
  "message": "Merchant does not exist",
  "code": 400,
  "data": {},
  "error": true
}`}</pre>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <h4 className="font-bold text-sm text-gray-800 mb-2">GET /api/withdrawal/transactions/status?transactionId=ID</h4>
            <div className="rounded-xl border border-gray-200 overflow-x-auto mb-3">
              <table className="w-full text-xs min-w-[380px]">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-3 py-2 font-bold">Status</th>
                  <th className="text-left px-3 py-2 font-bold">Meaning</th>
                </tr></thead>
                <tbody>
                  {[
                    ["pending", "Created, awaiting agent to pick up"],
                    ["picked", "Agent is processing the payout"],
                    ["utr_submitted", "Agent paid; waiting for your approval"],
                    ["cleared", "Approved — completed successfully"],
                    ["rejected", "Rejected by agent"],
                  ].map(([s, m]) => (
                    <tr key={s} className="border-t border-gray-100">
                      <td className="px-3 py-2"><code className="bg-gray-100 px-1.5 py-0.5 rounded">{s}</code></td>
                      <td className="px-3 py-2 text-gray-700">{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Auth */}
          <div>
            <h4 className="font-bold text-sm text-gray-800 mb-2">Authentication</h4>
            <pre className="bg-[#111827] text-emerald-400 rounded-xl p-3 text-xs overflow-auto">{`api-key: <your-withdrawal-api-key>
Content-Type: application/json`}</pre>
            <p className="text-xs text-gray-500 mt-2">
              The withdrawal API key is different from your PayIn API key. Request it from your admin — they generate it on the Withdrawal Configs page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function WithdrawalSandbox() {
  const apiKey = JSON.parse(localStorage.getItem("rdpay_user_info") || "{}")?.withdrawal_api_key || "";
  const [txData, setTxData] = useState(null);
  const [lastUtr, setLastUtr] = useState("");

  return (
    <MerchantLayout>
      <div className="max-w-5xl mx-auto space-y-6 px-3 sm:px-0 py-4 sm:py-0">

        {/* ── Header ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
                <FlaskConical size={22} className="text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Withdrawal Sandbox</h1>
                <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
                  Simulate the full payout/withdrawal flow end-to-end — including request body, headers, status lifecycle, and webhook payloads.
                  <strong className="text-gray-700"> No API calls are made.</strong> All responses are generated locally in your browser.
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 uppercase tracking-wide">
                Sandbox — Test Mode
              </span>
              <span className="text-xs text-gray-400">Zero DB writes · Pure simulation</span>
            </div>
          </div>
        </div>

        {/* ── Sandbox notice ── */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <strong>Sandbox — No Real Transactions</strong><br />
            This page simulates the withdrawal API entirely in the browser. No requests reach the backend.
            No withdrawals are created, no balances are deducted, and no webhooks are sent.
            Switch to the{" "}
            <a href="/merchant-api-docs" className="underline font-medium">API Documentation</a>{" "}
            for production endpoint details.
          </div>
        </div>

        {/* ── API Key display ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">
            Withdrawal API Key{" "}
            <code className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">api-key header</code>
          </label>
          <div className="bg-[#111827] text-emerald-400 rounded-xl px-4 py-2.5 font-mono text-xs break-all">
            {apiKey || "<request from your admin — Withdrawal Configs page>"}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            In sandbox mode this key is not validated — the simulation runs regardless.
            Use your real key when switching to production.
          </p>
        </div>

        {/* ── Steps ── */}
        <CreatePayoutCard apiKey={apiKey} onCreated={d => { setTxData(d); setLastUtr(""); }} />
        <StatusCheckCard txData={txData} />
        <WebhookCard txData={txData} lastUtr={lastUtr} />

        {/* ── Reference docs ── */}
        <ReferenceDocs />

        {/* ── Diff from PayIn sandbox ── */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3 text-sm">How This Differs From the PayIn Sandbox</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs min-w-[480px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-gray-700">Aspect</th>
                  <th className="text-left px-3 py-2 font-bold text-blue-700">PayIn Sandbox</th>
                  <th className="text-left px-3 py-2 font-bold text-amber-700">Withdrawal Sandbox (this page)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Backend calls", "Real (x-rdpay-sandbox: 1 header)", "None — pure browser simulation"],
                  ["DB writes", "Sandbox DB only", "Zero"],
                  ["Status progression", "Real server-driven via polling", "Timer-animated in the browser"],
                  ["Webhook", "Sandbox server fires to your URL", "Payload shown locally, not sent"],
                  ["Auth required", "Sandbox API key needed", "No validation — runs without key"],
                  ["Use to test", "Hosted checkout URL, UTR flow", "Request format, field names, response shape, webhook handling"],
                ].map(([aspect, payin, withdrawal]) => (
                  <tr key={aspect} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-700">{aspect}</td>
                    <td className="px-3 py-2 text-gray-600">{payin}</td>
                    <td className="px-3 py-2 text-gray-600">{withdrawal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </MerchantLayout>
  );
}
