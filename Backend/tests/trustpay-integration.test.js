// Focused test script for the TrustPay-as-MasterPay-merchant integration
// (merchant_integration_configs, webhook signing/retry, new admin routes).
//
// Two tiers:
//   - Unit tests (webhookSecurity helpers): no DB, no server, always run.
//   - Integration tests: spawn the REAL server.js as a child process against
//     the database configured in Backend/.env, with DISABLE_BACKGROUND_JOBS=
//     true so the pre-existing jobs (SMTP alerts, SSPay polling, ledger sync)
//     never fire against whatever DB this happens to be pointed at — the new
//     webhook retry sweep is NOT part of that gate (see startDatabaseBackground
//     Jobs in server.js) because it is provably inert for every row that
//     predates this feature (it only ever acts on rows where
//     webhook_next_retry_at IS NOT NULL, which no pre-existing row has).
//     All fixtures are created with clearly-tagged random names/usernames and
//     deleted in `after`, regardless of pass/fail.
//
// Run: `npm test` (from Backend/) — requires a reachable Postgres per .env.
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const webhookSecurity = require("../lib/webhookSecurity");
const pool = require("../db"); // requiring this loads Backend/.env via dotenv, so process.env.JWT_SECRET is available below

// Mints a real JWT the same shape as POST /api/login issues, so tests
// exercise the actual authenticated path instead of the removed
// header-trust fallback (see getAuthUser() in server.js).
function signJwt(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
}
function adminJwtFor(id) {
  return signJwt({ userId: id, role: "admin", adminId: id, agentId: null, merchantId: null, superAdminId: null, clientId: null });
}
function agentJwtFor(id) {
  return signJwt({ userId: id, role: "agent", agentId: id, merchantId: null, superAdminId: null, clientId: null });
}

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests — pure functions, no DB, no server
// ═══════════════════════════════════════════════════════════════════════════
describe("webhookSecurity (unit)", () => {
  test("isSafeHttpUrl accepts http/https", () => {
    assert.equal(webhookSecurity.isSafeHttpUrl("https://example.com/hook"), true);
    assert.equal(webhookSecurity.isSafeHttpUrl("http://example.com/hook"), true);
  });

  test("isSafeHttpUrl rejects unsafe schemes and garbage", () => {
    assert.equal(webhookSecurity.isSafeHttpUrl("javascript:alert(1)"), false);
    assert.equal(webhookSecurity.isSafeHttpUrl("file:///etc/passwd"), false);
    assert.equal(webhookSecurity.isSafeHttpUrl("data:text/html,hi"), false);
    assert.equal(webhookSecurity.isSafeHttpUrl(""), false);
    assert.equal(webhookSecurity.isSafeHttpUrl(null), false);
    assert.equal(webhookSecurity.isSafeHttpUrl("not a url"), false);
  });

  test("isAllowedWebhookDomain: no allowlist configured = unrestricted (backward compatible default)", () => {
    assert.equal(webhookSecurity.isAllowedWebhookDomain("https://anything.example/x", null), true);
    assert.equal(webhookSecurity.isAllowedWebhookDomain("https://anything.example/x", []), true);
  });

  test("isAllowedWebhookDomain: exact + wildcard matching", () => {
    assert.equal(webhookSecurity.isAllowedWebhookDomain("https://hooks.trustpay.example/x", ["hooks.trustpay.example"]), true);
    assert.equal(webhookSecurity.isAllowedWebhookDomain("https://a.trustpay.example/x", ["*.trustpay.example"]), true);
    assert.equal(webhookSecurity.isAllowedWebhookDomain("https://evil.example/x", ["hooks.trustpay.example"]), false);
  });

  test("signPayload is a deterministic HMAC-SHA256 hex digest of the exact raw body", () => {
    const rawBody = '{"a":1,"b":"two"}';
    const sig = webhookSecurity.signPayload("my-secret", rawBody);
    const expected = crypto.createHmac("sha256", "my-secret").update(rawBody).digest("hex");
    assert.equal(sig, expected);
    assert.match(sig, /^[0-9a-f]{64}$/);
    // Different body -> different signature (sanity, not a security proof).
    assert.notEqual(sig, webhookSecurity.signPayload("my-secret", rawBody + "x"));
  });

  test("computeBackoffSeconds follows the bounded 1/2/5/10/30/60-minute schedule", () => {
    assert.equal(webhookSecurity.computeBackoffSeconds(1), 60);
    assert.equal(webhookSecurity.computeBackoffSeconds(2), 120);
    assert.equal(webhookSecurity.computeBackoffSeconds(3), 300);
    assert.equal(webhookSecurity.computeBackoffSeconds(4), 600);
    assert.equal(webhookSecurity.computeBackoffSeconds(5), 1800);
    assert.equal(webhookSecurity.computeBackoffSeconds(6), 3600);
    assert.equal(webhookSecurity.computeBackoffSeconds(99), 3600); // clamped, never grows unbounded
  });

  test("generateDeliveryId produces unique, well-formed UUIDs", () => {
    const a = webhookSecurity.generateDeliveryId();
    const b = webhookSecurity.generateDeliveryId();
    assert.notEqual(a, b);
    assert.match(a, /^[0-9a-f-]{36}$/);
  });

  test("generateWebhookSecret produces a 256-bit (64 hex char) secret", () => {
    const s = webhookSecurity.generateWebhookSecret();
    assert.match(s, /^[0-9a-f]{64}$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration tests — real server.js child process + real Postgres + a local
// webhook receiver.
// ═══════════════════════════════════════════════════════════════════════════
const TEST_PORT = 48765;
const RECEIVER_PORT = 48766;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const RECEIVER_BASE = `http://127.0.0.1:${RECEIVER_PORT}`;
const BACKEND_DIR = path.join(__dirname, "..");

function jitter() {
  return crypto.randomBytes(4).toString("hex");
}

describe("TrustPay merchant-integration (HTTP, real DB)", { concurrency: false }, () => {
  let serverProc;
  let receiverServer;
  /** @type {Array<{path:string, headers:Record<string,string>, rawBody:string, at:number}>} */
  let received = [];
  /** @type {Map<string, number>} path -> HTTP status to respond with (default 200) */
  const receiverStatus = new Map();
  /** @type {Set<string>} paths that hang past the client timeout instead of responding */
  const hangingPaths = new Set();

  let adminId;
  let agentAId;
  // Real, backend-verified JWT — the header-based `{role, userid}` fallback
  // this used to be is a closed authentication bypass (see the "SECURITY"
  // tests below) and no longer authenticates anyone.
  const adminHeaders = () => ({ Authorization: `Bearer ${adminJwtFor(adminId)}` });

  const fixtures = { agentIds: [], accountIds: [], merchantIds: [], withdrawalConfigIds: [], transactionIds: [], withdrawalTxnIds: [] };
  /** Merchant/withdrawal-config fixtures created in before(), read by every test. */
  const fx = {};

  async function waitUntilReady(url, tries = 80, delayMs = 250) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url);
        if (r.ok || r.status === 404) return true;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(`Server at ${url} did not become ready in time`);
  }

  before(async () => {
    // ── local webhook receiver ────────────────────────────────────────────
    receiverServer = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const entry = { path: req.url, headers: req.headers, rawBody, at: Date.now() };
        received.push(entry);
        if (hangingPaths.has(req.url)) return; // never respond — client-side timeout test
        const status = receiverStatus.get(req.url) ?? 200;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ received: true }));
      });
    });
    await new Promise((resolve) => receiverServer.listen(RECEIVER_PORT, "127.0.0.1", resolve));

    // ── real backend, as a child process, against the real configured DB ──
    serverProc = spawn(process.execPath, ["server.js"], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        DISABLE_BACKGROUND_JOBS: "true", // legacy jobs only — webhook retry sweep is exempt, see server.js
        MERCHANT_INTEGRATION_CONFIG_ENABLED: "true",
        WEBHOOK_TIMEOUT_MS: "1200",
        WEBHOOK_RETRY_SWEEP_INTERVAL_MS: "1500",
        WEBHOOK_MAX_RETRY_ATTEMPTS: "3",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProc.stdout.on("data", () => {}); // swallow logs; uncomment for debugging
    serverProc.stderr.on("data", (d) => process.stderr.write(`[server.js] ${d}`));

    await waitUntilReady(`${BASE}/`);

    // ── fixtures ────────────────────────────────────────────────────────
    const adminRow = await pool.query(`SELECT id FROM admins LIMIT 1`);
    assert.ok(adminRow.rows.length > 0, "expected exactly one seeded Admin (MasterPay's single-admin model)");
    adminId = adminRow.rows[0].id;

    const hashed = await bcrypt.hash("Test-Pass-123!", 10);

    async function createAgent(suffix) {
      const r = await pool.query(
        `INSERT INTO agents (name, commission_percent, created_by_admin_id, username, password, plain_password, is_active)
         VALUES ($1, 1, $2, $3, $4, 'x', true) RETURNING id`,
        [`__test_agent_${suffix}__`, adminId, `__test_agent_${suffix}__`, hashed],
      );
      fixtures.agentIds.push(r.rows[0].id);
      return r.rows[0].id;
    }

    async function createAgentAccount(agentId, suffix) {
      const r = await pool.query(
        `INSERT INTO agent_accounts (agent_id, created_by_admin_id, bank_name, ifsc_code, account_number, account_holder_name, is_active, max_payment_limit, max_available_limit, min_transaction_amount)
         VALUES ($1,$2,'Test Bank','TEST0000001',$3,'Test Holder', true, 1000000, 1000000, 1)
         RETURNING id`,
        [agentId, adminId, `TESTACC${suffix}`],
      );
      fixtures.accountIds.push(r.rows[0].id);
      return r.rows[0].id;
    }

    async function createMerchant({ suffix, agentId, isActive = true }) {
      const token = crypto.randomBytes(32).toString("hex");
      const apiKey = crypto.randomBytes(32).toString("hex");
      const r = await pool.query(
        `INSERT INTO merchants (name, commission_percent, agent_id, created_by_admin_id, username, password, plain_password, is_active, token, api_key)
         VALUES ($1, 1, $2, $3, $4, $5, 'x', $6, $7, $8)
         RETURNING id, api_key`,
        [`__test_merchant_${suffix}__`, agentId, adminId, `__test_merchant_${suffix}__`, hashed, isActive, token, apiKey],
      );
      fixtures.merchantIds.push(r.rows[0].id);
      return r.rows[0];
    }

    const agentA = await createAgent(`a_${jitter()}`);
    await createAgentAccount(agentA, jitter());
    agentAId = agentA;

    fx.merchantA = await createMerchant({ suffix: `A_${jitter()}`, agentId: agentA });
    fx.merchantB = await createMerchant({ suffix: `B_${jitter()}`, agentId: agentA });
    fx.merchantNoAgent = await createMerchant({ suffix: `NA_${jitter()}`, agentId: null });
    fx.merchantInactive = await createMerchant({ suffix: `IN_${jitter()}`, agentId: agentA, isActive: false });

    const wc = await pool.query(
      `INSERT INTO withdrawal_merchant_configs (merchant_id, max_payment_limit, max_available_limit, commission_percent, api_key, is_active)
       VALUES ($1, 1000000, 1000000, 1, $2, true) RETURNING id, api_key`,
      [fx.merchantA.id, crypto.randomBytes(32).toString("hex")],
    );
    fixtures.withdrawalConfigIds.push(wc.rows[0].id);
    fx.withdrawalConfigA = wc.rows[0];
  });

  after(async () => {
    try {
      if (fixtures.transactionIds.length) await pool.query(`DELETE FROM transactions WHERE id = ANY($1::int[])`, [fixtures.transactionIds]);
      if (fixtures.withdrawalTxnIds.length) await pool.query(`DELETE FROM withdrawal_transactions WHERE id = ANY($1::int[])`, [fixtures.withdrawalTxnIds]);
      if (fixtures.merchantIds.length) await pool.query(`DELETE FROM merchant_integration_configs WHERE merchant_id = ANY($1::int[])`, [fixtures.merchantIds]);
      if (fixtures.withdrawalConfigIds.length) await pool.query(`DELETE FROM withdrawal_merchant_configs WHERE id = ANY($1::int[])`, [fixtures.withdrawalConfigIds]);
      if (fixtures.merchantIds.length) await pool.query(`DELETE FROM merchants WHERE id = ANY($1::int[])`, [fixtures.merchantIds]);
      if (fixtures.accountIds.length) await pool.query(`DELETE FROM agent_accounts WHERE id = ANY($1::int[])`, [fixtures.accountIds]);
      if (fixtures.agentIds.length) await pool.query(`DELETE FROM agents WHERE id = ANY($1::int[])`, [fixtures.agentIds]);
    } finally {
      if (serverProc && !serverProc.killed) serverProc.kill();
      // The timeout test deliberately never responds to one connection —
      // force it closed instead of waiting on graceful drain forever.
      receiverServer.closeAllConnections();
      receiverServer.close();
      await pool.end();
    }
  });

  // ── Pay-In auth + validation ────────────────────────────────────────────
  test("valid Pay-In API key: checkout/create succeeds with the documented envelope", async () => {
    const r = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 100 }),
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.transaction_id);
    assert.ok(body.transaction_ref);
    assert.ok(body.checkout_url);
    assert.equal(body.status, "Pending");
    fixtures.transactionIds.push(body.transaction_id);
  });

  test("invalid Pay-In API key is rejected", async () => {
    const r = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": "not-a-real-key", "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: "x", amount: 10 }),
    });
    const body = await r.json();
    assert.equal(r.status, 401);
    assert.equal(body.message, "Invalid API key");
  });

  test("inactive merchant's Pay-In key is rejected the same way as an unknown key", async () => {
    const r = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantInactive.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: "x", amount: 10 }),
    });
    const body = await r.json();
    assert.equal(r.status, 401);
    assert.equal(body.message, "Invalid API key");
  });

  test("merchant not linked to an agent is rejected with 400", async () => {
    const r = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantNoAgent.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: "x", amount: 10 }),
    });
    const body = await r.json();
    assert.equal(r.status, 400);
    assert.equal(body.message, "Merchant is not linked to an agent");
  });

  test("checkout/create rejects unsafe webhook_url / redirect_url schemes", async () => {
    const r1 = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10, webhook_url: "javascript:alert(1)" }),
    });
    assert.equal(r1.status, 400);
    const r2 = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10, redirect_url: "file:///etc/passwd" }),
    });
    assert.equal(r2.status, 400);
  });

  test("merchant-scoped status lookup: cannot read another merchant's transaction", async () => {
    const createRes = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 50 }),
    });
    const created = await createRes.json();
    fixtures.transactionIds.push(created.transaction_id);

    const own = await fetch(`${BASE}/api/payin/status/${created.transaction_id}`, { headers: { "x-api-key": fx.merchantA.api_key } });
    assert.equal(own.status, 200);

    const cross = await fetch(`${BASE}/api/payin/status/${created.transaction_id}`, { headers: { "x-api-key": fx.merchantB.api_key } });
    const crossBody = await cross.json();
    assert.equal(cross.status, 404);
    assert.equal(crossBody.message, "Transaction not found for this API key");
  });

  test("Pay-In and Pay-Out API keys are separate credentials, not interchangeable", async () => {
    assert.notEqual(fx.merchantA.api_key, fx.withdrawalConfigA.api_key);

    // Pay-In key sent to the Pay-Out endpoint is rejected.
    const payoutWithPayinKey = await fetch(`${BASE}/api/withdrawal/transactions/status?transactionId=x`, {
      headers: { "api-key": fx.merchantA.api_key },
    });
    assert.equal(payoutWithPayinKey.status, 401);

    // Pay-Out key sent to the Pay-In endpoint is rejected.
    const payinWithPayoutKey = await fetch(`${BASE}/api/payin/status/1`, {
      headers: { "x-api-key": fx.withdrawalConfigA.api_key },
    });
    assert.equal(payinWithPayoutKey.status, 401);
  });

  // ── Admin: credential masking / auth / regeneration ─────────────────────
  test("credential masking: list and detail never return a full key or secret", async () => {
    const list = await fetch(`${BASE}/api/admin/merchant-integrations`, { headers: adminHeaders() });
    const listBody = await list.json();
    assert.equal(list.status, 200);
    const row = listBody.find((m) => m.merchant_id === fx.merchantA.id);
    assert.ok(row, "merchant A should appear in the list");
    assert.notEqual(row.payin_key_masked, fx.merchantA.api_key);
    assert.match(row.payin_key_masked, /••••••••/);

    const detail = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, { headers: adminHeaders() });
    const detailBody = await detail.json();
    assert.equal(detail.status, 200);
    assert.notEqual(detailBody.payin_key_masked, fx.merchantA.api_key);
    assert.equal(JSON.stringify(detailBody).includes(fx.merchantA.api_key), false, "full key must never appear anywhere in the detail response");
  });

  test("unauthorized roles cannot reveal or regenerate credentials", async () => {
    // A real, validly-signed JWT for a non-admin role — proves the role
    // check itself (not just "no credentials"), now that role/userid are
    // only ever sourced from a verified token.
    const asAgent = { Authorization: `Bearer ${agentJwtFor(agentAId)}` };
    const reveal = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/reveal`, {
      method: "POST",
      headers: { ...asAgent, "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key" }),
    });
    assert.equal(reveal.status, 403);

    const noAuth = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key" }),
    });
    assert.equal(noAuth.status, 403);
  });

  // ── SECURITY: header-trust authentication bypass (fixed) ────────────────
  // Regression coverage for the fix to getAuthUser() in server.js: unsigned
  // role/userid/agentid/merchantid request headers must never be trusted as
  // identity when no valid JWT is present. Before the fix, every one of these
  // forged requests succeeded with real admin/super-admin privileges.
  test("SECURITY: forged role/userid headers with no JWT are rejected on every sensitive merchant-integration route", async () => {
    const forged = { role: "super-admin", userid: String(adminId) };

    const list = await fetch(`${BASE}/api/admin/merchant-integrations`, { headers: forged });
    assert.equal(list.status, 403);

    const detail = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, { headers: forged });
    assert.equal(detail.status, 403);

    const reveal = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/reveal`, {
      method: "POST",
      headers: { ...forged, "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key" }),
    });
    assert.equal(reveal.status, 403);
    const revealBody = await reveal.json();
    assert.notEqual(revealBody.value, fx.merchantA.api_key, "forged headers must never return the real credential");

    const regen = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/regenerate`, {
      method: "POST",
      headers: { ...forged, "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key", confirm: true }),
    });
    assert.equal(regen.status, 403);

    const put = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, {
      method: "PUT",
      headers: { ...forged, "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: false }),
    });
    assert.equal(put.status, 403);

    // The forged-header attempts above must not have actually rotated the key.
    const stillWorks = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10 }),
    });
    const stillWorksBody = await stillWorks.json();
    assert.equal(stillWorks.status, 200);
    fixtures.transactionIds.push(stillWorksBody.transaction_id);
  });

  test("SECURITY: an invalid/malformed JWT does not fall back to trusting accompanying headers", async () => {
    const r = await fetch(`${BASE}/api/admin/merchant-integrations`, {
      headers: { Authorization: "Bearer not-a-real-jwt.at.all", role: "admin", userid: String(adminId) },
    });
    assert.equal(r.status, 403);
  });

  test("SECURITY: a valid JWT for one role cannot be paired with forged headers to escalate", async () => {
    // Valid agent JWT + forged admin headers riding along — role must come
    // from the verified token only, headers must be fully ignored once a
    // Bearer token is present.
    const r = await fetch(`${BASE}/api/admin/merchant-integrations`, {
      headers: { Authorization: `Bearer ${agentJwtFor(agentAId)}`, role: "admin", userid: String(adminId) },
    });
    assert.equal(r.status, 403);
  });

  test("valid admin JWT: works end-to-end for every merchant-integration admin route", async () => {
    const list = await fetch(`${BASE}/api/admin/merchant-integrations`, { headers: adminHeaders() });
    assert.equal(list.status, 200);

    const detail = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, { headers: adminHeaders() });
    assert.equal(detail.status, 200);
  });

  test("reveal returns the true full value for an authorized admin", async () => {
    const r = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/reveal`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key" }),
    });
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.equal(body.value, fx.merchantA.api_key);
  });

  test("regenerate requires confirm:true and then rotates the real merchants.api_key", async () => {
    const noConfirm = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/regenerate`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key" }),
    });
    assert.equal(noConfirm.status, 400);

    const regen = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/regenerate`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "payin_key", confirm: true }),
    });
    const regenBody = await regen.json();
    assert.equal(regen.status, 200);
    assert.notEqual(regenBody.value, fx.merchantA.api_key);

    // Old key now rejected; new key works.
    const oldKeyCheck = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10 }),
    });
    assert.equal(oldKeyCheck.status, 401);

    const newKeyCheck = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": regenBody.value, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10 }),
    });
    const newKeyBody = await newKeyCheck.json();
    assert.equal(newKeyCheck.status, 200);
    fixtures.transactionIds.push(newKeyBody.transaction_id);
    fx.merchantA.api_key = regenBody.value; // keep fixture in sync for later tests

    // Audit timestamp recorded.
    const detail = await (await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, { headers: adminHeaders() })).json();
    assert.ok(detail.payin_key_regenerated_at);
  });

  test("enable/disable the integration gates Pay-In auth for that merchant only", async () => {
    // Enable a webhook secret + explicit config row via PUT, then disable it.
    await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, {
      method: "PUT",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: false }),
    });

    const blocked = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantA.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10 }),
    });
    const blockedBody = await blocked.json();
    assert.equal(blocked.status, 403);
    assert.equal(blockedBody.message, "Merchant integration is disabled");

    // Other merchants (no config row at all) are completely unaffected.
    const unaffected = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantB.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 10 }),
    });
    const unaffectedBody = await unaffected.json();
    assert.equal(unaffected.status, 200);
    fixtures.transactionIds.push(unaffectedBody.transaction_id);

    // Re-enable for the remaining tests.
    await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}`, {
      method: "PUT",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ is_enabled: true }),
    });
  });

  // ── Webhook signing + delivery + retry ──────────────────────────────────
  test("signed Pay-In webhook: valid HMAC-SHA256 signature over the exact raw body, stable delivery id, correct event/status", async () => {
    const secretRes = await fetch(`${BASE}/api/admin/merchant-integrations/${fx.merchantA.id}/regenerate`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "webhook_secret", confirm: true }),
    });
    const { value: secret } = await secretRes.json();

    const insert = await pool.query(
      `INSERT INTO transactions (transaction_id, merchant_order_id, amount, status, merchant_id, agent_id, webhook_url, checkout_mode, created_by_admin_id)
       VALUES ($1,$2,100,'Approved',$3,$4,$5,true,$6) RETURNING *`,
      [`test-ref-${jitter()}`, `ORD-${jitter()}`, fx.merchantA.id, agentAId, `${RECEIVER_BASE}/ok`, adminId],
    );
    const txn = insert.rows[0];
    fixtures.transactionIds.push(txn.id);

    const before = received.length;
    const trig = await fetch(`${BASE}/api/transactions/${txn.id}/trigger-webhook`, { method: "POST", headers: adminHeaders() });
    assert.equal(trig.status, 200);

    await new Promise((r) => setTimeout(r, 500));
    const delivery = received.slice(before).find((r) => r.path === "/ok");
    assert.ok(delivery, "receiver should have gotten the webhook");

    const expectedSig = crypto.createHmac("sha256", secret).update(delivery.rawBody).digest("hex");
    assert.equal(delivery.headers["x-masterpay-signature"], expectedSig);
    assert.equal(delivery.headers["x-masterpay-event"], "payin.approved");
    assert.ok(delivery.headers["x-masterpay-delivery-id"]);

    const payload = JSON.parse(delivery.rawBody);
    assert.equal(payload.event, "payin.approved");
    assert.equal(payload.status, "Approved");
    assert.equal(payload.transaction_ref, txn.transaction_id);

    const row = (await pool.query(`SELECT * FROM transactions WHERE id = $1`, [txn.id])).rows[0];
    assert.equal(row.webhook_sent, true);
    assert.ok(row.webhook_delivered_at);
    assert.equal(row.webhook_attempts, 1);
    assert.equal(row.webhook_delivery_id, delivery.headers["x-masterpay-delivery-id"], "the persisted audit row must record the exact delivery id that was sent");
    assert.ok(row.webhook_response, "the response status/body must be retained for audit");
  });

  test("non-2xx webhook response is treated as failure and schedules a retry (not marked delivered)", async () => {
    receiverStatus.set("/fail", 500);
    const insert = await pool.query(
      `INSERT INTO transactions (transaction_id, merchant_order_id, amount, status, merchant_id, agent_id, webhook_url, checkout_mode, created_by_admin_id)
       VALUES ($1,$2,100,'Approved',$3,$4,$5,true,$6) RETURNING *`,
      [`test-ref-${jitter()}`, `ORD-${jitter()}`, fx.merchantA.id, agentAId, `${RECEIVER_BASE}/fail`, adminId],
    );
    const txn = insert.rows[0];
    fixtures.transactionIds.push(txn.id);

    await fetch(`${BASE}/api/transactions/${txn.id}/trigger-webhook`, { method: "POST", headers: adminHeaders() });
    await new Promise((r) => setTimeout(r, 500));

    const row = (await pool.query(`SELECT * FROM transactions WHERE id = $1`, [txn.id])).rows[0];
    assert.equal(row.webhook_sent, false);
    assert.equal(row.webhook_delivered_at, null);
    assert.equal(row.webhook_attempts, 1);
    assert.ok(row.webhook_next_retry_at, "a retry must be scheduled");
    assert.ok(row.webhook_last_error);
    assert.ok(row.webhook_delivery_id, "a stable delivery id must be recorded even on failure, for audit and future retry matching");
    assert.ok(row.webhook_response, "the failing response status/body must be retained for audit, not discarded");
    assert.ok(row.webhook_last_attempt_at, "the attempt timestamp must be recorded");

    // The real backoff after attempt 1 is a full minute (by design — see
    // webhookSecurity.computeBackoffSeconds) — not something a test should
    // wait out. Fast-forward the clock the same way a minute of real time
    // would: flip webhook_next_retry_at to "due now" and let the sweep
    // (interval 1.5s in this test run) pick it back up on its next tick,
    // resending with the SAME delivery id — proves both "non-2xx retries"
    // and "stable delivery id across attempts" in one pass.
    const firstDeliveryId = (received.find((r) => r.path === "/fail"))?.headers["x-masterpay-delivery-id"];
    await pool.query(`UPDATE transactions SET webhook_next_retry_at = NOW() WHERE id = $1`, [txn.id]);
    await new Promise((r) => setTimeout(r, 2200));
    const retries = received.filter((r) => r.path === "/fail");
    assert.ok(retries.length >= 2, "expected at least one retry attempt");
    assert.equal(retries[1].headers["x-masterpay-delivery-id"], firstDeliveryId);

    const rowAfter = (await pool.query(`SELECT * FROM transactions WHERE id = $1`, [txn.id])).rows[0];
    assert.ok(rowAfter.webhook_attempts >= 2);
  });

  test("a client-side timeout is treated as failure and schedules a retry", async () => {
    hangingPaths.add("/timeout");
    const insert = await pool.query(
      `INSERT INTO transactions (transaction_id, merchant_order_id, amount, status, merchant_id, agent_id, webhook_url, checkout_mode, created_by_admin_id)
       VALUES ($1,$2,100,'Approved',$3,$4,$5,true,$6) RETURNING *`,
      [`test-ref-${jitter()}`, `ORD-${jitter()}`, fx.merchantA.id, agentAId, `${RECEIVER_BASE}/timeout`, adminId],
    );
    const txn = insert.rows[0];
    fixtures.transactionIds.push(txn.id);

    await fetch(`${BASE}/api/transactions/${txn.id}/trigger-webhook`, { method: "POST", headers: adminHeaders() });
    // WEBHOOK_TIMEOUT_MS=1200 in this test run — wait past it.
    await new Promise((r) => setTimeout(r, 1800));

    const row = (await pool.query(`SELECT * FROM transactions WHERE id = $1`, [txn.id])).rows[0];
    assert.equal(row.webhook_sent, false);
    assert.equal(row.webhook_delivered_at, null);
    assert.match(row.webhook_last_error, /error:/);
    assert.ok(row.webhook_next_retry_at);
    hangingPaths.delete("/timeout");
  });

  test("signed Pay-Out webhook: delivered via the retry sweep with the Pay-Out-specific payload shape", async () => {
    const secretRow = await pool.query(`SELECT webhook_signing_secret FROM merchant_integration_configs WHERE merchant_id = $1`, [fx.merchantA.id]);
    const secret = secretRow.rows[0].webhook_signing_secret;

    const insert = await pool.query(
      `INSERT INTO withdrawal_transactions (transaction_id, merchant_id, agent_id, amount, transaction_type, status, utr_number, webhook_url, webhook_delivered_at, webhook_next_retry_at, webhook_attempts)
       VALUES ($1,$2,$3,250,'upi','cleared','UTR12345',$4, NULL, NOW(), 0) RETURNING *`,
      [`test-wtxn-${jitter()}`, fx.merchantA.id, agentAId, `${RECEIVER_BASE}/payout-ok`],
    );
    const wtxn = insert.rows[0];
    fixtures.withdrawalTxnIds.push(wtxn.id);

    await new Promise((r) => setTimeout(r, 2200)); // let the sweep tick

    const delivery = received.find((r) => r.path === "/payout-ok");
    assert.ok(delivery, "withdrawal webhook should have been delivered by the retry sweep");
    const expectedSig = crypto.createHmac("sha256", secret).update(delivery.rawBody).digest("hex");
    assert.equal(delivery.headers["x-masterpay-signature"], expectedSig);

    const payload = JSON.parse(delivery.rawBody);
    // Exact Pay-Out shape — NOT the Pay-In formatter.
    assert.deepEqual(Object.keys(payload).sort(), ["amount", "status", "transactionId", "utr_number"].sort());
    assert.equal(payload.transactionId, wtxn.transaction_id);
    assert.equal(payload.status, "cleared");
    assert.equal(payload.amount, 250);
    assert.equal(payload.utr_number, "UTR12345");
  });

  test("duplicate worker protection: FOR UPDATE SKIP LOCKED prevents two concurrent claimants from getting the same due row", async () => {
    const insert = await pool.query(
      `INSERT INTO withdrawal_transactions (transaction_id, merchant_id, agent_id, amount, transaction_type, status, webhook_url, webhook_delivered_at, webhook_next_retry_at, webhook_attempts)
       VALUES ($1,$2,$3,10,'upi','cleared',$4, NULL, NOW(), 0) RETURNING id`,
      [`test-wtxn-lock-${jitter()}`, fx.merchantA.id, agentAId, `${RECEIVER_BASE}/never-called`],
    );
    const rowId = insert.rows[0].id;
    fixtures.withdrawalTxnIds.push(rowId);

    // Same claim shape the real sweep uses (SELECT ... FOR UPDATE SKIP LOCKED),
    // run from two separate connections at once against the same due row.
    const claim = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await client.query(
          `SELECT id FROM withdrawal_transactions WHERE id = $1 AND webhook_delivered_at IS NULL FOR UPDATE SKIP LOCKED`,
          [rowId],
        );
        await new Promise((res) => setTimeout(res, 300)); // hold the lock briefly, like a real in-flight attempt
        await client.query("COMMIT");
        return r.rows.length;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    };

    const [a, b] = await Promise.all([claim(), claim()]);
    assert.equal(a + b, 1, "exactly one of the two concurrent claimants should get the row");
  });

  test("existing (non-integrated) merchant's checkout/status/webhook behaviour is unchanged: no signature headers, identical envelope", async () => {
    // merchantB never had a merchant_integration_configs row created for it.
    const createRes = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantB.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 75 }),
    });
    const created = await createRes.json();
    assert.equal(createRes.status, 200);
    assert.deepEqual(
      Object.keys(created).sort(),
      ["amount", "checkout_url", "expires_at", "expires_in_seconds", "merchant_order_id", "status", "success", "transaction_id", "transaction_ref"].sort(),
    );
    fixtures.transactionIds.push(created.transaction_id);

    await pool.query(`UPDATE transactions SET webhook_url = $1, status = 'Approved' WHERE id = $2`, [`${RECEIVER_BASE}/unsigned`, created.transaction_id]);
    const before = received.length;
    await fetch(`${BASE}/api/transactions/${created.transaction_id}/trigger-webhook`, { method: "POST", headers: adminHeaders() });
    await new Promise((r) => setTimeout(r, 400));

    const delivery = received.slice(before).find((r) => r.path === "/unsigned");
    assert.ok(delivery);
    assert.equal(delivery.headers["x-masterpay-signature"], undefined);
    assert.equal(delivery.headers["x-masterpay-event"], undefined);
    assert.equal(delivery.headers["x-masterpay-delivery-id"], undefined);
    assert.equal(delivery.headers["content-type"], "application/json");
  });

  test("existing hosted checkout page endpoint still works", async () => {
    const createRes = await fetch(`${BASE}/api/payin/checkout/create`, {
      method: "POST",
      headers: { "x-api-key": fx.merchantB.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_order_id: `ORD-${jitter()}`, amount: 20 }),
    });
    const created = await createRes.json();
    fixtures.transactionIds.push(created.transaction_id);

    const page = await fetch(`${BASE}/api/checkout/${created.transaction_ref}`);
    const pageBody = await page.json();
    assert.equal(page.status, 200);
    assert.equal(pageBody.success, true);
    assert.equal(pageBody.transaction_ref, created.transaction_ref);
    assert.ok(pageBody.bank_details);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY — ALLOW_DEV_HEADER_AUTH flag semantics
//
// The main suite above never sets ALLOW_DEV_HEADER_AUTH, proving the default
// (unset/false) rejects forged headers. These three tests spin up dedicated,
// short-lived server instances (separate ports) to independently prove the
// flag's full contract: off by default, opt-in outside production, and
// hard-blocked in production regardless of the flag value.
// ═══════════════════════════════════════════════════════════════════════════
describe("SECURITY: ALLOW_DEV_HEADER_AUTH dev-only flag", { concurrency: false }, () => {
  async function waitReady(url, tries = 80, delayMs = 250) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url);
        if (r.ok || r.status === 404) return true;
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(`Server at ${url} did not become ready in time`);
  }

  async function spawnServerWith(port, envOverrides) {
    const proc = spawn(process.execPath, ["server.js"], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        DISABLE_BACKGROUND_JOBS: "true",
        MERCHANT_INTEGRATION_CONFIG_ENABLED: "true",
        ...envOverrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout.on("data", () => {});
    proc.stderr.on("data", () => {});
    await waitReady(`http://127.0.0.1:${port}/`);
    return proc;
  }

  const forgedHeaders = () => ({ role: "super-admin", userid: "1" });

  test("flag unset (default) outside production: forged headers still rejected", async () => {
    const port = 48770;
    const proc = await spawnServerWith(port, { NODE_ENV: "development" });
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/merchant-integrations`, { headers: forgedHeaders() });
      assert.equal(r.status, 403);
    } finally {
      proc.kill();
    }
  });

  test("flag explicitly true outside production: header fallback is trusted (opt-in local/test convenience only)", async () => {
    const port = 48771;
    const proc = await spawnServerWith(port, { NODE_ENV: "development", ALLOW_DEV_HEADER_AUTH: "true" });
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/merchant-integrations`, { headers: forgedHeaders() });
      assert.equal(r.status, 200);
    } finally {
      proc.kill();
    }
  });

  test("flag explicitly true in production: still hard-blocked — NODE_ENV=production always wins", async () => {
    const port = 48772;
    const proc = await spawnServerWith(port, { NODE_ENV: "production", ALLOW_DEV_HEADER_AUTH: "true" });
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/merchant-integrations`, { headers: forgedHeaders() });
      assert.equal(r.status, 403);
    } finally {
      proc.kill();
    }
  });
});
