import { useState } from "react";
import {
  Smartphone,
  Building2,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Scale,
  Copy,
  QrCode,
} from "lucide-react";

function StatusPill({ status }) {
  const styles = {
    Pending: "bg-amber-100 text-amber-700",
    "UTR Submitted": "bg-amber-100 text-amber-700",
    Approved: "bg-green-100 text-green-700",
    Failed: "bg-red-100 text-red-700",
    Expired: "bg-red-100 text-red-700",
    Rejected: "bg-red-100 text-red-700",
    Disputed: "bg-blue-100 text-blue-700",
    "Agent Verified": "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

function MockBrowserFrame({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
      <div className="bg-slate-100 px-4 py-2 flex items-center gap-2 border-b border-slate-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="ml-3 flex-1 text-xs text-slate-500 font-mono truncate">{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function FlowStep({ num, title, who, children }) {
  const colors = {
    customer: "bg-pink-50 border-pink-200 text-pink-900",
    merchant: "bg-blue-50 border-blue-200 text-blue-900",
    agent: "bg-purple-50 border-purple-200 text-purple-900",
    system: "bg-gray-50 border-gray-200 text-gray-900",
  };
  return (
    <div className={`relative rounded-2xl border p-5 ${colors[who]}`}>
      <div className="flex items-start gap-3 mb-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border-2 border-current flex items-center justify-center text-sm font-bold">
          {num}
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider opacity-70 font-bold">{who}</div>
          <div className="font-semibold text-base">{title}</div>
        </div>
      </div>
      <div className="text-sm leading-relaxed ml-11">{children}</div>
    </div>
  );
}

function ActorCard({ icon: Icon, name, role, color }) {
  return (
    <div className={`rounded-2xl border-2 ${color} p-5 text-center`}>
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-white flex items-center justify-center">
        <Icon size={28} />
      </div>
      <div className="font-bold text-lg">{name}</div>
      <div className="text-xs opacity-75 mt-1">{role}</div>
    </div>
  );
}

function SectionTitle({ children, subtitle }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">{children}</h2>
      {subtitle && <p className="text-slate-600">{subtitle}</p>}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center my-2">
      <div className="w-0.5 h-8 bg-slate-300 relative">
        <div className="absolute -bottom-1 -left-1.5 w-3 h-3 border-r-2 border-b-2 border-slate-400 transform rotate-45" />
      </div>
    </div>
  );
}

// ── Mock Checkout Page (Pending state) ─────────────────────────────────────
function MockCheckoutPending() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Order</div>
          <div className="text-xs font-medium truncate">ORD-1042</div>
          <div className="mt-2 text-xl font-bold">₹10,000</div>
        </div>
        <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
          <div className="text-[10px] text-slate-500">Time remaining</div>
          <div className="text-lg font-bold text-slate-900">02:47</div>
        </div>
        <div className="px-4 py-3 flex flex-col items-center">
          <div className="text-[10px] text-slate-600 mb-2 font-semibold">Scan & Pay with any UPI app</div>
          <div className="bg-white p-2 rounded-lg border border-slate-200">
            <div className="w-20 h-20 grid grid-cols-8 gap-px bg-black p-1">
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} className={(i * 7 + i * i) % 3 === 0 ? "bg-white" : "bg-black"} />
              ))}
            </div>
          </div>
          <div className="text-[9px] text-slate-500 mt-1">UPI: foo@bank <span className="text-indigo-600 underline ml-1">Copy</span></div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="text-[10px] font-semibold text-slate-700 mb-1">Pay to this account</div>
          <div className="bg-slate-50 rounded p-2 space-y-0.5 text-[10px]">
            <div className="flex justify-between"><span className="text-slate-500">Bank</span><span className="font-medium">HDFC</span></div>
            <div className="flex justify-between"><span className="text-slate-500">A/C</span><span className="font-mono">5012...</span></div>
            <div className="flex justify-between"><span className="text-slate-500">IFSC</span><span className="font-mono">HDFC001</span></div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="text-[10px] font-semibold text-slate-700 mb-1">Enter UTR after payment</div>
          <div className="h-7 border border-slate-300 rounded bg-white"></div>
          <button className="mt-2 w-full bg-indigo-600 text-white text-[10px] font-medium py-1.5 rounded">
            I have paid — Submit UTR
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mock Checkout (Verifying state) ────────────────────────────────────────
function MockCheckoutVerifying() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Order</div>
          <div className="text-xs font-medium truncate">ORD-1042</div>
          <div className="mt-2 text-xl font-bold">₹10,000</div>
        </div>
        <div className="px-4 py-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xl mb-2 animate-pulse">
            <Clock size={20} />
          </div>
          <div className="text-sm font-semibold text-slate-900">Verifying your payment…</div>
          <div className="text-[10px] text-slate-600 mt-1">UTR: <span className="font-mono">412345678901</span></div>
          <div className="text-[10px] text-slate-500 mt-2">Verification window: 14:23</div>
          <button className="mt-3 text-[10px] text-indigo-600 underline">
            Submitted wrong UTR? Correct it
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mock Checkout (Failed → Dispute form) ──────────────────────────────────
function MockCheckoutFailed() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Order</div>
          <div className="text-xs font-medium">ORD-1042</div>
          <div className="mt-2 text-xl font-bold">₹10,000</div>
        </div>
        <div className="px-4 py-4">
          <div className="text-center mb-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl mb-2">×</div>
            <div className="text-sm font-semibold text-slate-900">We couldn't verify your payment</div>
            <div className="text-[10px] text-slate-500 mt-1">Submitted UTR: <span className="font-mono">412345678901</span></div>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] font-semibold text-slate-700 mb-1">Already paid? Enter correct UTR for manual review</div>
            <div className="h-7 border border-slate-300 rounded bg-white"></div>
            <button className="mt-2 w-full bg-indigo-600 text-white text-[10px] font-medium py-1.5 rounded">
              Submit for manual review
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mock Checkout (Disputed) ───────────────────────────────────────────────
function MockCheckoutDisputed() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Order</div>
          <div className="text-xs font-medium">ORD-1042</div>
          <div className="mt-2 text-xl font-bold">₹10,000</div>
        </div>
        <div className="px-4 py-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl mb-2">
            <Scale size={20} />
          </div>
          <div className="text-sm font-semibold text-slate-900">Under manual review</div>
          <div className="text-[10px] text-slate-500 mt-2">Correct UTR: <span className="font-mono text-blue-700">412345678955</span></div>
          <div className="text-[9px] text-slate-400 mt-0.5">Original: <span className="font-mono">412345678901</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Mock Checkout (Approved) ───────────────────────────────────────────────
function MockCheckoutApproved() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
          <div className="text-[10px] uppercase tracking-wide opacity-80">Order</div>
          <div className="text-xs font-medium">ORD-1042</div>
          <div className="mt-2 text-xl font-bold">₹10,000</div>
        </div>
        <div className="px-4 py-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl mb-2">
            <CheckCircle2 size={20} />
          </div>
          <div className="text-sm font-semibold text-slate-900">Payment verified</div>
          <div className="text-[10px] text-slate-600 mt-1">Your payment has been confirmed.</div>
          <div className="text-[10px] text-slate-500 mt-2">UTR: <span className="font-mono">412345678901</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Mock merchant Create Payin (after success) ─────────────────────────
function MockCreatePayinSuccess() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 text-xs">
        <div className="text-base font-bold text-slate-900 mb-3">Payin Form</div>
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-[10px] font-semibold text-green-700 mb-3">
          Payin created — share details with customer
        </div>
        <div className="rounded bg-[#0b2a5b] px-3 py-2 text-white flex items-center justify-between mb-3">
          <div>
            <div className="text-[9px] uppercase opacity-80">Amount</div>
            <div className="text-[9px] opacity-70">Ref: 5a3b...</div>
          </div>
          <div className="text-lg font-bold">₹10,000</div>
        </div>
        <div className="text-[10px] font-semibold text-slate-700 mb-1 text-center">Scan & Pay</div>
        <div className="flex justify-center mb-2">
          <div className="bg-white p-2 rounded border border-slate-200">
            <div className="w-16 h-16 grid grid-cols-7 gap-px bg-black p-1">
              {Array.from({ length: 49 }).map((_, i) => (
                <div key={i} className={(i * 5 + 3) % 3 === 0 ? "bg-white" : "bg-black"} />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-slate-50 rounded p-2 space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-slate-500">Bank</span><span className="font-medium">HDFC</span></div>
          <div className="flex justify-between"><span className="text-slate-500">A/C</span><span className="font-mono">5012...</span></div>
          <div className="flex justify-between"><span className="text-slate-500">UPI</span><span className="font-mono">foo@bank</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Mock Agent Payment Proof List ───────────────────────────────────────
function MockProofList() {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-base font-bold text-slate-900">Payment Proof List</div>
        </div>
        <table className="w-full text-[10px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-bold">ID</th>
              <th className="text-left px-3 py-2 font-bold">Amount</th>
              <th className="text-left px-3 py-2 font-bold">UTR</th>
              <th className="text-left px-3 py-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-2">95</td>
              <td className="px-3 py-2">5,000</td>
              <td className="px-3 py-2 font-mono">412345...</td>
              <td className="px-3 py-2"><StatusPill status="Agent Verified" /></td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-2">94</td>
              <td className="px-3 py-2">10,000</td>
              <td className="px-3 py-2 font-mono">615034...</td>
              <td className="px-3 py-2"><StatusPill status="Agent Verified" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Mock merchant Payin Transactions ───────────────────────────────────
function MockPayinList({ statuses }) {
  return (
    <div className="bg-slate-50 p-3 rounded-lg">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-xs">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-base font-bold text-slate-900">Payin Transactions</div>
        </div>
        <table className="w-full text-[10px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 font-bold">ID</th>
              <th className="text-left px-3 py-2 font-bold">Amount</th>
              <th className="text-left px-3 py-2 font-bold">UTR</th>
              <th className="text-left px-3 py-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-2">{100 - i}</td>
                <td className="px-3 py-2">{(i + 1) * 1000}</td>
                <td className="px-3 py-2 font-mono">{s.utr || "—"}</td>
                <td className="px-3 py-2"><StatusPill status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const [activeFlow, setActiveFlow] = useState("A");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl sm:text-5xl font-bold mb-3">How MasterPay Works</h1>
          <p className="text-indigo-100 text-base sm:text-lg max-w-2xl">
            Three ways merchants accept payments. One reconciliation engine that matches agent bank credits to merchant orders automatically.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12 sm:space-y-16">

        {/* ── ACTORS ────────────────────────────────────────────────────── */}
        <section>
          <SectionTitle subtitle="Three roles, each with a different job in the payment lifecycle">
            The Three Actors
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ActorCard
              icon={Smartphone}
              name="Customer"
              role="Pays via UPI / bank transfer to agent's account"
              color="border-pink-200 bg-pink-50 text-pink-900"
            />
            <ActorCard
              icon={Building2}
              name="Merchant"
              role="Creates payin requests (via API, UI, or hosted checkout)"
              color="border-blue-200 bg-blue-50 text-blue-900"
            />
            <ActorCard
              icon={ShieldCheck}
              name="Agent"
              role="Owns bank accounts. Verifies incoming credits (bot or manual)"
              color="border-purple-200 bg-purple-50 text-purple-900"
            />
          </div>
        </section>

        {/* ── FLOW PICKER ───────────────────────────────────────────────── */}
        <section>
          <SectionTitle subtitle="Pick a flow to see the step-by-step walkthrough">
            Three Payment Flows
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {[
              { id: "A", title: "API-First", desc: "Merchant integrates programmatically. Customer paid out-of-band." },
              { id: "B", title: "Hosted Checkout", desc: "Merchant sends customer a URL. Self-contained payment page." },
              { id: "C", title: "Manual Create", desc: "Merchant logs in, generates payin in dashboard with QR." },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFlow(f.id)}
                className={`rounded-xl border-2 p-5 text-left transition ${
                  activeFlow === f.id
                    ? "border-indigo-600 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
              >
                <div className="text-xs font-bold text-indigo-600 mb-1">FLOW {f.id}</div>
                <div className="font-bold text-lg text-slate-900">{f.title}</div>
                <div className="text-sm text-slate-600 mt-1">{f.desc}</div>
              </button>
            ))}
          </div>

          {/* ── FLOW A: API-First ──────────────────────────────────────── */}
          {activeFlow === "A" && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="text-xs font-bold text-indigo-600 mb-1">FLOW A</div>
                <h3 className="text-2xl font-bold mb-2">API-First Integration</h3>
                <p className="text-slate-600 text-sm mb-6">
                  The merchant's backend calls our API to create a payin. Customer pays directly to the assigned agent bank account. Agent's bot scrapes their bank statement and auto-matches the credit.
                </p>

                <FlowStep num="1" who="merchant" title="Merchant calls POST /api/payins">
                  merchant's backend sends amount + (optional) webhook_url. Backend selects an available agent account and returns the assigned bank details (bank, A/C, IFSC, UPI ID, transaction_ref).
                  <div className="mt-3 bg-slate-900 text-green-300 rounded p-3 font-mono text-[11px] overflow-x-auto">
{`POST /api/payins
{
  "amount": 10000,
  "webhook_url": "https://merchant.example/wh",
  "merchant_id": 12
}`}
                  </div>
                </FlowStep>
                <Arrow />
                <FlowStep num="2" who="system" title="Backend creates Pending row">
                  Transaction stored with <StatusPill status="Pending" />, empty UTR, and the merchant's webhook_url. Agent's account `max_available_limit` is reserved.
                </FlowStep>
                <Arrow />
                <FlowStep num="3" who="customer" title="Customer pays to agent's bank">
                  Merchant shows the bank details to the customer (out-of-band — could be email, in-app, etc.). Customer transfers ₹10,000 via UPI/IMPS.
                </FlowStep>
                <Arrow />
                <FlowStep num="4" who="agent" title="Agent's bot scrapes the bank statement">
                  Equitas/HDFC/etc. bot polls the agent's bank, sees the new credit, posts to <code className="bg-white px-1.5 py-0.5 rounded">POST /api/payin/agent-submitutr</code> with utr + amount + account.
                </FlowStep>
                <Arrow />
                <FlowStep num="5" who="system" title="Auto-match by amount + account">
                  Backend finds the merchant's <StatusPill status="Pending" /> row by amount + account_id (where utr is empty). Picks the <strong>newest</strong> matching row, sets the UTR, marks <StatusPill status="Approved" />, fires merchant's webhook.
                </FlowStep>
                <Arrow />
                <FlowStep num="6" who="merchant" title="Webhook delivered to merchant">
                  Merchant's endpoint receives <code className="bg-white px-1.5 py-0.5 rounded">payin.approved</code> event with full transaction details. Merchant fulfills the order.
                </FlowStep>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Merchant sees</div>
                  <MockPayinList statuses={[
                    { status: "Approved", utr: "615034..." },
                    { status: "Pending", utr: "" },
                  ]} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Webhook payload</div>
                  <MockBrowserFrame title="POST → merchant.example/wh">
                    <pre className="text-[11px] text-slate-700 leading-relaxed">{`{
  "event": "payin.approved",
  "transaction_ref": "5a3b...",
  "amount": 10000,
  "utr_number": "615034...",
  "status": "Approved",
  "approved_at": "2026-05-30T11:14:01Z"
}`}</pre>
                  </MockBrowserFrame>
                </div>
              </div>
            </div>
          )}

          {/* ── FLOW B: Hosted Checkout ────────────────────────────────── */}
          {activeFlow === "B" && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="text-xs font-bold text-indigo-600 mb-1">FLOW B</div>
                <h3 className="text-2xl font-bold mb-2">Hosted Checkout URL</h3>
                <p className="text-slate-600 text-sm mb-6">
                  Merchant gets a checkout URL from our API. Customer opens it, sees bank + QR, pays, submits the UTR right on the page. Built-in 3-min payment window and 15-min verification window with dispute support.
                </p>

                <FlowStep num="1" who="merchant" title="Merchant calls POST /api/payin/checkout/create">
                  Returns a <code className="bg-white px-1.5 py-0.5 rounded">checkout_url</code> like <code className="bg-white px-1.5 py-0.5 rounded">https://masterpay.live/checkout/&lt;ref&gt;</code>. Merchant redirects customer to it.
                </FlowStep>
                <Arrow />
                <FlowStep num="2" who="customer" title="Opens checkout page, pays, submits UTR">
                  Customer sees QR + bank details with a 3-min countdown. Pays via any UPI app. Enters the UTR from their bank confirmation and clicks "I have paid".
                </FlowStep>
                <Arrow />
                <FlowStep num="3" who="system" title="UTR Submitted → 15-min verification window starts">
                  Status moves to <StatusPill status="UTR Submitted" />. Verification clock starts. Agent's bot (or manual) needs to confirm the credit within 15 min.
                </FlowStep>
                <Arrow />
                <FlowStep num="4" who="agent" title="Bot uploads matching credit">
                  Agent's bot sees the credit hit the bank, posts UTR. Backend matches utr + amount + account → <StatusPill status="Approved" />.
                </FlowStep>
                <Arrow />
                <FlowStep num="5" who="system" title="If no match in 15 min → Failed + dispute">
                  Transaction flips to <StatusPill status="Failed" />. Agent's limit is refunded. Merchant webhook <code className="bg-white px-1.5 py-0.5 rounded">payin.failed</code> fires. Customer sees a dispute form on the checkout page.
                </FlowStep>
                <Arrow />
                <FlowStep num="6" who="customer" title="Customer submits dispute with correct UTR (if mistyped)">
                  Customer enters correct UTR → status becomes <StatusPill status="Disputed" />. Agent reviews in dashboard, approves or rejects manually.
                </FlowStep>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">1. Pending (pay)</div>
                  <MockCheckoutPending />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">2. Verifying</div>
                  <MockCheckoutVerifying />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">3a. Approved</div>
                  <MockCheckoutApproved />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">3b. Failed → Disputed</div>
                  <MockCheckoutFailed />
                </div>
              </div>
            </div>
          )}

          {/* ── FLOW C: Manual Create ──────────────────────────────────── */}
          {activeFlow === "C" && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="text-xs font-bold text-indigo-600 mb-1">FLOW C</div>
                <h3 className="text-2xl font-bold mb-2">Manual Create in Dashboard</h3>
                <p className="text-slate-600 text-sm mb-6">
                  merchant logs into our dashboard, fills the "Create Payin" form, gets the QR + bank details on the success screen. Useful for one-off requests or testing without integrating the API.
                </p>

                <FlowStep num="1" who="merchant" title="Opens Create Payin form, enters amount">
                  merchant navigates to <strong>Payin → Create</strong>. Enters amount, optional webhook_url and unique_id. Clicks Save Payin.
                </FlowStep>
                <Arrow />
                <FlowStep num="2" who="system" title="Returns bank + QR on success screen">
                  Same backend logic as API flow — reserves an agent account, creates a Pending row, returns the assigned bank details. Page shows the QR for the merchant to share.
                </FlowStep>
                <Arrow />
                <FlowStep num="3" who="customer" title="Customer pays (out-of-band)">
                  Merchant shares the QR or bank details with their customer (screenshot, WhatsApp, email, etc.). Customer pays.
                </FlowStep>
                <Arrow />
                <FlowStep num="4" who="agent" title="Agent confirms (bot or manual)">
                  Either bot or agent manually adds proof via <strong>Payment Proof → Create</strong>. Same matching logic as Flow A.
                </FlowStep>
                <Arrow />
                <FlowStep num="5" who="system" title="Webhook fires + merchant page auto-refreshes">
                  Merchant's Payin Transactions list polls every 7s, so the status flips from Pending → Approved without a manual refresh.
                </FlowStep>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">After Create — merchant sees QR</div>
                  <MockCreatePayinSuccess />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2">After Agent matches — merchant sees</div>
                  <MockPayinList statuses={[
                    { status: "Approved", utr: "615034..." },
                  ]} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── AGENT LANES ────────────────────────────────────────────── */}
        <section>
          <SectionTitle subtitle="The agent side has two parallel lists: one for merchant transactions, one for unmatched bank credits">
            How the Agent Sees It
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 mb-3">
                <div className="font-bold text-blue-900 mb-1">Payin Transactions List</div>
                <p className="text-xs text-blue-800">Merchant-initiated payins flowing through the system. Approved, Pending, Failed, Disputed all live here.</p>
              </div>
              <MockPayinList statuses={[
                { status: "Approved", utr: "615034..." },
                { status: "UTR Submitted", utr: "412345..." },
                { status: "Pending", utr: "" },
                { status: "Disputed", utr: "412345..." },
              ]} />
            </div>
            <div>
              <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 mb-3">
                <div className="font-bold text-purple-900 mb-1">Payment Proof List</div>
                <p className="text-xs text-purple-800">Bank credits logged (by bot or manually) that don't yet have a merchant transaction to attach to. Wait here until a merchant submits matching UTR.</p>
              </div>
              <MockProofList />
            </div>
          </div>
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0" size={20} />
            <div className="text-sm text-amber-900">
              <strong>Key invariant:</strong> a row is either an <em>agent proof</em> (no merchant linkage, status <StatusPill status="Agent Verified" />) OR a <em>merchant transaction</em> (has merchant_id, any status). When a merchant later submits a UTR that matches a waiting proof, the proof is deleted and the merchant row is approved — never two rows for one payment.
            </div>
          </div>
        </section>

        {/* ── STATE MACHINE ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle subtitle="Every transaction lives in one of these states. Transitions are deterministic and event-driven.">
            Transaction State Machine
          </SectionTitle>

          <div className="bg-white rounded-2xl border border-slate-200 p-8 overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Top row: entry states */}
              <div className="flex justify-center gap-12 mb-6">
                <StateNode label="Pending" color="amber" desc="Merchant created, awaiting payment" />
              </div>
              <div className="flex justify-center text-slate-400 text-xs my-1">↓ customer pays + submits UTR</div>
              <div className="flex justify-center gap-12 mb-6">
                <StateNode label="UTR Submitted" color="amber" desc="Awaiting agent confirmation" />
                <StateNode label="Agent Verified" color="purple" desc="Proof waiting for merchant match" />
              </div>
              <div className="grid grid-cols-3 text-xs text-slate-500 text-center my-1 gap-4">
                <span>↓ match found</span>
                <span>↓ 15 min timeout</span>
                <span>↓ merchant submits matching UTR</span>
              </div>
              <div className="flex justify-center gap-8 mb-6">
                <StateNode label="Approved" color="green" desc="Webhook fires, money confirmed" />
                <StateNode label="Failed" color="red" desc="Timeout — customer can dispute" />
              </div>
              <div className="flex justify-center text-slate-400 text-xs my-1">↓ customer submits dispute</div>
              <div className="flex justify-center gap-12 mb-6">
                <StateNode label="Disputed" color="blue" desc="Agent reviews manually" />
              </div>
              <div className="grid grid-cols-2 text-xs text-slate-500 text-center my-1 gap-4">
                <span>↓ agent approves</span>
                <span>↓ agent rejects</span>
              </div>
              <div className="flex justify-center gap-12">
                <StateNode label="Approved" color="green" desc="(reattached, webhook fires)" />
                <StateNode label="Rejected" color="red" desc="Final fail" />
              </div>
            </div>
          </div>
        </section>

        {/* ── STATUS TABLE ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle>Status Reference</SectionTitle>
          <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                  <th className="text-left px-4 py-3 font-bold">Meaning</th>
                  <th className="text-left px-4 py-3 font-bold">Limit reserved?</th>
                  <th className="text-left px-4 py-3 font-bold">Webhook</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { s: "Pending", m: "Created, waiting for customer payment or UTR", l: "Yes", w: "—" },
                  { s: "UTR Submitted", m: "Customer/merchant submitted UTR, awaiting bank confirmation", l: "Yes", w: "—" },
                  { s: "Agent Verified", m: "Agent logged bank credit, no merchant row yet to match", l: "No", w: "—" },
                  { s: "Approved", m: "Matched and confirmed — money is in agent's account", l: "Yes (consumed)", w: "payin.approved" },
                  { s: "Failed", m: "Verification window expired, no match found", l: "No (refunded)", w: "payin.failed" },
                  { s: "Disputed", m: "Customer claims they paid with a corrected UTR", l: "No", w: "payin.disputed" },
                  { s: "Expired", m: "3-min payment window closed before UTR submitted", l: "No (refunded)", w: "payin.expired" },
                  { s: "Rejected", m: "Final fail — agent rejected the dispute or 24-hr timeout", l: "No (refunded)", w: "payin.failed" },
                ].map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-3"><StatusPill status={row.s} /></td>
                    <td className="px-4 py-3 text-slate-700">{row.m}</td>
                    <td className="px-4 py-3 text-slate-600">{row.l}</td>
                    <td className="px-4 py-3"><code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{row.w}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── MATCHING RULES ───────────────────────────────────────────── */}
        <section>
          <SectionTitle subtitle="How the reconciliation engine decides what to match">
            Matching Rules
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="font-bold mb-2 text-slate-900">When agent submits proof</div>
              <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
                <li>UTR already on a row with matching amount? → approve that row, fire webhook.</li>
                <li>Find merchant <StatusPill status="Pending" /> row with matching <strong>amount + account</strong> and empty UTR — pick the <strong>newest</strong>, attach UTR, mark <StatusPill status="Approved" />, fire webhook.</li>
                <li>Nothing matches → save as <StatusPill status="Agent Verified" /> proof, wait for merchant.</li>
              </ol>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="font-bold mb-2 text-slate-900">When merchant submits UTR</div>
              <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
                <li>Row already <StatusPill status="Approved" /> with same UTR → no-op (idempotent).</li>
                <li>Find matching <StatusPill status="Agent Verified" /> proof by <strong>utr + amount + account</strong> → delete proof, approve merchant row, fire webhook.</li>
                <li>No matching proof → set UTR on merchant row, status moves to <StatusPill status="UTR Submitted" /> awaiting agent.</li>
              </ol>
            </div>
          </div>
        </section>

      </div>
{/* 
      <div className="bg-slate-900 text-slate-400 py-8 text-center text-sm">
        Secured by MasterPay
      </div> */}
    </div>
  );
}

function StateNode({ label, color, desc }) {
  const colors = {
    amber: "bg-amber-50 border-amber-300 text-amber-900",
    green: "bg-green-50 border-green-300 text-green-900",
    red: "bg-red-50 border-red-300 text-red-900",
    blue: "bg-blue-50 border-blue-300 text-blue-900",
    purple: "bg-purple-50 border-purple-300 text-purple-900",
  };
  return (
    <div className={`rounded-xl border-2 ${colors[color]} px-4 py-3 min-w-[160px] text-center`}>
      <div className="font-bold text-sm">{label}</div>
      <div className="text-[10px] mt-1 opacity-80">{desc}</div>
    </div>
  );
}
