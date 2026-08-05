import MerchantLayout from "../../layouts/MerchantLayout";

function ApiDocumentationmerchant() {
  const apiKey =
    JSON.parse(localStorage.getItem("rdpay_user_info") || "{}")?.api_key ||
    "YOUR_API_KEY";

  return (
    <MerchantLayout>
      <div className="max-w-6xl mx-auto px-3 sm:px-0 py-4 sm:py-0">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-8">
          <h1 className="text-4xl font-bold text-[#1E88FF] mb-3">
            Merchant PayIn API Documentation
          </h1>

          <p className="text-gray-600 mb-8 text-lg">
            Integrate TRUST PAY PayIn APIs into your website or application.
          </p>

          {/* API KEY */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-8">
          <h2 className="text-xl font-bold mb-3">
  Your API Key{" "}
  <span className="text-sm font-normal text-gray-500">
    (You can find the API key in merchant List)
  </span>
</h2>
            <div className="bg-black text-green-400 rounded-xl p-4 break-all font-mono text-sm">
              {apiKey}
            </div>

            <p className="text-sm text-gray-500 mt-3">
              Use this key in the request header:
            </p>

            <div className="bg-gray-100 rounded-xl p-3 mt-2 font-mono text-sm">
              x-api-key: {apiKey}
            </div>
          </div>

          {/* BASE URL */}
          <div className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Base URL</h2>

            <div className="bg-gray-100 rounded-xl p-4 font-mono">
              https://masterpay.live
            </div>
          </div>

          {/* INTEGRATION MODES */}
          <div className="mb-10 bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
            <h2 className="text-2xl font-bold mb-3 text-indigo-900">
              Choose your integration mode
            </h2>
            <ul className="space-y-2 text-gray-700 text-sm">
              <li>
                <strong className="text-indigo-900">Mode A — API integration:</strong>{" "}
                You build your own payment page. We return bank details; you
                collect the UTR from the customer and forward it to us.
                Endpoints below in sections <strong>1A → 3A</strong>.
              </li>
              <li>
                <strong className="text-indigo-900">Mode B — Hosted checkout (recommended):</strong>{" "}
                We return a checkout URL on{" "}
                <span className="font-mono">masterpay.live</span>. You just
                redirect your customer there. We show the bank details, run a
                5-minute timer, collect the UTR, and fire the webhook when
                verified. Endpoints below in sections <strong>1B → 3B</strong>.
              </li>
            </ul>
          </div>

          {/* MODE A HEADER */}
          <h2 className="text-3xl font-bold mb-2 text-gray-800 border-b-2 border-slate-200 pb-2">
            Mode A — API Integration
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            Use this mode if you want to render the bank details on your own
            page and collect the UTR server-to-server.
          </p>

          {/* CREATE PAYIN */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              1A. Create PayIn
            </h2>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <p className="font-semibold">
                POST /api/payin/create
              </p>
            </div>

            <h3 className="font-bold mb-2">Headers</h3>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "x-api-key": "${apiKey}",
  "Content-Type": "application/json"
}`}
            </pre>

            <h3 className="font-bold mb-2">Request Body</h3>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "merchant_order_id": "ORD1001",
  "amount": 500,
  "customer_name": "Ali",
  "customer_mobile": "971500000000",
  "webhook_url": "https://yourwebsite.com/webhook",
  "redirect_url": "https://yourwebsite.com/payment-success"
}`}
            </pre>

            <p className="text-sm text-gray-600 mb-4">
              <strong>redirect_url</strong> (optional): URL the customer is sent to after their payment is approved.
              Applies to hosted checkout (Mode B) — the checkout page shows a "Payment Verified" screen for 2 seconds
              then redirects to this URL.
            </p>

            <h3 className="font-bold mb-2">Success Response</h3>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm">
{`{
  "success": true,
  "transaction_id": 1,
  "transaction_ref": "abc123xyz",
  "merchant_order_id": "ORD1001",
  "amount": 500,
  "status": "Pending",
  "bank_details": {
    "bank_name": "Indian Bank",
    "ifsc_code": "IDIB000A180",
    "account_number": "1234567890",
    "account_holder_name": "Rohit",
    "upi_id": "rohit@ybl"
  }
}`}
            </pre>
          </div>

          {/* SUBMIT UTR */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              2A. Submit UTR
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <p className="font-semibold">
                POST /api/payin/submit-utr
              </p>
            </div>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm">
{`{
  "transaction_id": 1,
  "utr_number": "UTR123456789"
}`}
            </pre>
          </div>

          {/* CHECK STATUS */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              3A. Check Transaction Status
            </h2>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
              <p className="font-semibold">
                GET /api/payin/status/:transactionId
              </p>
            </div>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm">
{`GET /api/payin/status/1`}
            </pre>
          </div>

          {/* MODE B HEADER */}
          <h2 className="text-3xl font-bold mb-2 mt-12 text-gray-800 border-b-2 border-indigo-200 pb-2">
            Mode B — Hosted Checkout
          </h2>
          <p className="text-gray-600 text-sm mb-6">
            Use this mode if you want us to host the payment page. Call{" "}
            <span className="font-mono">/api/payin/checkout/create</span>,
            redirect the customer to the returned{" "}
            <span className="font-mono">checkout_url</span>, and wait for the
            webhook. The customer sees the bank details, a 5-minute countdown,
            and a UTR form on our page.
          </p>

          {/* CREATE CHECKOUT */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              1B. Create Hosted Checkout
            </h2>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <p className="font-semibold">
                POST /api/payin/checkout/create
              </p>
            </div>

            <h3 className="font-bold mb-2">Headers</h3>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "x-api-key": "${apiKey}",
  "Content-Type": "application/json"
}`}
            </pre>

            <h3 className="font-bold mb-2">Request Body</h3>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "merchant_order_id": "ORD1001",
  "amount": 500,
  "customer_name": "Ali",
  "customer_mobile": "971500000000",
  "webhook_url": "https://yourwebsite.com/webhook",
  "redirect_url": "https://yourwebsite.com/payment-success"
}`}
            </pre>

            <p className="text-sm text-gray-600 mb-4">
              <strong>redirect_url</strong> (optional): When the customer's payment is approved on the hosted checkout page,
              they see a "Payment Verified" confirmation for 2 seconds and are then redirected to this URL automatically.
            </p>

            <h3 className="font-bold mb-2">Success Response</h3>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "success": true,
  "transaction_id": 1,
  "transaction_ref": "abc123xyz",
  "merchant_order_id": "ORD1001",
  "amount": 500,
  "status": "Pending",
  "checkout_url": "https://masterpay.live/checkout/abc123xyz",
  "expires_at": "2026-05-26T12:34:56.000Z",
  "expires_in_seconds": 180
}`}
            </pre>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <strong>Next step:</strong> Redirect your customer's browser to{" "}
              <span className="font-mono">checkout_url</span>. You do not need
              to handle bank details or UTR collection — we do that on our
              page. Listen for the webhook to learn when the customer pays.
            </div>
          </div>

          {/* CHECK STATUS (B) */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              2B. Check Hosted Checkout Status (optional)
            </h2>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
              <p className="font-semibold">
                GET /api/payin/status/:transactionId
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              Same endpoint as Mode A — pass the{" "}
              <span className="font-mono">transaction_id</span> or{" "}
              <span className="font-mono">transaction_ref</span> returned by
              step 1B. Useful if you want to poll instead of relying solely on
              the webhook.
            </p>

            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm">
{`GET /api/payin/status/abc123xyz`}
            </pre>
          </div>

          {/* HOSTED FLOW DIAGRAM */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              Hosted Checkout Flow
            </h2>

            <div className="space-y-4">
              {[
                "You call POST /api/payin/checkout/create",
                "We return checkout_url + transaction_ref",
                "You redirect your customer to checkout_url",
                "Customer sees bank details + 5-minute timer on our page",
                "Customer pays, then enters UTR on our page",
                "Agent verifies; we fire payin.approved webhook to you",
                "(If the customer does not pay within 5 minutes, we fire payin.expired instead)",
              ].map((step, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4"
                >
                  <div className="h-10 w-10 rounded-full brand-gradient text-white flex items-center justify-center font-bold flex-shrink-0">
                    {index + 1}
                  </div>

                  <p className="font-medium text-gray-800">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* FLOW */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-4">
              Mode A — Payment Flow
            </h2>

            <div className="space-y-4">
              {[
                "Merchant creates PayIn request",
                "System returns bank account details",
                "Customer sends payment",
                "Merchant submits UTR",
                "Agent verifies payment",
                "Merchant checks transaction status",
              ].map((step, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 bg-gray-50 border border-slate-200 rounded-xl p-4"
                >
                  <div className="h-10 w-10 rounded-full bg-[#1E88FF] text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </div>

                  <p className="font-medium text-gray-800">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* WEBHOOK */}
          <div>
            <h2 className="text-2xl font-bold mb-4">
              Webhook Events
            </h2>

            <p className="text-sm text-gray-600 mb-4">
              We POST a JSON payload to your{" "}
              <span className="font-mono">webhook_url</span> when a
              transaction reaches a terminal state. Respond with HTTP 200 to
              acknowledge.
            </p>

            <h3 className="font-bold mb-2">payin.approved (both modes)</h3>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-6">
{`{
  "event": "payin.approved",
  "transaction_id": 1,
  "transaction_ref": "abc123xyz",
  "merchant_order_id": "ORD1001",
  "amount": 500,
  "utr_number": "412345678901",
  "status": "Approved",
  "approved_at": "2026-05-26T12:35:10.000Z"
}`}
            </pre>

            <h3 className="font-bold mb-2">payin.expired (Mode B only)</h3>
            <p className="text-sm text-gray-600 mb-2">
              Fired when the customer does not submit a UTR within the
              5-minute hosted-checkout window.
            </p>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm">
{`{
  "event": "payin.expired",
  "transaction_id": 1,
  "transaction_ref": "abc123xyz",
  "merchant_order_id": "ORD1001",
  "amount": 500,
  "status": "Expired",
  "expired_at": "2026-05-26T12:37:56.000Z"
}`}
            </pre>
          </div>

          {/* ── WITHDRAWAL / PAYOUT API ────────────────────────────────── */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mt-8">
            <h2 className="text-2xl font-bold mb-2 text-[#1E88FF]">
              Withdrawal (Payout) API
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Send money out from your balance to a UPI ID or bank account.
              Agent picks the request, pays from their bank, posts the UTR;
              you approve to mark Cleared. Webhook fires on{" "}
              <code>cleared</code> or <code>rejected</code>.
            </p>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 mb-5">
              <strong>Note:</strong> Withdrawal uses a <em>separate</em>{" "}
              <code>api-key</code> from your payin API key. Request it from your
              admin — they generate it on the Withdrawal Configs page.
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 mb-5">
              <strong>Two processing modes (set by admin per merchant):</strong>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li><strong>Manual</strong> (default): An agent picks the request, pays from their bank, and submits the UTR. Slower but works for any destination.</li>
                <li><strong>Auto via SSPay</strong>: Bank-account requests are auto-routed to SSPay's payout provider. UTR comes back via webhook, you approve to mark Cleared. UPI requests still go through the manual queue.</li>
              </ul>
              The API surface is identical in both modes — the request and response shapes don't change. The webhook events are the same too.
            </div>

            <h3 className="text-lg font-bold mb-2">Authentication</h3>
            <p className="text-sm text-gray-600 mb-2">
              Send these headers on every withdrawal API call:
            </p>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-6">
{`api-key: <your-withdrawal-api-key>
Content-Type: application/json`}
            </pre>

            <h3 className="text-lg font-bold mb-2">
              1. Create Payout Transaction
            </h3>
            <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded mb-3">
              POST /api/withdrawal/payout-create
            </p>

            <p className="text-sm text-gray-600 mb-2">
              <strong>transaction_type</strong> must be either{" "}
              <code>upi</code> or <code>account</code>.
            </p>

            <h4 className="font-semibold text-sm mb-1 mt-4">
              Example — UPI payout
            </h4>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "amount": 100,
  "upi_id": "test@ybl",
  "transaction_type": "upi",
  "webhookUrl": "https://your-domain.com/webhook"
}`}
            </pre>

            <h4 className="font-semibold text-sm mb-1">
              Example — Bank account payout
            </h4>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "amount": 100,
  "account_name": "Test User",
  "account_number": "358461356",
  "ifsc_code": "SBIN0000691",
  "transaction_type": "account",
  "webhookUrl": "https://your-domain.com/webhook"
}`}
            </pre>

            <h4 className="font-semibold text-sm mb-1">Success response</h4>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "message": "Transaction Create Successfully",
  "code": 200,
  "data": {
    "transaction_id": "69b413bff3567e2b4f431829"
  }
}`}
            </pre>

            <h4 className="font-semibold text-sm mb-1">
              Error response (Invalid API Key)
            </h4>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-6">
{`{
  "message": "Merchant does not exist",
  "code": 400,
  "data": {},
  "error": true
}`}
            </pre>

            <h3 className="text-lg font-bold mb-2">2. Transaction Status Check</h3>
            <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded mb-3">
              GET /api/withdrawal/transactions/status?transactionId=TRANSACTION_ID
            </p>

            <h4 className="font-semibold text-sm mb-1">Success response</h4>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "message": "ok",
  "code": 200,
  "data": {
    "transaction_id": "69b413bff3567e2b4f431829",
    "amount": "100",
    "status": "cleared",
    "utr_number": "615034567890",
    "transaction_type": "upi",
    "upi_id": "test@ybl",
    "created_at": "2026-05-30T11:13:45.363Z",
    "cleared_or_rejected_date": "2026-05-30T11:30:00.000Z"
  }
}`}
            </pre>

            <h4 className="font-semibold text-sm mb-1">Status values</h4>
            <div className="rounded-card border border-slate-200 shadow-card overflow-x-auto mb-6">
              <table className="w-full text-sm min-w-[400px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold">Status</th>
                    <th className="text-left px-3 py-2 font-bold">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["pending", "Transaction created but not yet picked by agent"],
                    ["picked", "Agent is processing the payout"],
                    ["utr_submitted", "Agent paid and posted UTR; awaiting your approval"],
                    ["cleared", "You approved — transaction completed successfully"],
                    ["rejected", "Transaction was rejected"],
                  ].map(([s, m]) => (
                    <tr key={s} className="border-t border-gray-100">
                      <td className="px-3 py-2"><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{s}</code></td>
                      <td className="px-3 py-2 text-gray-700">{m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-bold mb-2">3. Webhook Callback</h3>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Method:</strong> POST<br />
              Fires only if <code>webhookUrl</code> was provided when creating the payout, and only on terminal states (cleared / rejected).
            </p>

            <h4 className="font-semibold text-sm mb-1">Webhook payload</h4>
            <pre className="bg-black text-green-400 rounded-xl p-4 overflow-auto text-sm mb-4">
{`{
  "transactionId": "69b4104ff3567e8ddc431826",
  "status": "cleared",
  "amount": 100,
  "utr_number": "615034567890"
}`}
            </pre>

            <h4 className="font-semibold text-sm mb-1">Webhook status values</h4>
            <div className="rounded-card border border-slate-200 shadow-card overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold">Status</th>
                    <th className="text-left px-3 py-2 font-bold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-2"><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">cleared</code></td>
                    <td className="px-3 py-2 text-gray-700">Transaction completed successfully</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="px-3 py-2"><code className="bg-gray-100 px-2 py-0.5 rounded text-xs">rejected</code></td>
                    <td className="px-3 py-2 text-gray-700">Transaction failed</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </MerchantLayout>
  );
}

export default ApiDocumentationmerchant;