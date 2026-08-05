import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check, Code } from "lucide-react";
import { API_BASE_URL } from "../config/apiConfig";

// ============================================================
// TEST MODE — embedded API reference card.
// Shows the four /api/test/* endpoints with cURL examples.
// ============================================================

const BASE_URL = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");

const METHOD_STYLE = {
  POST: "bg-blue-100 text-blue-800 border-blue-200",
  GET:  "bg-green-100 text-green-800 border-green-200",
};

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/test/payin/checkout/create",
    desc: "Create a test PayIn checkout session — returns bank details and a transaction_ref",
    body: `{
  "amount": 1000,
  "merchant_order_id": "ORD-001",
  "customer_name": "Test Customer",
  "webhook_url": "https://your-domain.com/webhook",
  "redirect_url": "https://your-domain.com/success"
}`,
  },
  {
    method: "POST",
    path: "/api/test/payin/submit-utr",
    desc: "Submit UTR for a Pending test PayIn — moves it to UTR Submitted status",
    body: `{
  "transaction_ref": "<transaction_ref from create>",
  "utr_number": "412345678901",
  "payment_proof": "https://screenshot-url (optional)"
}`,
  },
  {
    method: "GET",
    path: "/api/test/payin/status/:ref",
    desc: "Poll test PayIn status — Pending → UTR Submitted → Approved / Failed / Expired",
    body: null,
  },
  {
    method: "POST",
    path: "/api/test/withdrawal/create",
    desc: "Create a test Withdrawal request within the Test Mode environment",
    body: `{
  "amount": 500,
  "transaction_type": "upi",
  "upi_id": "merchant@upi",
  "webhook_url": "https://your-domain.com/webhook"
}`,
  },
];

function buildCurl(ep, apiKey) {
  const url = `${BASE_URL}${ep.path.replace(":ref", "<transaction_ref>")}`;
  const keyLine = `-H "x-api-key: ${apiKey || "<test-api-key>"}"`;
  if (ep.method === "GET") {
    return `curl "${url}" \\\n  ${keyLine}`;
  }
  return `curl -X POST "${url}" \\\n  ${keyLine} \\\n  -H "Content-Type: application/json" \\\n  -d '${ep.body}'`;
}

function CopyBtn({ text, small = false }) {
  const [done, setDone] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      className={`flex items-center gap-1 text-gray-400 hover:text-[#1E88FF] transition-colors flex-shrink-0 ${small ? "text-[10px]" : "text-xs"}`}
    >
      {done ? <Check size={small ? 11 : 12} className="text-green-500" /> : <Copy size={small ? 11 : 12} />}
      {done ? "Copied!" : "Copy"}
    </button>
  );
}

function EndpointRow({ ep, apiKey }) {
  const [open, setOpen] = useState(false);
  const curl = buildCurl(ep, apiKey);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      {/* Summary row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold tracking-wide flex-shrink-0 ${METHOD_STYLE[ep.method]}`}>
          {ep.method}
        </span>
        <code className="text-xs font-mono text-gray-700 flex-1 min-w-0 truncate">{ep.path}</code>
        <CopyBtn text={`${BASE_URL}${ep.path}`} />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="text-gray-400 hover:text-gray-600 flex items-center gap-0.5 text-[10px] flex-shrink-0 transition-colors"
        >
          cURL {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* Description */}
      <p className="px-4 pb-2 text-[11px] text-gray-500 leading-snug">{ep.desc}</p>

      {/* Expandable cURL */}
      {open && (
        <div className="mx-4 mb-3 rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-100 border-b border-slate-200 px-3 py-1.5">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">cURL</span>
            <CopyBtn text={curl} small />
          </div>
          <pre className="text-[10px] font-mono text-gray-700 bg-white px-3 py-2.5 overflow-x-auto leading-relaxed whitespace-pre">
            {curl}
          </pre>
        </div>
      )}
    </div>
  );
}

// apiKey — pass the key already displayed in ApiKeySection so the cURL examples are pre-filled.
export default function MPTestApiDocs({ apiKey }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 bg-gray-50 border-b border-slate-200 px-5 py-3 text-left hover:bg-gray-100 transition-colors"
      >
        <Code size={14} className="text-[#1E88FF] flex-shrink-0" />
        <span className="font-semibold text-gray-800 flex-1">Test Mode API Endpoints</span>
        <span className="text-[10px] text-gray-400 mr-2">{open ? "collapse" : "expand"}</span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div>
          {/* Meta info */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-2">
            <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">Base URL</span>
                <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-700">
                  {BASE_URL || "https://masterpay.live"}
                </code>
                <CopyBtn text={BASE_URL || "https://masterpay.live"} />
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <span className="font-semibold text-gray-700 whitespace-nowrap">Auth header</span>
              <code className="bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-700 break-all">
                x-api-key: {apiKey ? apiKey.slice(0, 11) + "••••••" : "<test-api-key>"}
              </code>
              <span className="text-gray-400 text-[10px] whitespace-nowrap">(use key from section above)</span>
            </div>
            <p className="text-[11px] text-gray-400 leading-snug">
              All endpoints below require the dedicated{" "}
              <code className="bg-gray-100 px-1 rounded">test_</code> key — only valid for{" "}
              <code className="bg-gray-100 px-1 rounded">/api/test/*</code> endpoints.
              All data is processed within the Test Mode environment only.
            </p>
          </div>

          {/* Endpoint rows */}
          <div>
            {ENDPOINTS.map(ep => (
              <EndpointRow key={ep.path} ep={ep} apiKey={apiKey} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
