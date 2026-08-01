const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const dns = require("dns");

const pool = require("./db");

require("dotenv").config();

const { ssEnabled, ensureParty, postEntry, ssRequest } = require("./ssAccounting");
const { sendMailWithRetry } = require("./mailer");

const app = express();

app.use(cors());
// Capture raw body string alongside the parsed JSON so we can verify HMAC
// signatures (SSPay webhooks) against the original bytes the sender signed.
app.use(express.json({
  verify: (req, res, buf) => {
    if (buf && buf.length) req.rawBody = buf.toString("utf8");
  },
}));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Sandbox detection ──────────────────────────────────────────────────────────
const sandboxMw = require("./sandbox");

// Tag a request as "sandbox" when it arrives via the sandbox subdomain OR when the
// caller explicitly opts in with the  x-rdpay-sandbox: 1  header (local dev / CI).
app.use((req, res, next) => {
  req.isSandbox =
    (typeof req.hostname === "string" && req.hostname.startsWith("sandbox.")) ||
    req.headers["x-rdpay-sandbox"] === "1";
  next();
});

// Also treat checkout page requests for sandbox transaction refs as sandbox.
// The hosted checkout page never sets x-rdpay-sandbox, so we detect by ref lookup.
app.use("/api/checkout/:ref", (req, res, next) => {
  if (!req.isSandbox && sandboxMw.hasSandboxRef(req.params.ref)) req.isSandbox = true;
  next();
});

// Intercept all /api/* requests that belong to the sandbox environment.
// Production requests are untouched — the module calls next() immediately when
// req.isSandbox is false.
app.use("/api", sandboxMw);

const PORT = process.env.PORT || 5000;

const multer = require("multer");
const XLSX = require("xlsx");

const upload = multer({
  storage: multer.memoryStorage(),
});

// Disk-storage uploader for settlement proof files (image / PDF) served via /uploads.
const fs = require("fs");
const UPLOADS_DIR = path.join(__dirname, "uploads");
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.log("uploads dir error:", e.message);
}
const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `settlement-proof-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Only image or PDF files are allowed"));
  },
});
// Wrap so multer errors return JSON instead of crashing the request.
const uploadSettlementProof = (req, res, next) =>
  proofUpload.single("proof")(req, res, (err) => {
    if (err)
      return res.status(400).json({ message: err.message || "Upload failed" });
    next();
  });

// Disk-storage uploader for agent top-up proofs. Unlike settlement proofs,
// these back an irreversible manual credit of real money, so they're kept
// OUTSIDE the publicly-served /uploads tree and served only via an
// authenticated route (see GET /api/agent-topups/:id/proof).
const TOPUP_PROOFS_DIR = path.join(__dirname, "uploads_private", "topup-proofs");
try {
  fs.mkdirSync(TOPUP_PROOFS_DIR, { recursive: true });
} catch (e) {
  console.log("topup proofs dir error:", e.message);
}
const topupProofUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TOPUP_PROOFS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `topup-proof-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Only image or PDF files are allowed"));
  },
});
// Proof is required for a top-up (unlike the optional settlement proof) since
// it's the evidence backing the approval decision.
const uploadTopupProof = (req, res, next) =>
  topupProofUpload.single("proof")(req, res, (err) => {
    if (err)
      return res.status(400).json({ message: err.message || "Upload failed" });
    if (!req.file)
      return res.status(400).json({ message: "Proof file is required" });
    next();
  });

// Disk-storage uploader for the company's USDT deposit QR code. Public
// (unauthenticated), unlike proof uploads — a QR is meant to be freely
// scannable by any agent paying, not sensitive evidence. Image only (no
// PDF) since it's specifically a scannable code, not a document.
const COMPANY_QR_DIR = path.join(UPLOADS_DIR, "company-qr");
try {
  fs.mkdirSync(COMPANY_QR_DIR, { recursive: true });
} catch (e) {
  console.log("company qr dir error:", e.message);
}
const companyQrUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, COMPANY_QR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `qr-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Only JPG, PNG, or WEBP images are allowed for the QR code"));
  },
});
const uploadCompanyQr = (req, res, next) =>
  companyQrUpload.single("usdt_qr")(req, res, (err) => {
    if (err)
      return res.status(400).json({ message: err.message || "QR upload failed" });
    next();
  });

function getAuthUser(req) {
  try {
    let auth = {
      role: req.headers.role || null,
      userId: req.headers.userid || null,
      agentId: req.headers.agentid || null,
      merchantId: req.headers.merchantid || null,
    };

    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      auth = jwt.verify(token, process.env.JWT_SECRET);
    }

    const viewRole = req.headers.viewrole;
    const viewId = req.headers.viewid;

    // Only Admin can view-as another role now (Agent no longer has a
    // child role to view as — Agent was folded directly into Agent).
    if (viewRole && viewId && auth.role === "admin") {
      return {
        ...auth,
        originalRole: auth.role,
        originalUserId: auth.userId,

        role: viewRole,
        userId: Number(viewId),

        merchantId: viewRole === "merchant" ? Number(viewId) : auth.merchantId,

        agentId: viewRole === "agent" ? Number(viewId) : auth.agentId,
      };
    }

    return auth;
  } catch {
    return {
      role: null,
      userId: null,
    };
  }
}

function getAdminOwnerId(auth) {
  return auth?.role === "admin" ? Number(auth.userId) : null;
}

// Returns client_id for data isolation. Super-admin sees all (null = no filter).
function getClientId(auth) {
  if (!auth) return null;
  if (auth.role === "super-admin") return null;  // platform owner sees everything
  return auth.clientId || null;
}

// ── Platform maintenance mode ─────────────────────────────────────────────────
// Reads the singleton platform_maintenance row (id=1, always exists — seeded
// in initializeDatabase()). Blocks (a) new non-super-admin logins and (b) new
// Pay-In session creation with a 503, while leaving existing sessions,
// in-flight checkout sessions, and sandbox/test-mode traffic untouched.
async function getMaintenanceStatus() {
  const result = await pool.query(
    `SELECT is_enabled, message FROM platform_maintenance WHERE id = 1`,
  );
  return result.rows[0] || { is_enabled: false, message: null };
}

async function checkMaintenanceBlocksPayins() {
  const status = await getMaintenanceStatus();
  if (!status.is_enabled) return { blocked: false };
  return {
    blocked: true,
    message: status.message || "Platform is under maintenance. Please try again shortly.",
  };
}

async function getOwnerFromAgent(agentId) {
  if (!agentId) return null;
  const r = await pool.query(
    "SELECT created_by_admin_id FROM agents WHERE id=$1",
    [agentId],
  );
  return r.rows[0]?.created_by_admin_id || null;
}

async function getOwnerFromMerchant(merchantId) {
  if (!merchantId) return null;
  const r = await pool.query(
    "SELECT created_by_admin_id FROM merchants WHERE id=$1",
    [merchantId],
  );
  return r.rows[0]?.created_by_admin_id || null;
}

// Guarantees an agent has a wallet row (seeded at 0) regardless of which path
// created them (admin create, or public self-signup) — both insert into the
// same `agents` table and must converge on the same wallet behavior. Safe to
// call multiple times.
async function ensureAgentWallet(agentId) {
  await pool.query(
    `INSERT INTO agent_wallets (agent_id, available_balance) VALUES ($1, 0)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId],
  );
}

// Resolves an agent's per-tenant company deposit-details config. client_id
// is the primary key; falls back to created_by_admin_id for legacy tenants
// where client_id is NULL (mirrors getClientId()'s dual-key convention).
async function findCompanyWalletConfig({ clientId, adminId }) {
  if (clientId) {
    const r = await pool.query(
      `SELECT * FROM company_wallet_configs WHERE client_id = $1 AND is_active = true LIMIT 1`,
      [clientId],
    );
    return r.rows[0] || null;
  }
  if (adminId) {
    const r = await pool.query(
      `SELECT * FROM company_wallet_configs WHERE created_by_admin_id = $1 AND client_id IS NULL AND is_active = true LIMIT 1`,
      [adminId],
    );
    return r.rows[0] || null;
  }
  return null;
}

// Controls whether wallet ledger tracking (debit on Pay-In, refund on
// expiry/failure, re-debit on dispute approval) runs at all. The wallet is
// informational/accounting only — Settlement Remaining / Settlement Amount —
// and NEVER gates or blocks Pay-In creation or routing; account eligibility
// is decided solely by findCandidateAgentAccount()'s existing
// max_payment_limit/is_active/min_transaction_amount rules. This flag exists
// only as an emergency kill switch to stop ledger writes (e.g. if the ledger
// table itself is misbehaving) without touching Pay-In routing at all.
function isWalletGateEnabled() {
  return process.env.WALLET_GATE_ENABLED !== "false";
}

// ── Agent wallet mutation helpers ──────────────────────────────────────────
// All four take an already-connected `client` mid-transaction and lock the
// wallet row with FOR UPDATE before reading/writing balance — the only correct
// way to prevent concurrent overspend. Callers that aren't already inside a
// transaction for another reason should use withWalletTransaction() below.

async function withWalletTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Debits on Pay-In creation. Purely a bookkeeping entry — Settlement
// Remaining is allowed to go negative (see the dropped non-negative CHECK
// constraint in initializeDatabase()) so this can never fail and can never
// cause the caller to roll back Pay-In creation. Missing wallet row (should
// not happen given ensureAgentWallet, but defensive) is a no-op success.
async function debitAgentWalletForPayin(client, { agentId, amount, transactionId }) {
  const walletResult = await client.query(
    `SELECT * FROM agent_wallets WHERE agent_id = $1 FOR UPDATE`,
    [agentId],
  );
  const wallet = walletResult.rows[0];
  if (!wallet) return { ok: true, skipped: true };
  const newBalance = Number(wallet.available_balance) - Number(amount);
  await client.query(
    `UPDATE agent_wallets SET available_balance = $1, updated_at = NOW() WHERE id = $2`,
    [newBalance, wallet.id],
  );
  await client.query(
    `INSERT INTO agent_wallet_ledger
      (agent_id, entry_type, amount, balance_after, reference_type, reference_id, created_by_role, created_by_id)
     VALUES ($1,'PAYIN_DEBIT',$2,$3,'transaction',$4,'system',NULL)`,
    [agentId, -Number(amount), newBalance, transactionId],
  );
  return { ok: true, newBalance };
}

// Credits back on Expired / Failed / stale-sweep-Rejected. Silently no-ops if
// the agent has no wallet row (shouldn't happen given ensureAgentWallet,
// but must not throw and abort an expiry sweep over it).
async function refundAgentWalletForPayin(client, { agentId, amount, transactionId, notes }) {
  if (!agentId || !(Number(amount) > 0)) return { ok: true };
  // Only refund if this transaction was actually debited in the first place —
  // gated on ledger history, not the CURRENT isWalletGateEnabled() value.
  // Without this, a transaction created while WALLET_GATE_ENABLED=false (no
  // debit at all) that later expires/fails after the gate is switched back on
  // would get an incorrect PAYIN_REFUND crediting money that was never taken.
  const debitCheck = await client.query(
    `SELECT 1 FROM agent_wallet_ledger
     WHERE reference_type = 'transaction' AND reference_id = $1 AND entry_type = 'PAYIN_DEBIT' LIMIT 1`,
    [transactionId],
  );
  if (debitCheck.rows.length === 0) return { ok: true, skipped: true };

  const walletResult = await client.query(
    `SELECT * FROM agent_wallets WHERE agent_id = $1 FOR UPDATE`,
    [agentId],
  );
  const wallet = walletResult.rows[0];
  if (!wallet) return { ok: true };
  const newBalance = Number(wallet.available_balance) + Number(amount);
  await client.query(
    `UPDATE agent_wallets SET available_balance = $1, updated_at = NOW() WHERE id = $2`,
    [newBalance, wallet.id],
  );
  await client.query(
    `INSERT INTO agent_wallet_ledger
      (agent_id, entry_type, amount, balance_after, reference_type, reference_id, created_by_role, created_by_id, notes)
     VALUES ($1,'PAYIN_REFUND',$2,$3,'transaction',$4,'system',NULL,$5)`,
    [agentId, Number(amount), newBalance, transactionId, notes || null],
  );
  return { ok: true };
}

// Re-debits when a Disputed transaction is resolved as Approved. Purely a
// bookkeeping entry, like debitAgentWalletForPayin above — never blocks
// the dispute-approval transaction, and Settlement Remaining is allowed to
// go negative rather than failing this re-debit.
async function redebitAgentWalletForPayin(client, { agentId, amount, transactionId }) {
  if (!agentId || !(Number(amount) > 0)) return { ok: true };
  // Mirror of the guard in refundAgentWalletForPayin: only re-debit if this
  // transaction was actually refunded in the first place (a Disputed
  // transaction normally reached Failed → refunded before being disputed —
  // but if the original debit never happened because the gate was off at
  // creation, refundAgentWalletForPayin would have skipped, and this
  // re-debit must skip too rather than debiting money that was never given).
  const refundCheck = await client.query(
    `SELECT 1 FROM agent_wallet_ledger
     WHERE reference_type = 'transaction' AND reference_id = $1 AND entry_type = 'PAYIN_REFUND' LIMIT 1`,
    [transactionId],
  );
  if (refundCheck.rows.length === 0) return { ok: true, skipped: true };

  const walletResult = await client.query(
    `SELECT * FROM agent_wallets WHERE agent_id = $1 FOR UPDATE`,
    [agentId],
  );
  const wallet = walletResult.rows[0];
  if (!wallet) return { ok: true, skipped: true };
  const newBalance = Number(wallet.available_balance) - Number(amount);
  await client.query(
    `UPDATE agent_wallets SET available_balance = $1, updated_at = NOW() WHERE id = $2`,
    [newBalance, wallet.id],
  );
  await client.query(
    `INSERT INTO agent_wallet_ledger
      (agent_id, entry_type, amount, balance_after, reference_type, reference_id, created_by_role, created_by_id)
     VALUES ($1,'PAYIN_REDEBIT',$2,$3,'transaction',$4,'system',NULL)`,
    [agentId, -Number(amount), newBalance, transactionId],
  );
  return { ok: true };
}

// Shared Pay-In account-selection query used by /api/payins,
// /api/payin/checkout/create and /api/payin/create. Account eligibility is
// governed solely by these existing, pre-wallet-feature rules: account/agent
// active status, min_transaction_amount, the account's daily max_payment_limit
// (via the live committed_today sum below) and the agent-level cap. The
// Agent wallet (Settlement Remaining/Amount) is informational/accounting
// only and deliberately has no join or filter here — it must never affect
// which account is eligible or block Pay-In creation.
// requireAgentRestriction=true mirrors the checkout route's mandatory
// merchant->agent scoping; false mirrors the optional scoping in the legacy
// /api/payins route.
async function findCandidateAgentAccount(dbClient, { amount, merchantId, requireAgentRestriction }) {
  const merchantClause = requireAgentRestriction
    ? `oa.agent_id IN (
         SELECT agent_id FROM merchant_agents WHERE merchant_id = $2
         UNION
         SELECT agent_id FROM merchants WHERE id = $2 AND agent_id IS NOT NULL
       )`
    : `($2::INTEGER IS NULL OR oa.agent_id IN (
         SELECT agent_id FROM merchant_agents WHERE merchant_id = $2
         UNION
         SELECT agent_id FROM merchants WHERE id = $2 AND agent_id IS NOT NULL
       ))`;

  const result = await dbClient.query(
    `SELECT oa.*, ag.created_by_admin_id AS agent_owner_id
     FROM agent_accounts oa
     LEFT JOIN agents ag ON ag.id = oa.agent_id
     LEFT JOIN (
       SELECT account_id, COALESCE(SUM(amount),0) AS committed_today
       FROM transactions
       WHERE account_id IS NOT NULL
         AND status IN ('Approved','Success','Pending','UTR Submitted')
         AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
             = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
       GROUP BY account_id
     ) t ON t.account_id = oa.id
     LEFT JOIN (
       SELECT agent_id, COALESCE(SUM(amount),0) AS agent_committed
       FROM transactions
       WHERE agent_id IS NOT NULL
         AND status IN ('Approved','Success','Pending','UTR Submitted')
       GROUP BY agent_id
     ) ap ON ap.agent_id = oa.agent_id
     LEFT JOIN (
       SELECT agent_id, COALESCE(SUM(amount),0) AS agent_settled
       FROM settlement_transactions
       WHERE agent_id IS NOT NULL AND transaction_status = 'Approved'
       GROUP BY agent_id
     ) asl ON asl.agent_id = oa.agent_id
     WHERE oa.is_active = true AND ag.is_active = true
       AND oa.min_transaction_amount <= $1
       AND (COALESCE(t.committed_today, 0) + $1) <= COALESCE(oa.max_payment_limit, 0)
       AND (
         COALESCE(ag.max_payment_limit, 0) <= 0
         OR (COALESCE(ap.agent_committed, 0) - COALESCE(asl.agent_settled, 0) + $1) <= ag.max_payment_limit
       )
       AND ${merchantClause}
     ORDER BY RANDOM() LIMIT 1`,
    [amount, merchantId],
  );
  return result.rows[0] || null;
}

function cleanText(value) {
  return String(value || "").trim();
}

// ── UPI ID (VPA) validation ────────────────────────────────────────────────────
// Format per NPCI's VPA spec: <handle>@<psp-bank-code>, e.g. "merchant@okhdfcbank".
// No payment provider integrated in this codebase exposes a "does this VPA
// actually exist" lookup (the payout providers under resolvePayoutProvider —
// a24h/FirstPay/Survey — are P2M payout APIs tied to a specific merchant's own
// withdrawal flow, not a generic VPA-verification service), so this is
// deliberately format-only. isUpiFormatValid() is the single source of truth,
// used both to gate PUT /api/admin/company-wallet-config (authoritative — the
// save cannot be bypassed by skipping the frontend) and by the dedicated
// validate-upi endpoint (for the Admin's on-blur / "Validate" UX).
const UPI_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,49}@[a-zA-Z][a-zA-Z0-9.\-]{1,49}$/;

function isUpiFormatValid(upiId) {
  return UPI_ID_REGEX.test(cleanText(upiId));
}

// ── Email address validation (alert recipients) ─────────────────────────────
// Deliberately simple/pragmatic (not full RFC 5322) — matches the same
// "format-only, backend-authoritative" philosophy as isUpiFormatValid above.
// Mirrored in Frontend/src/utils/email.js — keep in sync.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailFormatValid(email) {
  return EMAIL_REGEX.test(cleanText(email));
}

const UPI_VERIFICATION_TYPE = "format_only"; // no VPA-existence provider configured — see comment above

// ── Tenant resolution ─────────────────────────────────────────────────────────
// Returns the client_id whose domain_name matches the incoming request host, or
// null when the host is the main platform domain (not registered as any client).
async function resolveClientIdFromHost(req) {
  const host = (
    req.headers["x-forwarded-host"] ||
    req.headers.host ||
    req.hostname ||
    ""
  ).replace(/:\d+$/, "").toLowerCase().trim();
  if (!host) return null;
  const r = await pool.query(
    `SELECT id FROM clients WHERE LOWER(domain_name) = $1 AND status = 'Active' LIMIT 1`,
    [host]
  );
  return r.rows[0]?.id ?? null;
}

// ── Tenant scope middleware ───────────────────────────────────────────────────
// Runs on every authenticated /api/* request (skips login, public, checkout and
// sandbox routes which have their own auth).  Validates that the JWT's clientId
// matches the domain the request came in on so a token issued for fastpay.local
// cannot be used against the main domain and vice-versa.
app.use("/api", async (req, res, next) => {
  // Routes that don't carry a session token — skip
  const skip = ["/login", "/public/", "/checkout/", "/sandbox/", "/payin/checkout/"];
  if (skip.some((p) => req.path === p || req.path.startsWith(p))) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return next(); // unauthenticated — route handles it

  let tokenPayload;
  try {
    tokenPayload = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    return next(); // malformed/expired token — route handler rejects it
  }

  // Super-admins are platform-level and not tied to any client domain
  if (tokenPayload.role === "super-admin") return next();

  const domainClientId = await resolveClientIdFromHost(req);
  const tokenClientId = tokenPayload.clientId ?? null;

  if (domainClientId === tokenClientId) return next();

  // Allow admins whose client domain is not yet Active to use the main platform domain
  if (domainClientId === null && tokenClientId !== null && tokenPayload.role === "admin") {
    const clientRow = await pool.query(
      `SELECT domain_name, domain_status FROM clients WHERE id = $1 LIMIT 1`,
      [tokenClientId]
    );
    if (clientRow.rows.length > 0) {
      const { domain_name, domain_status } = clientRow.rows[0];
      if (!domain_name || domain_status !== "Active") return next();
    }
  }

  return res.status(403).json({
    message: "Access denied: this account does not belong to this domain",
  });
});

// Amounts "match" when they are within less than ₹1 of each other. Agents often
// drop the paise when reading their bank statement (e.g. a merchant pays 1944.44
// but the agent submits proof for 1944). UTR is unique system-wide, so a fuzzy
// amount check here only ever loosens an already-UTR-pinned match — it can't create
// a false match between two different transactions.
function amountsMatch(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) < 1;
}

async function usernameExistsAnywhere(
  username,
  currentType = null,
  currentId = null,
  clientId = undefined,
) {
  const cleanUsername = cleanText(username);
  if (!cleanUsername) return false;

  const tables = [
    { type: "admin", table: "admins" },
    { type: "agent", table: "agents" },
    { type: "merchant", table: "merchants" },
  ];

  for (const item of tables) {
    const values = [cleanUsername];
    let query = `SELECT id FROM ${item.table} WHERE LOWER(username) = LOWER($1)`;

    // Scope uniqueness per tenant so different clients may reuse the same username
    if (clientId != null) {
      query += ` AND client_id = $${values.length + 1}`;
      values.push(clientId);
    } else {
      query += ` AND client_id IS NULL`;
    }

    if (currentType === item.type && currentId) {
      query += ` AND id <> $${values.length + 1}`;
      values.push(Number(currentId));
    }

    query += ` LIMIT 1`;
    const result = await pool.query(query, values);
    if (result.rows.length > 0) return true;
  }

  return false;
}

async function assertUniqueUsername(
  username,
  currentType = null,
  currentId = null,
  clientId = undefined,
) {
  if (!cleanText(username)) {
    const error = new Error("Username is required");
    error.statusCode = 400;
    throw error;
  }

  if (await usernameExistsAnywhere(username, currentType, currentId, clientId)) {
    const error = new Error(
      "Username already exists. Username must be unique across all admins, merchants, and agents.",
    );
    error.statusCode = 409;
    throw error;
  }
}

async function utrExistsAnywhere(
  utrNumber,
  currentTable = null,
  currentId = null,
) {
  const cleanUtr = cleanText(utrNumber);
  if (!cleanUtr) return false;

  const tables = [
    { table: "transactions", idColumn: "id" },
    { table: "settlement_transactions", idColumn: "id" },
  ];

  for (const item of tables) {
    const values = [cleanUtr];
    let query = `SELECT ${item.idColumn} FROM ${item.table} WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1)) AND COALESCE(TRIM(utr_number), '') <> ''`;

    // A UTR only "collides" if it's held by a LIVE transaction. Dead ones
    // (Failed/Rejected/Expired) and agent-verified bank proofs must NOT block a
    // correct resubmission — the proof is meant to be matched, and a failed order's
    // UTR is free to reuse. Without this, correcting a UTR shows "already submitted".
    if (item.table === "transactions") {
      query += ` AND status NOT IN ('Failed','Rejected','Expired','Agent Verified','Disputed')`;
    }

    if (currentTable === item.table && currentId) {
      query += ` AND ${item.idColumn} <> $2`;
      values.push(Number(currentId));
    }

    query += ` LIMIT 1`;
    const result = await pool.query(query, values);
    if (result.rows.length > 0) return true;
  }

  return false;
}

async function assertUniqueUtr(
  utrNumber,
  currentTable = null,
  currentId = null,
) {
  const cleanUtr = cleanText(utrNumber);
  if (!cleanUtr) return;

  if (await utrExistsAnywhere(cleanUtr, currentTable, currentId)) {
    const error = new Error("UTR number already exists. UTR cannot repeat.");
    error.statusCode = 409;
    throw error;
  }
}

function handleKnownValidationError(res, error) {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  return null;
}

// Helper: fire webhook asynchronously (fire-and-forget, never blocks response)
async function fireWebhook(pool, txn, eventName = "payin.approved") {
  if (!txn || !txn.webhook_url || !txn.webhook_url.trim()) return;

  const webhookUrl = txn.webhook_url.trim();
  const statusByEvent = {
    "payin.approved": "Approved",
    "payin.expired": "Expired",
    "payin.failed": "Failed",
    "payin.disputed": "Disputed",
  };
  const eventStatus = statusByEvent[eventName] || "Approved";
  const eventTime = txn.approved_or_reject_date || new Date().toISOString();
  const payload = {
    event: eventName,
    transaction_id: txn.id,
    transaction_ref: txn.transaction_id || null,
    merchant_order_id: txn.merchant_order_id || null,
    unique_id: txn.unique_id || null,
    amount: txn.amount,
    utr_number: txn.utr_number,
    disputed_utr: txn.disputed_utr || null,
    status: eventStatus,
    approved_at: eventName === "payin.approved" ? eventTime : null,
    expired_at: eventName === "payin.expired" ? eventTime : null,
    failed_at: eventName === "payin.failed" ? eventTime : null,
    disputed_at: eventName === "payin.disputed" ? eventTime : null,
    bank_name: txn.bank_name || null,
    account_number: txn.account_number || null,
    account_holder_name: txn.account_holder_name || null,
    ifsc_code: txn.ifsc_code || null,
    upi_id: txn.upi_id || null,
  };

  console.log(`[WEBHOOK] Firing for txn ${txn.id} → ${webhookUrl}`);
  console.log("[WEBHOOK] Payload:", payload);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseBody = await webhookRes.text();
    const logMsg = `status=${webhookRes.status} body=${responseBody.substring(0, 500)}`;

    console.log(`[WEBHOOK] Response for txn ${txn.id}: ${logMsg}`);

    await pool.query(
      `UPDATE transactions SET webhook_sent = true, webhook_response = $1 WHERE id = $2`,
      [logMsg, txn.id],
    );
  } catch (err) {
    const errMsg = `error: ${err.message}`;
    console.log(`[WEBHOOK] Failed for txn ${txn.id}: ${errMsg}`);
    await pool
      .query(
        `UPDATE transactions SET webhook_sent = false, webhook_response = $1 WHERE id = $2`,
        [errMsg, txn.id],
      )
      .catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPER ADMIN EMAIL ALERTS
// ═══════════════════════════════════════════════════════════════════════════
// Two event types: a new dispute raised anywhere (Pay-In via hosted checkout,
// Pay-In merchant dispute ticket, withdrawal merchant dispute) and an overdue
// UTR-Submitted transaction (scheduled scan). Recipients + rules come from
// the DB (alert_recipients / alert_settings); SMTP transport comes from env
// vars (mailer.js). Every send is fire-and-forget from the caller's point of
// view — callers never `await` these in a request's response path, and every
// path here is wrapped so a failure can never throw back into the caller.

function alertPanelUrl(path) {
  const base = process.env.CHECKOUT_BASE_URL || "http://localhost:5173";
  return `${base}${path}`;
}

function alertMoney(v) {
  return `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function alertDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata" }) + " IST";
}

function alertEscapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function getActiveAlertRecipients() {
  const r = await pool.query(
    `SELECT email FROM alert_recipients WHERE is_active = true ORDER BY id`,
  );
  return r.rows.map((row) => row.email);
}

async function getAlertSettings() {
  const r = await pool.query(`SELECT * FROM alert_settings WHERE id = 1`);
  return r.rows[0] || {
    dispute_alerts_enabled: true,
    overdue_utr_alerts_enabled: true,
    overdue_utr_threshold_minutes: 60,
    overdue_utr_reminder_enabled: true,
    overdue_utr_reminder_interval_minutes: 360,
    overdue_utr_scan_cutoff_at: new Date(),
  };
}

async function logAlertAttempt({ eventType, recipient, relatedType, relatedId, subject, status, errorMessage }) {
  await pool.query(
    `INSERT INTO alert_logs (event_type, recipient, related_type, related_id, subject, status, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [eventType, recipient, relatedType || null, relatedId || null, subject || null, status, errorMessage || null],
  ).catch((e) => console.error("[ALERTS] failed to write alert_logs row:", e.message));
}

// Fire-and-forget entrypoint. Sends to every active recipient independently
// (one recipient's failure never stops another's), logging every attempt.
// Never throws — callers still wrap the call in .catch() as defense in depth,
// but this function itself swallows all per-recipient errors internally.
async function dispatchAlertEmail({ eventType, relatedType, relatedId, subject, html, text }) {
  let recipients = [];
  try {
    recipients = await getActiveAlertRecipients();
  } catch (e) {
    console.error("[ALERTS] could not load recipients:", e.message);
    return;
  }
  if (recipients.length === 0) return;

  for (const email of recipients) {
    try {
      await sendMailWithRetry({ to: email, subject, html, text });
      await logAlertAttempt({ eventType, recipient: email, relatedType, relatedId, subject, status: "sent" });
    } catch (e) {
      console.error(`[ALERTS] send failed for ${email} (${eventType}):`, e.message);
      await logAlertAttempt({
        eventType, recipient: email, relatedType, relatedId, subject,
        status: "failed", errorMessage: String(e.message || e).slice(0, 500),
      });
    }
  }
}

// Atomic claim — at most one caller ever sees `true` for a given row, which
// is what makes dispute alerts safe against duplicate webhook/API retries:
// two concurrent calls attempting to claim the same transaction/withdrawal
// race on this single UPDATE, and only the one whose WHERE clause still
// matches (column still NULL) gets a row back.
async function claimDisputeAlert(table, id) {
  const col = table === "withdrawal_transactions" ? "withdrawal_transactions" : "transactions";
  const r = await pool.query(
    `UPDATE ${col} SET dispute_alert_sent_at = NOW() WHERE id = $1 AND dispute_alert_sent_at IS NULL RETURNING id`,
    [id],
  );
  return r.rows.length > 0;
}

// ── Dispute alert: Pay-In (checkout-raised or merchant-raised ticket) ──────
async function sendPayinDisputeAlert(transactionId, { raisedByLabel, reason }) {
  const settings = await getAlertSettings().catch(() => null);
  if (!settings || !settings.dispute_alerts_enabled) return;

  const r = await pool.query(
    `SELECT t.*,
            m.name AS merchant_name,
            a.name AS agent_name,
            ad.username AS admin_username,
            c.company_name AS client_company_name, c.domain_name AS client_domain_name
     FROM transactions t
     LEFT JOIN merchants m ON m.id = t.merchant_id
     LEFT JOIN agents a ON a.id = t.agent_id
     LEFT JOIN admins ad ON ad.id = t.created_by_admin_id
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.id = $1`,
    [transactionId],
  );
  const t = r.rows[0];
  if (!t) return;

  const adminName = t.admin_username || "Unknown Admin";
  const merchantName = t.merchant_name || "Unknown Merchant";
  const subject = `${adminName} - ${merchantName} - Dispute Created`;
  const link = alertPanelUrl(`/superadmin/alerts?tab=disputes&type=payin&id=${t.id}`);

  const rows = [
    ["Client / Domain", `${t.client_company_name || "-"} (${t.client_domain_name || "-"})`],
    ["Admin", adminName],
    ["Agent", t.agent_name || "-"],
    ["Merchant", merchantName],
    ["Transaction ID", t.transaction_id || String(t.id)],
    ["Merchant Order ID", t.merchant_order_id || "-"],
    ["UTR", t.disputed_utr || t.utr_number || "-"],
    ["Amount", alertMoney(t.amount)],
    ["Payment Method / Account", t.upi_id || `${t.bank_name || "-"} · ${t.account_number || "-"}`],
    ["Dispute Reason", reason || "-"],
    ["Raised By", raisedByLabel || "-"],
    ["Date & Time", alertDateTime(new Date())],
  ];

  const html = buildAlertHtml({
    heading: "New Dispute Raised",
    intro: `A new dispute was raised on transaction #${t.id}.`,
    rows,
    linkLabel: "Open Dispute in Super Admin Panel",
    link,
  });

  await dispatchAlertEmail({
    eventType: "dispute_created",
    relatedType: "transaction",
    relatedId: t.id,
    subject,
    html,
    text: alertHtmlToText(rows, subject, link),
  });
}

// ── Dispute alert: Withdrawal (merchant-raised) ─────────────────────────────
async function sendWithdrawalDisputeAlert(withdrawalId, { raisedByLabel, reason }) {
  const settings = await getAlertSettings().catch(() => null);
  if (!settings || !settings.dispute_alerts_enabled) return;

  const r = await pool.query(
    `SELECT w.*,
            m.name AS merchant_name, m.client_id AS merchant_client_id, m.created_by_admin_id AS merchant_admin_id,
            a.name AS agent_name,
            ad.username AS admin_username,
            c.company_name AS client_company_name, c.domain_name AS client_domain_name
     FROM withdrawal_transactions w
     LEFT JOIN merchants m ON m.id = w.merchant_id
     LEFT JOIN agents a ON a.id = w.agent_id
     LEFT JOIN admins ad ON ad.id = m.created_by_admin_id
     LEFT JOIN clients c ON c.id = m.client_id
     WHERE w.id = $1`,
    [withdrawalId],
  );
  const w = r.rows[0];
  if (!w) return;

  const adminName = w.admin_username || "Unknown Admin";
  const merchantName = w.merchant_name || "Unknown Merchant";
  const subject = `${adminName} - ${merchantName} - Dispute Created`;
  const link = alertPanelUrl(`/superadmin/alerts?tab=disputes&type=withdrawal&id=${w.id}`);

  const rows = [
    ["Client / Domain", `${w.client_company_name || "-"} (${w.client_domain_name || "-"})`],
    ["Admin", adminName],
    ["Agent", w.agent_name || "-"],
    ["Merchant", merchantName],
    ["Transaction ID", w.transaction_id || String(w.id)],
    ["UTR", w.utr_number || "-"],
    ["Amount", alertMoney(w.amount)],
    ["Payment Method / Account", w.upi_id || `${w.account_name || "-"} · ${w.account_number || "-"} (${w.ifsc_code || "-"})`],
    ["Dispute Reason", reason || "-"],
    ["Raised By", raisedByLabel || "-"],
    ["Date & Time", alertDateTime(new Date())],
  ];

  const html = buildAlertHtml({
    heading: "New Withdrawal Dispute Raised",
    intro: `A new dispute was raised on withdrawal #${w.id}.`,
    rows,
    linkLabel: "Open Dispute in Super Admin Panel",
    link,
  });

  await dispatchAlertEmail({
    eventType: "dispute_created",
    relatedType: "withdrawal_transaction",
    relatedId: w.id,
    subject,
    html,
    text: alertHtmlToText(rows, subject, link),
  });
}

// ── Overdue UTR alert (initial + optional reminder) ─────────────────────────
async function sendOverdueUtrAlert(transactionId, { isReminder }) {
  const r = await pool.query(
    `SELECT t.*,
            m.name AS merchant_name,
            ad.username AS admin_username,
            c.company_name AS client_company_name, c.domain_name AS client_domain_name,
            ag.name AS agent_name,
            oa.account_holder_name AS oa_account_holder_name
     FROM transactions t
     LEFT JOIN merchants m ON m.id = t.merchant_id
     LEFT JOIN admins ad ON ad.id = t.created_by_admin_id
     LEFT JOIN clients c ON c.id = t.client_id
     LEFT JOIN agents ag ON ag.id = t.agent_id
     LEFT JOIN agent_accounts oa ON oa.id = t.account_id
     WHERE t.id = $1`,
    [transactionId],
  );
  const t = r.rows[0];
  if (!t) return;

  const pendingMinutes = Math.max(0, Math.floor((Date.now() - new Date(t.utr_submitted_at).getTime()) / 60000));
  const pendingLabel = `${Math.floor(pendingMinutes / 60)}h ${pendingMinutes % 60}m`;
  const merchantName = t.merchant_name || "Unknown Merchant";
  const subject = `${isReminder ? "[Reminder] " : ""}Overdue UTR — ${merchantName} — Pending ${pendingLabel}`;
  const link = alertPanelUrl(`/superadmin/alerts?tab=overdue&id=${t.id}`);

  const rows = [
    ["Client / Domain", `${t.client_company_name || "-"} (${t.client_domain_name || "-"})`],
    ["Admin", t.admin_username || "-"],
    ["Merchant", merchantName],
    ["Agent / Account", `${t.agent_name || "-"} · ${t.oa_account_holder_name || t.account_holder_name || "-"}`],
    ["Transaction ID", t.transaction_id || String(t.id)],
    ["Merchant Order ID", t.merchant_order_id || "-"],
    ["UTR Number", t.utr_number || "-"],
    ["Amount", alertMoney(t.amount)],
    ["UTR Submitted At", alertDateTime(t.utr_submitted_at)],
    ["Pending For", pendingLabel],
  ];

  const html = buildAlertHtml({
    heading: isReminder ? "Overdue UTR — Reminder" : "Overdue UTR Submission",
    intro: `Transaction #${t.id} has been in UTR Submitted status for ${pendingLabel} without being approved or rejected.`,
    rows,
    linkLabel: "Open Approval Page in Super Admin Panel",
    link,
  });

  await dispatchAlertEmail({
    eventType: isReminder ? "overdue_utr_reminder" : "overdue_utr",
    relatedType: "transaction",
    relatedId: t.id,
    subject,
    html,
    text: alertHtmlToText(rows, subject, link),
  });
}

function buildAlertHtml({ heading, intro, rows, linkLabel, link }) {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;white-space:nowrap;">${alertEscapeHtml(label)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;">${alertEscapeHtml(value)}</td>
    </tr>`).join("");
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#0f172a;margin-bottom:4px;">${alertEscapeHtml(heading)}</h2>
      <p style="color:#475569;font-size:14px;margin-top:0;">${alertEscapeHtml(intro)}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">${rowsHtml}</table>
      <a href="${link}" style="display:inline-block;background:#2B7DE9;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">${alertEscapeHtml(linkLabel)}</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">Automated alert from RDpay — Super Admin Email Alert Configuration.</p>
    </div>`;
}

function alertHtmlToText(rows, subject, link) {
  const lines = rows.map(([label, value]) => `${label}: ${value}`);
  return `${subject}\n\n${lines.join("\n")}\n\nOpen in Super Admin Panel: ${link}`;
}

// ── Overdue UTR scheduled scan ───────────────────────────────────────────────
// Runs every 5 minutes (see setInterval near the bottom of this file, next to
// expirePendingTransactions). Two atomic claim-UPDATEs per tick:
//   1. Initial alert — rows crossing the threshold for the first time
//      (overdue_alert_sent_at IS NULL). Claiming and sending happen as
//      separate steps, but the claim itself is what prevents a duplicate —
//      once claimed, a row can never be claimed again even if this function
//      is somehow invoked twice concurrently or a previous tick is still
//      finishing.
//   2. Reminder — rows already alerted whose last reminder (or, if none yet,
//      the initial alert) is older than the configured reminder interval.
//      COALESCE(last_reminder_at, sent_at) makes the first reminder land
//      exactly one interval after the initial alert, and every subsequent
//      one land one interval after the previous reminder.
// A transaction that gets Approved/Rejected/Disputed before the threshold
// simply stops matching `status = 'UTR Submitted'` in these queries — no
// alert is ever generated for it, and no cleanup of the claim columns is
// needed since the row is permanently out of scope once resolved.
async function scanOverdueUtrAlerts() {
  try {
    const settings = await getAlertSettings();
    if (!settings.overdue_utr_alerts_enabled) return;

    const thresholdMin = Math.max(1, Number(settings.overdue_utr_threshold_minutes) || 60);
    // Ignore backlog: only UTR-Submitted transactions created on/after the
    // scan cutoff (when this feature was enabled) are eligible. Without
    // this, every pre-existing pending UTR from before the feature existed
    // would immediately qualify as "overdue" on the very first scan.
    const initial = await pool.query(
      `UPDATE transactions SET overdue_alert_sent_at = NOW()
       WHERE status = 'UTR Submitted'
         AND utr_submitted_at IS NOT NULL
         AND utr_submitted_at >= $2
         AND utr_submitted_at <= NOW() - ($1 || ' minutes')::INTERVAL
         AND overdue_alert_sent_at IS NULL
       RETURNING id`,
      [String(thresholdMin), settings.overdue_utr_scan_cutoff_at],
    );
    for (const row of initial.rows) {
      await sendOverdueUtrAlert(row.id, { isReminder: false })
        .catch((e) => console.error(`[ALERTS] overdue alert failed for txn ${row.id}:`, e.message));
    }

    if (settings.overdue_utr_reminder_enabled) {
      const reminderMin = Math.max(1, Number(settings.overdue_utr_reminder_interval_minutes) || 360);
      const reminders = await pool.query(
        `UPDATE transactions SET overdue_alert_last_reminder_at = NOW()
         WHERE status = 'UTR Submitted'
           AND overdue_alert_sent_at IS NOT NULL
           AND COALESCE(overdue_alert_last_reminder_at, overdue_alert_sent_at) <= NOW() - ($1 || ' minutes')::INTERVAL
         RETURNING id`,
        [String(reminderMin)],
      );
      for (const row of reminders.rows) {
        await sendOverdueUtrAlert(row.id, { isReminder: true })
          .catch((e) => console.error(`[ALERTS] overdue reminder failed for txn ${row.id}:`, e.message));
      }
    }
  } catch (e) {
    console.error("[ALERTS] scanOverdueUtrAlerts failed:", e.message);
  }
}

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(200) NOT NULL,
        domain_name VARCHAR(200) UNIQUE,
        logo_url TEXT,
        theme_color VARCHAR(50) DEFAULT '#2B7DE9',
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        singleton_key SMALLINT NOT NULL DEFAULT 1 UNIQUE CHECK (singleton_key = 1),
        username VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plain_password TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        commission_percent NUMERIC DEFAULT 0,
        max_payment_limit NUMERIC DEFAULT 0,
        min_transaction_amount NUMERIC DEFAULT 0,
        created_by_admin_id INTEGER REFERENCES admins(id),
        username VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plain_password TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        commission_percent NUMERIC DEFAULT 0,
        agent_id INTEGER REFERENCES agents(id),
        created_by_admin_id INTEGER REFERENCES admins(id),
        username VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plain_password TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_accounts (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
        created_by_admin_id INTEGER REFERENCES admins(id),
        bank_name VARCHAR(150),
        ifsc_code VARCHAR(100),
        account_number VARCHAR(100),
        account_holder_name VARCHAR(150),
        upi_id VARCHAR(150),
        max_payment_limit NUMERIC DEFAULT 0,
        max_available_limit NUMERIC DEFAULT 0,
        min_transaction_amount NUMERIC DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // One-time (idempotent) reset: max_available_limit is no longer
    // independently decremented/incremented on Pay-In create/refund (the
    // agent wallet + ledger below is now the single source of truth for
    // funded balance — see debitAgentWalletForPayin/refundAgentWalletForPayin).
    // max_available_limit stays as a column (existing UI still reads it as an
    // account routing-cap display field) but is frozen at max_payment_limit
    // rather than left at whatever stale value the old decrement logic left it
    // at. No-op after the first run.
    await pool.query(`
      UPDATE agent_accounts SET max_available_limit = max_payment_limit
      WHERE max_available_limit IS DISTINCT FROM max_payment_limit;
    `);

    // ── Agent wallet / top-up ──────────────────────────────────────────────
    // One row per agent. Tracks Settlement Remaining (available_balance) and,
    // via the ledger below, Settlement Amount — INFORMATIONAL/ACCOUNTING ONLY.
    // Debited on Pay-In creation and credited on refund/top-up-approval purely
    // to keep these figures accurate; the wallet does NOT gate or block Pay-In
    // routing or creation (that remains governed solely by the existing
    // agent_accounts.max_payment_limit/is_active/min_transaction_amount
    // rules — see findCandidateAgentAccount). Always mutated inside a
    // BEGIN + SELECT...FOR UPDATE transaction for internal consistency (so
    // concurrent debits/refunds never produce a torn balance/ledger pair),
    // never a bare UPDATE.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_wallets (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
        available_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Balance may legitimately go negative now that Pay-In creation is never
    // blocked by insufficient wallet balance — Settlement Amount can exceed
    // Settlement Remaining's funded total, and that's the honest, informative
    // signal an agent needs ("you've processed more than you've topped
    // up"). The non-negative CHECK constraint from the original wallet-gate
    // design is dropped so a debit can never fail/roll back a Pay-In.
    await pool.query(`ALTER TABLE agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_available_balance_check;`);

    // Append-only ledger. SUM(amount) for an agent must always equal
    // agent_wallets.available_balance — used as a reconciliation invariant.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_wallet_ledger (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        entry_type VARCHAR(30) NOT NULL,
        amount NUMERIC(18,2) NOT NULL,
        balance_after NUMERIC(18,2) NOT NULL,
        reference_type VARCHAR(30),
        reference_id INTEGER,
        created_by_role VARCHAR(20),
        created_by_id INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_wallet_ledger_agent ON agent_wallet_ledger(agent_id, created_at DESC);`);
    // Defense-in-depth: a second TOPUP_CREDIT for the same request is a hard DB
    // error even if the app-level Pending-status guard were ever bypassed.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_topup_credit
        ON agent_wallet_ledger (reference_type, reference_id) WHERE entry_type = 'TOPUP_CREDIT';
    `);
    // Same idempotency guarantee extended to the Pay-In side: at most one
    // PAYIN_DEBIT, one PAYIN_REFUND, and one PAYIN_REDEBIT may ever exist per
    // transaction. A second one (e.g. a duplicate webhook re-triggering the
    // same code path) is a hard DB error instead of a silent double-adjustment.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_payin_entry
        ON agent_wallet_ledger (reference_type, reference_id, entry_type)
        WHERE reference_type = 'transaction' AND entry_type IN ('PAYIN_DEBIT','PAYIN_REFUND','PAYIN_REDEBIT');
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_topup_requests (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        client_id INTEGER REFERENCES clients(id),
        created_by_admin_id INTEGER REFERENCES admins(id),
        method VARCHAR(20) NOT NULL,
        amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
        usdt_wallet_address VARCHAR(255),
        usdt_network VARCHAR(50),
        usdt_tx_hash VARCHAR(150),
        bank_name VARCHAR(150),
        bank_account_number VARCHAR(100),
        bank_ifsc VARCHAR(100),
        bank_utr VARCHAR(100),
        proof_file_path TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'Pending',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_by_role VARCHAR(20),
        reviewed_by_id INTEGER,
        reviewed_at TIMESTAMP,
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agtr_agent_status ON agent_topup_requests(agent_id, status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agtr_admin_status ON agent_topup_requests(created_by_admin_id, status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agtr_client_status ON agent_topup_requests(client_id, status);`);

    // Per-tenant singleton config for where agents should send top-up funds.
    // client_id is nullable (legacy admins can have client_id IS NULL) and falls
    // back to created_by_admin_id as the uniqueness key in that case.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_wallet_configs (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        created_by_admin_id INTEGER REFERENCES admins(id),
        usdt_wallet_address VARCHAR(255),
        usdt_network VARCHAR(50),
        usdt_label TEXT,
        bank_name VARCHAR(150),
        bank_account_number VARCHAR(100),
        bank_ifsc VARCHAR(100),
        bank_account_holder_name VARCHAR(150),
        bank_upi_id VARCHAR(150),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by_admin_id INTEGER REFERENCES admins(id)
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cwc_client ON company_wallet_configs(client_id) WHERE client_id IS NOT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cwc_admin_legacy ON company_wallet_configs(created_by_admin_id) WHERE client_id IS NULL;
    `);
    // Optional QR code image for the company's USDT deposit address. Public
    // (unauthenticated) file, unlike agent top-up proofs — a QR is meant to
    // be freely scannable by anyone paying, not sensitive evidence.
    await pool.query(`ALTER TABLE company_wallet_configs ADD COLUMN IF NOT EXISTS usdt_qr_file_path TEXT;`);

    // Platform-wide maintenance flag — a fixed single row (id=1), not per-tenant
    // like company_wallet_configs. When enabled, blocks new non-super-admin
    // logins and new Pay-In session creation (see checkMaintenanceBlocksLogin/
    // checkMaintenanceBlocksPayins helpers) without touching existing sessions,
    // in-flight checkout sessions, or sandbox/test-mode traffic.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platform_maintenance (
        id INTEGER PRIMARY KEY DEFAULT 1,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        message TEXT,
        updated_by_role VARCHAR(20),
        updated_by_id INTEGER,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT platform_maintenance_singleton CHECK (id = 1)
      );
    `);
    await pool.query(`
      INSERT INTO platform_maintenance (id, is_enabled) VALUES (1, false)
      ON CONFLICT (id) DO NOTHING;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settlement_accounts (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id),
        created_by_admin_id INTEGER REFERENCES admins(id),
        bank_name VARCHAR(150),
        ifsc_code VARCHAR(100),
        account_number VARCHAR(100),
        account_holder_name VARCHAR(150),
        upi_id VARCHAR(150),
        max_payment_limit NUMERIC DEFAULT 0,
        min_transaction_amount NUMERIC DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS settlement_transactions (
    id SERIAL PRIMARY KEY,
    amount NUMERIC DEFAULT 0,
    utr_number VARCHAR(150),
    bank_name VARCHAR(150),
    ifsc_code VARCHAR(100),
    account_number VARCHAR(100),
    account_holder_name VARCHAR(150),
    upi_id VARCHAR(150),
    transaction_status VARCHAR(50) DEFAULT 'Pending',
    approved_or_reject_date TIMESTAMP,
    settlement_account_id INTEGER REFERENCES settlement_accounts(id),
    merchant_id INTEGER REFERENCES merchants(id),
    agent_id INTEGER REFERENCES agents(id),
    created_by_admin_id INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(150),
        amount NUMERIC DEFAULT 0,
        utr_number VARCHAR(150),
        payment_proof TEXT,
        bank_name VARCHAR(150),
        ifsc_code VARCHAR(100),
        account_number VARCHAR(100),
        account_holder_name VARCHAR(150),
        upi_id VARCHAR(150),
        account_id INTEGER REFERENCES agent_accounts(id),
        merchant_id INTEGER REFERENCES merchants(id),
        agent_id INTEGER REFERENCES agents(id),
        created_by_admin_id INTEGER REFERENCES admins(id),
        max_payment_limit NUMERIC DEFAULT 0,
        max_available_limit NUMERIC DEFAULT 0,
        min_transaction_amount NUMERIC DEFAULT 0,
        webhook_url TEXT,
        unique_id VARCHAR(200),
        approved_or_reject_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_activity (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role VARCHAR(50) NOT NULL,
        username VARCHAR(150),
        name VARCHAR(150),
        ip_address TEXT,
        user_agent TEXT,
        logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
  CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    merchant_id INTEGER REFERENCES merchants(id),
    subject TEXT NOT NULL,
    issue TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Open',
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS user_id INTEGER NOT NULL DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'unknown';`,
    );
    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS username VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS ip_address TEXT;`,
    );
    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS user_agent TEXT;`,
    );
    await pool.query(
      `ALTER TABLE login_activity ADD COLUMN IF NOT EXISTS logged_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_login_activity_role_user ON login_activity(role, user_id);`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_login_activity_logged_in_at ON login_activity(logged_in_at DESC);`,
    );

    await pool.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS plain_password TEXT;`,
    );
    await pool.query(
      `ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`,
    );

    await pool.query(
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS max_payment_limit NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS max_available_limit NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS min_transaction_amount NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES admins(id);`,
    );
    await pool.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES admins(id);`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES admins(id);`,
    );
    await pool.query(
      `ALTER TABLE settlement_accounts ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES admins(id);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES admins(id);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES admins(id);`,
    );

    await pool.query(
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS plain_password TEXT;`,
    );
    await pool.query(
      `ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`,
    );

    await pool.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plain_password TEXT;`,
    );
    await pool.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);`,
    );
    await pool.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`,
    );

    // token/api_key: moved from the old merchants table — every Merchant is
    // now directly API-ready (Merchant's external Pay-In/checkout API key
    // is now owned by Merchant itself, see authenticateMerchantApiKey).
    await pool.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS token TEXT;`,
    );
    await pool.query(
      `ALTER TABLE merchants ADD COLUMN IF NOT EXISTS api_key TEXT;`,
    );

    const merchantsWithoutApiKey = await pool.query(
      `SELECT id FROM merchants WHERE api_key IS NULL`,
    );
    for (const row of merchantsWithoutApiKey.rows) {
      const apiKey = crypto.randomBytes(32).toString("hex");
      await pool.query(`UPDATE merchants SET api_key = $1 WHERE id = $2`, [
        apiKey,
        row.id,
      ]);
    }

    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(100);`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS upi_id VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS max_payment_limit NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS max_available_limit NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS min_transaction_amount NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS withdrawn_total NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`,
    );
    await pool.query(
      `ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    );

    // Balance-tracking withdrawals — cash pulled out of a collection bank to free
    // its limit. Separate from the payout withdrawal_transactions subsystem.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_account_withdrawals (
        id SERIAL PRIMARY KEY,
        account_id INTEGER REFERENCES agent_accounts(id) ON DELETE CASCADE,
        amount NUMERIC NOT NULL,
        remark TEXT,
        created_by_role VARCHAR(50),
        created_by_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Optional link to a previous tracking entry (chain A -> B -> C). Reference
    // only — does not affect the ledger. linked_ref is "trkwd-<id>"/"xfer-<id>";
    // linked_label is a display snapshot of that entry.
    await pool.query(
      `ALTER TABLE agent_account_withdrawals ADD COLUMN IF NOT EXISTS linked_ref TEXT;`,
    );
    await pool.query(
      `ALTER TABLE agent_account_withdrawals ADD COLUMN IF NOT EXISTS linked_label TEXT;`,
    );

    await pool.query(
      `ALTER TABLE settlement_accounts ADD COLUMN IF NOT EXISTS merchant_id INTEGER REFERENCES merchants(id);`,
    );

    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS merchant_id INTEGER REFERENCES merchants(id);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS approved_or_reject_date TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS transaction_status VARCHAR(50) DEFAULT 'Pending';`,
    );

    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS utr_number VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_proof TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(100);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS upi_id VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES agent_accounts(id);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_id INTEGER REFERENCES merchants(id);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS max_payment_limit NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS max_available_limit NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS min_transaction_amount NUMERIC DEFAULT 0;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_url TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unique_id VARCHAR(200);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS redirect_url TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS utr_submitted_at TIMESTAMP;`,
    );

    // Backfill utr_submitted_at for historic rows that already have a UTR but no timestamp.
    // Best guess: approved_or_reject_date if Approved, else created_at. One-time; subsequent
    // boots skip rows that already have utr_submitted_at set.
    await pool.query(`
      UPDATE transactions
      SET utr_submitted_at = COALESCE(approved_or_reject_date, created_at)
      WHERE utr_submitted_at IS NULL
        AND utr_number IS NOT NULL
        AND TRIM(utr_number) <> ''
    `);
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS approved_or_reject_date TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Pending';`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    );

    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_order_id TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_name TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_mobile TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_sent BOOLEAN DEFAULT false;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_response TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS checkout_mode BOOLEAN DEFAULT false;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS disputed_utr VARCHAR(150);`,
    );

    await pool.query(
      // Partial: UTR uniqueness only among LIVE orders. Failed/Rejected/Expired orders
      // and agent-verified proofs are excluded so a correct order can (re)claim a UTR.
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_utr_unique ON transactions (LOWER(TRIM(utr_number))) WHERE utr_number IS NOT NULL AND TRIM(utr_number) <> '' AND status NOT IN ('Failed','Rejected','Expired','Agent Verified','Disputed');`,
    );
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_transactions_utr_unique ON settlement_transactions (LOWER(TRIM(utr_number))) WHERE utr_number IS NOT NULL AND TRIM(utr_number) <> '';`,
    );

    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS settlement_account_id INTEGER REFERENCES settlement_accounts(id);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS utr_number VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS proof TEXT;`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(100);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS account_number VARCHAR(100);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS upi_id VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS created_by_agent_id INTEGER REFERENCES agents(id);`,
    );

    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS created_by_agent_id INTEGER REFERENCES agents(id);`,
    );
    await pool.query(
      `ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS notes TEXT;`,
    );

    // Default admin seed credentials come from env (DEFAULT_ADMIN_USERNAME/PASSWORD).
    // Nothing is hardcoded; if the vars are unset the seed is skipped.
    const defaultAdminUsername = process.env.DEFAULT_ADMIN_USERNAME;
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    if (defaultAdminUsername && defaultAdminPassword) {
      const adminExists = await pool.query("SELECT * FROM admins WHERE singleton_key = 1 LIMIT 1");

      if (adminExists.rows.length === 0) {
        const hashedPassword = await bcrypt.hash(defaultAdminPassword, 10);
        await pool.query(
          `INSERT INTO admins (username, password, plain_password, is_active) VALUES ($1, $2, $3, $4)`,
          [defaultAdminUsername, hashedPassword, defaultAdminPassword, true],
        );
        console.log("Default admin seeded from env");
      }
    } else {
      console.log(
        "DEFAULT_ADMIN_USERNAME/PASSWORD not set — skipping default admin seed",
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        plain_password TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ─── SUPER ADMIN EMAIL ALERTS ───────────────────────────────────────────
    // Recipients + alert rules (thresholds/toggles) live here, not in .env —
    // only SMTP transport credentials are env-configured (see mailer.js).
    // Super Admin is platform-wide, so these recipients see alerts across
    // every tenant/client by design (not tenant-isolated like everything
    // else — see dispute/overdue-UTR alert queries below, which deliberately
    // do NOT filter by client_id when gathering detail for the email body).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_recipients (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by_super_admin_id INTEGER REFERENCES super_admins(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_recipients_email ON alert_recipients (LOWER(email));
    `);

    // Singleton config row (id=1), same pattern as platform_maintenance above.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        dispute_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
        overdue_utr_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
        overdue_utr_threshold_minutes INTEGER NOT NULL DEFAULT 60,
        overdue_utr_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
        overdue_utr_reminder_interval_minutes INTEGER NOT NULL DEFAULT 360,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by_super_admin_id INTEGER REFERENCES super_admins(id),
        CONSTRAINT alert_settings_singleton CHECK (id = 1)
      );
    `);
    await pool.query(`
      INSERT INTO alert_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    `);
    // Overdue-UTR scan cutoff — set once (DEFAULT CURRENT_TIMESTAMP only
    // applies the first time this column is added, since ADD COLUMN IF NOT
    // EXISTS is a no-op on every later boot). Existing installs get "the
    // moment this fix deployed"; fresh installs get "alert_settings row
    // creation time" — either way, historical UTR-Submitted transactions
    // that already existed before the feature could ever have alerted on
    // them are permanently excluded from scanOverdueUtrAlerts() below,
    // without needing to track a separate "feature enabled" flag.
    await pool.query(`
      ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS overdue_utr_scan_cutoff_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    // Alert claim/dedup columns must exist before the cleanup/backfill below
    // references them. Keeping these additive makes both a fresh bootstrap and
    // upgrades from an older MasterPay schema safe and idempotent.
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dispute_alert_sent_at TIMESTAMP;`);
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS overdue_alert_sent_at TIMESTAMP;`);
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS overdue_alert_last_reminder_at TIMESTAMP;`);
    // One-time backfill: this fix was preceded by a version of the scanner
    // with no cutoff, so pre-existing historical transactions may already
    // have been (incorrectly) claimed and be mid-reminder-cycle. Un-claim
    // any such row so reminders stop going out for backlog that predates
    // the cutoff. Safe to run on every boot — after the first run, no row
    // can match `overdue_alert_sent_at IS NOT NULL AND utr_submitted_at <
    // cutoff` again, since the cutoff value itself never changes once set,
    // and this UPDATE has already cleared every row that qualified.
    await pool.query(`
      UPDATE transactions t
      SET overdue_alert_sent_at = NULL, overdue_alert_last_reminder_at = NULL
      FROM alert_settings s
      WHERE s.id = 1
        AND t.status = 'UTR Submitted'
        AND t.overdue_alert_sent_at IS NOT NULL
        AND t.utr_submitted_at < s.overdue_utr_scan_cutoff_at;
    `);

    // Every send attempt, one row per recipient — success or failure. Powers
    // the "delivery status / last sent / recent failures" panel.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alert_logs (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(40) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        related_type VARCHAR(30),
        related_id INTEGER,
        subject TEXT,
        status VARCHAR(20) NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_logs_created ON alert_logs(created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_logs_recipient ON alert_logs(recipient, created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_alert_logs_related ON alert_logs(related_type, related_id);`);

    // Dedup/claim columns — a single atomic `UPDATE ... WHERE x_sent_at IS
    // NULL RETURNING *` is what guarantees at most one dispute alert per
    // transaction/withdrawal and at most one initial overdue-UTR alert per
    // transaction, even under duplicate webhook/API retries or overlapping
    // scan ticks. See claimDisputeAlert()/scanOverdueUtrAlerts() below.
    // Scanner runs every few minutes scoped to status='UTR Submitted' — this
    // partial index keeps that scan cheap regardless of total transaction volume.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_utr_submitted_overdue
        ON transactions(utr_submitted_at) WHERE status = 'UTR Submitted';
    `);

    // ─── WITHDRAWAL SUBSYSTEM ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_merchant_configs (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE UNIQUE NOT NULL,
        max_payment_limit NUMERIC DEFAULT 0,
        max_available_limit NUMERIC DEFAULT 0,
        commission_percent NUMERIC DEFAULT 0,
        api_key TEXT UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_merchant_agent_assignments (
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (merchant_id, agent_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_transactions (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(150) UNIQUE NOT NULL,
        merchant_id INTEGER REFERENCES merchants(id) NOT NULL,
        agent_id INTEGER REFERENCES agents(id),
        picked_at TIMESTAMP,
        amount NUMERIC NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        upi_id VARCHAR(150),
        account_name VARCHAR(150),
        account_number VARCHAR(150),
        ifsc_code VARCHAR(100),
        utr_number VARCHAR(150),
        webhook_url TEXT,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        cleared_or_rejected_date TIMESTAMP,
        webhook_sent BOOLEAN DEFAULT false,
        webhook_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS dispute_alert_sent_at TIMESTAMP;`);

    // SSPay integration columns (additive; safe on existing tables)
    await pool.query(
      `ALTER TABLE withdrawal_merchant_configs ADD COLUMN IF NOT EXISTS sspay_api_key TEXT;`,
    );
    await pool.query(
      `ALTER TABLE withdrawal_merchant_configs ADD COLUMN IF NOT EXISTS sspay_enabled BOOLEAN DEFAULT false;`,
    );
    await pool.query(
      `ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS sspay_order_id TEXT;`,
    );
    await pool.query(
      `ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS sspay_status TEXT;`,
    );
    await pool.query(
      `ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS sspay_failure_reason TEXT;`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_withdrawal_txns_sspay_order ON withdrawal_transactions(sspay_order_id);`,
    );

    // ── Payout provider selection (per merchant) ────────────────────────────
    // 'a24h'     → wallet.sspay.online, key in sspay_api_key  (the original, live)
    // 'firstpay' → real.firstpay.online, key in firstpay_api_key (Dharti/Gopay tenant)
    // Both run the same codebase/API — only base URL + credentials differ.
    // Existing rows default to 'a24h' so live merchants are completely unaffected.
    await pool.query(
      `ALTER TABLE withdrawal_merchant_configs ADD COLUMN IF NOT EXISTS payout_provider VARCHAR(20) DEFAULT 'a24h';`,
    );
    await pool.query(
      `ALTER TABLE withdrawal_merchant_configs ADD COLUMN IF NOT EXISTS firstpay_api_key TEXT;`,
    );
    // Survey (Suivrepay) tenant — srv.firstpay.online, same API as the others.
    await pool.query(
      `ALTER TABLE withdrawal_merchant_configs ADD COLUMN IF NOT EXISTS survey_api_key TEXT;`,
    );
    await pool.query(
      `UPDATE withdrawal_merchant_configs SET payout_provider = 'a24h' WHERE payout_provider IS NULL;`,
    );
    // Records which provider actually handled each payout (audit + provider-aware polling).
    await pool.query(
      `ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS payout_provider VARCHAR(20);`,
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_withdrawal_txns_status ON withdrawal_transactions(status);`,
    );

    await pool.query(
      `ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS merchant_dispute_reason TEXT;`,
    );
    await pool.query(
      `ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS merchant_disputed_at TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS withdrawal_id INTEGER REFERENCES withdrawal_transactions(id);`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_dispute_reason TEXT;`,
    );
    await pool.query(
      `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS merchant_disputed_at TIMESTAMP;`,
    );
    await pool.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS payin_id INTEGER REFERENCES transactions(id);`,
    );

    // Agent-received proofs that could NOT be saved into `transactions` because the
    // UTR already exists there with a different amount (UTR is globally unique in
    // `transactions`). Instead of erroring the agent out, we record exactly what they
    // received here, untouched, for admin reconciliation. No unique constraint on UTR —
    // this is a raw log of what the agent says they received.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_received_proofs (
        id SERIAL PRIMARY KEY,
        utr_number VARCHAR(150) NOT NULL,
        amount NUMERIC NOT NULL,
        account_id INTEGER,
        agent_id INTEGER,
        created_by_admin_id INTEGER,
        bank_name VARCHAR(150),
        ifsc_code VARCHAR(100),
        account_number VARCHAR(150),
        account_holder_name VARCHAR(150),
        upi_id VARCHAR(150),
        existing_transaction_id INTEGER,
        existing_amount NUMERIC,
        status VARCHAR(50) DEFAULT 'Agent Verified',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_received_proofs_agent ON agent_received_proofs(agent_id);`,
    );

    // Tracks what we've already pushed to the SS Accounting ledger so the background
    // sync never re-posts. external_ref doubles as the entry's idempotency key on the
    // ledger side; party markers use keys like 'party:merchant:5'.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ledger_sync (
        external_ref TEXT PRIMARY KEY,
        kind VARCHAR(30),
        posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Money moved between the agent's OWN collection banks (e.g. Equitas -> BoB
    // before paying a merchant). Reduces the source bank and increases the destination
    // in the ledger, so a pass-through bank never goes negative.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_transfers (
        id SERIAL PRIMARY KEY,
        from_account_id INTEGER REFERENCES agent_accounts(id),
        to_account_id INTEGER REFERENCES agent_accounts(id),
        amount NUMERIC NOT NULL,
        remark TEXT,
        created_by_role VARCHAR(50),
        created_by_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Transfer can use a party (e.g. a merchant) on either side instead of a bank.
    await pool.query(
      `ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS to_party_name VARCHAR(150);`,
    );
    await pool.query(
      `ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS from_party_name VARCHAR(150);`,
    );
    // Optional link to a previous tracking entry (chain A -> B -> C). Reference only.
    await pool.query(
      `ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS linked_ref TEXT;`,
    );
    await pool.query(
      `ALTER TABLE bank_transfers ADD COLUMN IF NOT EXISTS linked_label TEXT;`,
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_withdrawal_txns_merchant ON withdrawal_transactions(merchant_id);`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_withdrawal_txns_agent ON withdrawal_transactions(agent_id);`,
    );

    await pool.query(`ALTER TABLE super_admins ADD COLUMN IF NOT EXISTS email TEXT;`);

    // Super Admin seed credentials come from env (SUPER_ADMIN_USERNAME/
    // SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD). Nothing is hardcoded; if the
    // vars are unset the seed is skipped. Idempotent — only inserts if no row
    // with that username already exists, safe to run on every boot.
    const superAdminUsername = process.env.SUPER_ADMIN_USERNAME;
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
    if (superAdminUsername && superAdminPassword) {
      const superAdminExists = await pool.query(
        "SELECT * FROM super_admins WHERE username = $1",
        [superAdminUsername],
      );
      if (superAdminExists.rows.length === 0) {
        const hashedSuper = await bcrypt.hash(superAdminPassword, 10);
        await pool.query(
          `INSERT INTO super_admins (username, email, password, plain_password, is_active) VALUES ($1, $2, $3, $4, $5)`,
          [superAdminUsername, superAdminEmail || null, hashedSuper, superAdminPassword, true],
        );
        console.log("Super Admin seeded from env");
      }
    } else {
      console.log(
        "SUPER_ADMIN_USERNAME/SUPER_ADMIN_PASSWORD not set — skipping Super Admin seed",
      );
    }

    // Add client_id to admins so each admin belongs to exactly one client
    await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await pool.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await pool.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    // Per-merchant checkout toggle: hide the "Pay with" app buttons (PhonePe/Paytm/
    // Other UPI), leaving only Scan-QR + Copy-UPI. Requested per client.
    await pool.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS hide_checkout_app_buttons BOOLEAN DEFAULT false;`);
    await pool.query(`ALTER TABLE agent_accounts ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await pool.query(`ALTER TABLE settlement_accounts ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await pool.query(`ALTER TABLE settlement_transactions ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);

    // ── Multiple agents per merchant ─────────────────────────────────────────
    // merchants.agent_id remains the PRIMARY agent; merchant_agents holds the full
    // set (primary + extras) used for payin routing. Payins balance randomly across
    // whichever assigned agents still have available limit.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_agents (
        merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        agent_id    INTEGER NOT NULL REFERENCES agents(id)    ON DELETE CASCADE,
        PRIMARY KEY (merchant_id, agent_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchant_agents_merchant ON merchant_agents(merchant_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchant_agents_agent ON merchant_agents(agent_id);`);
    // Backfill: every merchant with a primary agent gets a row (idempotent).
    await pool.query(`
      INSERT INTO merchant_agents (merchant_id, agent_id)
      SELECT id, agent_id FROM merchants WHERE agent_id IS NOT NULL
      ON CONFLICT (merchant_id, agent_id) DO NOTHING;
    `);

    // Backfill: every existing agent gets a wallet row seeded at zero balance.
    // No auto-grandfathering — agents must submit a top-up and get it approved
    // before they can receive new Pay-Ins (see WALLET_GATE_ENABLED below). Runs on
    // every boot; ON CONFLICT DO NOTHING makes it a no-op after the first run.
    await pool.query(`
      INSERT INTO agent_wallets (agent_id, available_balance)
      SELECT id, 0 FROM agents
      ON CONFLICT (agent_id) DO NOTHING;
    `);

    // Indexes for performance
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_domain ON clients(LOWER(domain_name));`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_admins_client ON admins(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agents_client ON agents(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchants_client ON merchants(client_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_client ON transactions(client_id);`);

    // Indexes backing the Super Admin control-center aggregate endpoints
    // (Needs Attention, money-flow, hierarchy rollups, global search).
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON transactions(status, created_at DESC);`);
    // Scope+sort indexes for the transactions list (WHERE <scope> ORDER BY id DESC).
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_merchant_id ON transactions(merchant_id, id DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_agent_id ON transactions(agent_id, id DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_created_by_admin_id ON transactions(created_by_admin_id, id DESC);`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_webhook_pending ON transactions(created_at)
        WHERE webhook_sent = false AND webhook_url IS NOT NULL AND webhook_url <> '';
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_withdrawal_txns_status_created ON withdrawal_transactions(status, created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_settlement_txns_status_created ON settlement_transactions(transaction_status, created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agtr_status_submitted ON agent_topup_requests(status, submitted_at DESC);`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_wallets_zero_balance ON agent_wallets(agent_id) WHERE available_balance = 0;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_accounts_active ON agent_accounts(is_active);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_transaction_id ON transactions(transaction_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_merchant_order_id ON transactions(merchant_order_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_unique_id ON transactions(unique_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_accounts_account_number ON agent_accounts(account_number);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_accounts_upi_id ON agent_accounts(upi_id);`);

    // Sandbox API keys — one payin key + one withdrawal key per merchant.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sandbox_api_keys (
        id               SERIAL PRIMARY KEY,
        merchant_id      INTEGER NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
        payin_key        TEXT    UNIQUE NOT NULL,
        withdrawal_key   TEXT    UNIQUE NOT NULL,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Make domain_name optional on clients (admin can configure it themselves)
    await pool.query(`ALTER TABLE clients ALTER COLUMN domain_name DROP NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS domain_status VARCHAR(50) DEFAULT 'Pending DNS Setup'`);

    // ── TEST MODE — generic per-client test environment ──────────────────────
    // test_mode_enabled flag on clients controls which clients have test mode.
    // is_test_merchant flag on merchants designates the single test merchant per client.
    await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS test_mode_enabled BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS is_test_merchant BOOLEAN DEFAULT false`);

    // Rename legacy masterpay-specific tables to generic names (idempotent)
    for (const [old, nu] of [
      ["test_mode_balance",     "test_mode_balance"],
      ["test_mode_withdrawals", "test_mode_withdrawals"],
      ["test_mode_payins",      "test_mode_payins"],
      ["test_mode_api_keys",    "test_mode_api_keys"],
    ]) {
      await pool.query(`
        DO $$ BEGIN
          IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='${old}')
             AND NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='${nu}') THEN
            ALTER TABLE ${old} RENAME TO ${nu};
          END IF;
        END $$;
      `).catch(() => {});
    }

    // Rename legacy index names (idempotent)
    for (const [old, nu] of [
      ["idx_test_mode_withdrawals_merchant", "idx_test_mode_withdrawals_merchant"],
      ["idx_test_mode_withdrawals_status",   "idx_test_mode_withdrawals_status"],
      ["idx_test_mode_payins_merchant",      "idx_test_mode_payins_merchant"],
      ["idx_test_mode_payins_status",        "idx_test_mode_payins_status"],
      ["idx_test_mode_payins_merchant",  "idx_test_mode_payins_merchant"],
    ]) {
      await pool.query(`ALTER INDEX IF EXISTS ${old} RENAME TO ${nu}`).catch(() => {});
    }

    // Backward compat: mark the legacy MasterPay test merchant (MP0005) as is_test_merchant
    // and enable test_mode on the masterpay.live client — safe to re-run.
    await pool.query(`
      UPDATE merchants SET is_test_merchant = true
      WHERE UPPER(username) = 'MP0005'
        AND client_id IN (SELECT id FROM clients WHERE LOWER(domain_name) = 'masterpay.live')
        AND is_test_merchant = false
    `).catch(() => {});
    await pool.query(`
      UPDATE clients SET test_mode_enabled = true
      WHERE LOWER(domain_name) = 'masterpay.live' AND test_mode_enabled = false
    `).catch(() => {});

    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_mode_balance (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE UNIQUE NOT NULL,
        client_id INTEGER REFERENCES clients(id) NOT NULL,
        balance NUMERIC DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by_role VARCHAR(50),
        updated_by_id INTEGER
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_mode_withdrawals (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(150) UNIQUE NOT NULL,
        merchant_id INTEGER REFERENCES merchants(id) NOT NULL,
        client_id INTEGER REFERENCES clients(id) NOT NULL,
        amount NUMERIC NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        upi_id VARCHAR(150) DEFAULT '',
        account_name VARCHAR(150) DEFAULT '',
        account_number VARCHAR(150) DEFAULT '',
        ifsc_code VARCHAR(100) DEFAULT '',
        webhook_url TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        status VARCHAR(50) DEFAULT 'pending',
        utr_number VARCHAR(150),
        cleared_or_rejected_date TIMESTAMP,
        actioned_by_role VARCHAR(50),
        actioned_by_id INTEGER,
        webhook_sent BOOLEAN DEFAULT false,
        webhook_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_test_mode_withdrawals_merchant ON test_mode_withdrawals(merchant_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_test_mode_withdrawals_status ON test_mode_withdrawals(status);`);
    // Test PayIn table — mirrors production PayIn lifecycle (Pending → UTR Submitted → Approved/Rejected)
    // but completely isolated from the real `transactions` table.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_mode_payins (
        id SERIAL PRIMARY KEY,
        transaction_id VARCHAR(150) UNIQUE NOT NULL,
        merchant_id INTEGER REFERENCES merchants(id) NOT NULL,
        client_id INTEGER REFERENCES clients(id) NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT DEFAULT '',
        webhook_url TEXT DEFAULT '',
        unique_id VARCHAR(200) DEFAULT '',
        utr_number VARCHAR(150),
        payment_proof TEXT DEFAULT '',
        status VARCHAR(50) DEFAULT 'Pending',
        approved_or_reject_date TIMESTAMP,
        actioned_by_role VARCHAR(50),
        actioned_by_id INTEGER,
        webhook_sent BOOLEAN DEFAULT false,
        webhook_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_test_mode_payins_merchant ON test_mode_payins(merchant_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_test_mode_payins_status ON test_mode_payins(status);`);
    // Extend test_mode_payins to mirror production checkout columns (safe to re-run)
    for (const stmt of [
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS merchant_order_id VARCHAR(200) DEFAULT ''`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT ''`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS customer_mobile TEXT DEFAULT ''`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS redirect_url TEXT DEFAULT ''`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMP`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS disputed_utr VARCHAR(150)`,
      `ALTER TABLE test_mode_payins ADD COLUMN IF NOT EXISTS utr_submitted_at TIMESTAMP`,
    ]) { await pool.query(stmt); }
    // Dedicated test API keys — one per test merchant, separate from production api_key
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_mode_api_keys (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE UNIQUE NOT NULL,
        api_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    // ── END TEST MODE TABLES ─────────────────────────────────────────────────

    console.log("Tables created successfully");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}

async function authenticateMerchantApiKey(req, res, next) {
  try {
    const apiKey = String(req.headers["x-api-key"] || "").trim();

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: "API key required",
      });
    }

    const result = await pool.query(
      `SELECT
          m.id AS merchant_id,
          m.api_key,
          m.created_by_admin_id,
          m.is_active,
          m.client_id,
          m.agent_id
       FROM merchants m
       WHERE TRIM(m.api_key) = TRIM($1)
         AND m.is_active = true
       LIMIT 1`,
      [apiKey],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid API key",
      });
    }

    req.merchantApiUser = result.rows[0];
    next();
  } catch (error) {
    console.log("Merchant API auth error:", error.message);
    return res.status(500).json({
      success: false,
      message: "API authentication failed",
    });
  }
}

// Validates a test-mode API key (x-api-key header).
// Only accepts keys from test_mode_api_keys; never falls through to production tables.
// Works for any client with test_mode_enabled = true.
// Sets req.testApiUser = { merchant_id, client_id }.
async function authenticateTestApiKey(req, res, next) {
  try {
    const key = String(req.headers["x-api-key"] || "").trim();
    if (!key)
      return res.status(401).json({ success: false, message: "Test API key required — send your test key in the x-api-key header" });

    const r = await pool.query(
      `SELECT k.merchant_id, m.client_id, m.is_active,
              c.test_mode_enabled
       FROM test_mode_api_keys k
       JOIN merchants m ON m.id = k.merchant_id
       JOIN clients c ON c.id = m.client_id
       WHERE k.api_key = $1
       LIMIT 1`,
      [key],
    );
    if (!r.rows.length)
      return res.status(401).json({ success: false, message: "Invalid test API key" });

    const row = r.rows[0];
    if (!row.is_active)
      return res.status(403).json({ success: false, message: "Merchant account is inactive" });
    if (!row.test_mode_enabled)
      return res.status(403).json({ success: false, message: "Test mode is not enabled for this client" });

    req.testApiUser = {
      merchant_id: row.merchant_id,
      client_id:   row.client_id,
    };
    next();
  } catch (err) {
    console.log("[TEST MODE] API key auth error:", err.message);
    return res.status(500).json({ success: false, message: "API authentication failed" });
  }
}

async function expireCheckoutTransaction(txnId) {
  const expired = await pool.query(
    `UPDATE transactions
     SET status = 'Expired', approved_or_reject_date = NOW()
     WHERE id = $1
       AND checkout_mode = true
       AND status = 'Pending'
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
     RETURNING *`,
    [txnId],
  );

  if (expired.rows.length === 0) return null;

  const txn = expired.rows[0];

  // max_available_limit is no longer independently decremented/refunded —
  // the agent wallet + ledger (below) is the single source of truth for
  // funded balance. The account's own daily cap (max_payment_limit vs.
  // committed_today) is unaffected either way, since it's computed live from
  // transactions.status and never depended on this counter.

  if (isWalletGateEnabled() && txn.agent_id && Number(txn.amount) > 0) {
    await withWalletTransaction((client) =>
      refundAgentWalletForPayin(client, {
        agentId: txn.agent_id,
        amount: Number(txn.amount),
        transactionId: txn.id,
        notes: "Checkout expired",
      }),
    ).catch((e) => console.error("Wallet refund error (expiry):", e.message));
  }

  fireWebhook(pool, txn, "payin.expired");
  return txn;
}

async function failVerificationTransaction(txnId) {
  const failed = await pool.query(
    `UPDATE transactions
     SET status = 'Failed', approved_or_reject_date = NOW()
     WHERE id = $1
       AND checkout_mode = true
       AND status = 'UTR Submitted'
       AND verification_expires_at IS NOT NULL
       AND verification_expires_at <= NOW()
     RETURNING *`,
    [txnId],
  );

  if (failed.rows.length === 0) return null;

  const txn = failed.rows[0];

  // See expireCheckoutTransaction() above — max_available_limit is no longer
  // independently decremented/refunded; the agent wallet is authoritative.

  if (isWalletGateEnabled() && txn.agent_id && Number(txn.amount) > 0) {
    await withWalletTransaction((client) =>
      refundAgentWalletForPayin(client, {
        agentId: txn.agent_id,
        amount: Number(txn.amount),
        transactionId: txn.id,
        notes: "UTR verification timed out",
      }),
    ).catch((e) => console.error("Wallet refund error (verification fail):", e.message));
  }

  fireWebhook(pool, txn, "payin.failed");
  return txn;
}

async function expirePendingTransactions() {
  try {
    const result = await pool.query(`
      UPDATE transactions
      SET status = 'Rejected', approved_or_reject_date = NOW()
      WHERE status = 'Pending'
        AND COALESCE(checkout_mode, false) = false
        AND created_at <= NOW() - INTERVAL '24 hours'
      RETURNING id, created_at, agent_id, amount
    `);
    if (result.rows.length > 0) console.log("Rejected:", result.rows);

    // Deliberate divergence from the old max_available_limit counter, which
    // has never refunded this particular transition (a pre-existing gap left
    // untouched per the additive-only design for the old counter). The new
    // wallet ledger does refund here — replicating a known bug into brand-new
    // financial code would be worse than this documented, intentional split.
    if (isWalletGateEnabled()) {
      for (const row of result.rows) {
        if (row.agent_id && Number(row.amount) > 0) {
          await withWalletTransaction((client) =>
            refundAgentWalletForPayin(client, {
              agentId: row.agent_id,
              amount: Number(row.amount),
              transactionId: row.id,
              notes: "24h stale-pending sweep",
            }),
          ).catch((e) => console.error("Wallet refund error (stale sweep):", e.message));
        }
      }
    }

    const dueCheckouts = await pool.query(
      `SELECT id FROM transactions
       WHERE checkout_mode = true
         AND status = 'Pending'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()`,
    );
    for (const row of dueCheckouts.rows) {
      await expireCheckoutTransaction(row.id);
    }
    if (dueCheckouts.rows.length > 0)
      console.log("Expired checkout transactions:", dueCheckouts.rows.length);

    const dueVerifications = await pool.query(
      `SELECT id FROM transactions
       WHERE checkout_mode = true
         AND status = 'UTR Submitted'
         AND verification_expires_at IS NOT NULL
         AND verification_expires_at <= NOW()`,
    );
    for (const row of dueVerifications.rows) {
      await failVerificationTransaction(row.id);
    }
    if (dueVerifications.rows.length > 0)
      console.log(
        "Failed verification transactions:",
        dueVerifications.rows.length,
      );
  } catch (err) {
    console.error("Expire pending transactions error:", err.message);
  }
}

app.get("/", (req, res) => {
  res.send("MasterPay Backend Running");
});

// ── Sandbox key management ─────────────────────────────────────────────────────
// Merchants retrieve and rotate their sandbox API keys from the dashboard.
// These endpoints require a valid merchant JWT session (same as all dashboard routes).

app.get("/api/sandbox/keys", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const mid  = Number(auth.merchantId || (auth.role === "merchant" ? auth.userId : null));
    if (!mid) return res.status(401).json({ message: "Merchant authentication required" });

    const r = await pool.query(
      `SELECT payin_key, withdrawal_key, created_at FROM sandbox_api_keys WHERE merchant_id = $1`,
      [mid],
    );
    return res.json({ keys: r.rows[0] || null });
  } catch (e) {
    console.error("Sandbox keys GET error:", e.message);
    res.status(500).json({ message: "Could not fetch sandbox keys" });
  }
});

app.post("/api/sandbox/keys", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const mid  = Number(auth.merchantId || (auth.role === "merchant" ? auth.userId : null));
    if (!mid) return res.status(401).json({ message: "Merchant authentication required" });

    const payinKey      = "sbx_pi_" + crypto.randomBytes(20).toString("hex");
    const withdrawalKey = "sbx_wi_" + crypto.randomBytes(20).toString("hex");

    const r = await pool.query(
      `INSERT INTO sandbox_api_keys (merchant_id, payin_key, withdrawal_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (merchant_id) DO UPDATE
         SET payin_key = EXCLUDED.payin_key,
             withdrawal_key = EXCLUDED.withdrawal_key,
             created_at = NOW()
       RETURNING payin_key, withdrawal_key, created_at`,
      [mid, payinKey, withdrawalKey],
    );
    return res.json({ keys: r.rows[0] });
  } catch (e) {
    console.error("Sandbox keys POST error:", e.message);
    res.status(500).json({ message: "Could not generate sandbox keys" });
  }
});

app.delete("/api/sandbox/keys", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const mid  = Number(auth.merchantId || (auth.role === "merchant" ? auth.userId : null));
    if (!mid) return res.status(401).json({ message: "Merchant authentication required" });

    await pool.query(`DELETE FROM sandbox_api_keys WHERE merchant_id = $1`, [mid]);
    return res.json({ message: "Sandbox keys deleted" });
  } catch (e) {
    console.error("Sandbox keys DELETE error:", e.message);
    res.status(500).json({ message: "Could not delete sandbox keys" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // ── Resolve which tenant (if any) this request belongs to ────────────────
    // domainClientId === null  →  main / platform domain  (MasterPay admins, client_id IS NULL)
    // domainClientId === <id>  →  client domain           (only users with that client_id)
    const domainClientId = await resolveClientIdFromHost(req);

    const userTypes = [
      {
        type: "super-admin",
        table: "super_admins",
        idField: "superAdminId",
        redirectTo: "/superadmin-dashboard",
        noClientCol: true,    // super_admins has no client_id column
        mainDomainOnly: true, // super-admins only work on the main platform domain
      },
      { type: "admin", table: "admins", idField: "adminId", redirectTo: "/" },
      {
        type: "merchant",
        table: "merchants",
        idField: "merchantId",
        redirectTo: "/merchant-dashboard",
      },
      {
        type: "agent",
        table: "agents",
        idField: "agentId",
        redirectTo: "/agent-dashboard",
      },
    ];

    let foundUser = null;
    let foundType = null;

    for (const userType of userTypes) {
      // Super-admins only accessible from the main platform domain, never from client domains
      if (userType.mainDomainOnly && domainClientId !== null) continue;

      let query, values;
      if (userType.noClientCol) {
        // super_admins table has no client_id — no tenant filter
        query = `SELECT * FROM ${userType.table} WHERE username = $1 AND is_active = true`;
        values = [username];
      } else if (domainClientId !== null) {
        // Client domain: only allow users that belong to this exact client
        query = `SELECT * FROM ${userType.table} WHERE username = $1 AND is_active = true AND client_id = $2`;
        values = [username, domainClientId];
      } else if (userType.type === "admin") {
        // Main platform domain for admins: allow (a) no client, (b) client with no domain, or (c) domain not yet Active
        query = `SELECT a.* FROM admins a LEFT JOIN clients c ON a.client_id = c.id
                 WHERE a.username = $1 AND a.is_active = true
                   AND (a.client_id IS NULL OR c.domain_name IS NULL OR COALESCE(c.domain_status,'') != 'Active')`;
        values = [username];
      } else {
        // Main platform domain: only allow users with no client assignment (client_id IS NULL)
        query = `SELECT * FROM ${userType.table} WHERE username = $1 AND is_active = true AND client_id IS NULL`;
        values = [username];
      }

      const result = await pool.query(query, values);
      if (result.rows.length > 0) {
        foundUser = result.rows[0];
        foundType = userType;
        break;
      }
    }

    if (!foundUser) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, foundUser.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Maintenance mode blocks new logins for everyone except super-admin (who
    // must always be able to log in to disable it again). Checked only after
    // credentials are confirmed valid, so a failed login looks identical
    // whether or not maintenance is on.
    if (foundType.type !== "super-admin") {
      const maintenance = await getMaintenanceStatus();
      if (maintenance.is_enabled) {
        return res.status(503).json({
          message: maintenance.message || "Platform is under maintenance. Please try again shortly.",
          maintenance: true,
        });
      }
    }

    const tokenPayload = {
      userId: foundUser.id,
      role: foundType.type,
      [foundType.idField]: foundUser.id,
      agentId:
        foundType.type === "agent" ? foundUser.id : foundUser.agent_id || null,
      merchantId:
        foundType.type === "merchant"
          ? foundUser.id
          : foundUser.merchant_id || null,
      superAdminId: foundType.type === "super-admin" ? foundUser.id : null,
      // Multi-tenant: embed client_id so every authenticated request is scoped
      clientId: foundUser.client_id || null,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    await pool.query(
      `INSERT INTO login_activity (user_id, role, username, name, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        foundUser.id,
        foundType.type,
        foundUser.username,
        foundUser.name || foundUser.username,
        req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
        req.headers["user-agent"] || "",
      ],
    );

    res.json({
      token,
      id: foundUser.id,
      userId: foundUser.id,
      name: foundUser.name || foundUser.username,
      username: foundUser.username,
      role: foundType.type,
      client_id: foundUser.client_id || null,
      clientId: foundUser.client_id || null,
      agent_id: tokenPayload.agentId,
      agentId: tokenPayload.agentId,
      merchant_id: tokenPayload.merchantId,
      merchantId: tokenPayload.merchantId,
      redirectTo: foundType.redirectTo,
    });
  } catch (error) {
    console.log("Login error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ─── PUBLIC: SELF-SERVICE SIGNUP (Agent / Merchant only) ─────────────────────
// Never allows role "admin" or "super-admin" — that is the hard security
// control here. The new account is associated with the single default Admin
// (and that admin's tenant), matching "one default Admin for now".
app.post("/api/signup", async (req, res) => {
  try {
    const role = String(req.body?.role || "").trim().toLowerCase();
    if (role !== "agent" && role !== "merchant") {
      return res.status(400).json({ message: "role must be 'agent' or 'merchant'" });
    }

    const name = cleanText(req.body?.name);
    const username = cleanText(req.body?.username);
    const password = String(req.body?.password || "");

    if (!name) return res.status(400).json({ message: "Name is required" });
    if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
      return res.status(400).json({ message: "Username must be 3-50 characters (letters, numbers, dot, underscore, hyphen only)" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const defaultAdmin = await pool.query(
      `SELECT id, client_id FROM admins ORDER BY id ASC LIMIT 1`,
    );
    if (defaultAdmin.rows.length === 0) {
      return res.status(503).json({ message: "No default admin is configured yet. Please try again shortly." });
    }
    const { id: adminId, client_id: clientId } = defaultAdmin.rows[0];

    await assertUniqueUsername(username, role, null, clientId);

    const hashedPassword = await bcrypt.hash(password, 10);

    if (role === "agent") {
      const result = await pool.query(
        `INSERT INTO agents (name, commission_percent, max_payment_limit, min_transaction_amount, created_by_admin_id, username, password, plain_password, is_active, client_id)
         VALUES ($1, 0, 0, 0, $2, $3, $4, NULL, true, $5)
         RETURNING id, name, username`,
        [name, adminId, username, hashedPassword, clientId],
      );
      const agent = result.rows[0];
      await ensureAgentWallet(agent.id);
      return res.status(201).json({ id: agent.id, role: "agent", username: agent.username });
    }

    // role === "merchant": every merchant is directly API-ready (token/api_key
    // moved here from the old merchants table — see authenticateMerchantApiKey).
    const token = crypto.randomBytes(32).toString("hex");
    const apiKey = crypto.randomBytes(32).toString("hex");
    const result = await pool.query(
      `INSERT INTO merchants (name, commission_percent, agent_id, created_by_admin_id, username, password, plain_password, is_active, client_id, token, api_key)
       VALUES ($1, 0, NULL, $2, $3, $4, NULL, true, $5, $6, $7)
       RETURNING id, name, username`,
      [name, adminId, username, hashedPassword, clientId, token, apiKey],
    );
    const merchant = result.rows[0];
    return res.status(201).json({ id: merchant.id, role: "merchant", username: merchant.username });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.log("Signup error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

// ─── PUBLIC: DOMAIN-BASED CLIENT BRANDING CONFIG ─────────────────────────────
app.get("/api/public/client-config", async (req, res) => {
  try {
    const host = (req.headers["x-forwarded-host"] || req.headers.host || req.hostname || "").replace(/:\d+$/, "").toLowerCase().trim();
    const result = await pool.query(
      `SELECT company_name, logo_url, theme_color FROM clients WHERE LOWER(domain_name) = $1 AND status = 'Active' LIMIT 1`,
      [host]
    );
    if (result.rows.length === 0) {
      return res.json({ company_name: null, logo_url: null, theme_color: null });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Client config error:", error);
    res.json({ company_name: null, logo_url: null, theme_color: null });
  }
});

// ─── SUPER ADMIN: CLIENTS CRUD ────────────────────────────────────────────────
function requireSuperAdmin2(req, res, next) {
  const auth = getAuthUser(req);
  if (auth.role !== "super-admin") return res.status(403).json({ message: "Superadmin only" });
  next();
}

app.get("/api/superadmin/clients", requireSuperAdmin2, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM clients ORDER BY id DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Could not fetch clients" });
  }
});

app.post("/api/superadmin/clients", requireSuperAdmin2, upload.single("logo"), async (req, res) => {
  try {
    const { company_name, domain_name, theme_color, status } = req.body;
    if (!company_name || !company_name.trim()) return res.status(400).json({ message: "Company name is required" });
    if (!domain_name || !domain_name.trim()) return res.status(400).json({ message: "Domain name is required" });

    const normalizedDomain = domain_name.toLowerCase().trim();

    let logo_url = null;
    if (req.file) {
      const fs = require("fs");
      const uploadDir = path.join(__dirname, "uploads", "logos");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filename = `logo_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      logo_url = `/uploads/logos/${filename}`;
    }

    const client = await pool.query(
      `INSERT INTO clients (company_name, domain_name, logo_url, theme_color, status, domain_status)
       VALUES ($1, $2, $3, $4, $5, 'Pending DNS Setup') RETURNING *`,
      [company_name.trim(), normalizedDomain, logo_url, theme_color || "#2B7DE9", status || "Active"]
    );
    const newClient = client.rows[0];

    res.json(newClient);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Domain name already exists" });
    console.log("Create client error:", error);
    res.status(500).json({ message: "Could not create client" });
  }
});

app.put("/api/superadmin/clients/:id", requireSuperAdmin2, upload.single("logo"), async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, domain_name, theme_color, status } = req.body;

    if (!company_name || !company_name.trim()) return res.status(400).json({ message: "Company name is required" });
    if (!domain_name || !domain_name.trim()) return res.status(400).json({ message: "Domain name is required" });

    const normalizedDomain = domain_name.toLowerCase().trim();

    let logoClause = "";
    const values = [company_name.trim(), normalizedDomain, theme_color, status];

    if (req.file) {
      const fs = require("fs");
      const uploadDir = path.join(__dirname, "uploads", "logos");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filename = `logo_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      values.push(`/uploads/logos/${filename}`);
      logoClause = `, logo_url = $${values.length}`;
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE clients SET company_name=$1, domain_name=$2, theme_color=$3, status=$4, updated_at=NOW() ${logoClause} WHERE id=$${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Client not found" });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Domain name already exists" });
    res.status(500).json({ message: "Could not update client" });
  }
});

app.get("/api/superadmin/clients/:id", requireSuperAdmin2, async (req, res) => {
  try {
    const client = await pool.query(`SELECT * FROM clients WHERE id=$1`, [req.params.id]);
    if (client.rows.length === 0) return res.status(404).json({ message: "Client not found" });
    const admins = await pool.query(
      `SELECT id, username, plain_password, is_active, created_at FROM admins WHERE client_id=$1 ORDER BY id DESC`,
      [req.params.id]
    );
    res.json({ ...client.rows[0], admins: admins.rows });
  } catch (error) {
    res.status(500).json({ message: "Could not fetch client" });
  }
});

// ─── ADMIN: DOMAIN CONFIG (self-service) ─────────────────────────────────────
// Admins who have a client_id can view and update their own domain configuration.

const SERVER_IP = "157.245.245.53";

function requireAdminWithClient(req, res, next) {
  const auth = getAuthUser(req);
  if (auth.role !== "admin") return res.status(403).json({ message: "Admin only" });
  if (!auth.clientId) return res.status(403).json({ message: "This admin is not associated with a client" });
  next();
}

app.get("/api/admin/domain-config", requireAdminWithClient, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const result = await pool.query(`SELECT * FROM clients WHERE id = $1`, [auth.clientId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Client not found" });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Could not load domain config" });
  }
});

app.put("/api/admin/domain-config", requireAdminWithClient, upload.single("logo"), async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const { domain_name, company_name, theme_color } = req.body;

    if (!company_name || !company_name.trim())
      return res.status(400).json({ message: "Company name is required" });
    if (!domain_name || !domain_name.trim())
      return res.status(400).json({ message: "Domain name is required" });

    const normalizedDomain = domain_name.toLowerCase().trim()
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "");

    const hostRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
    if (!hostRegex.test(normalizedDomain))
      return res.status(400).json({ message: "Invalid domain format. Use a bare hostname like pay.example.com" });

    // Check domain uniqueness (exclude own client)
    const conflict = await pool.query(
      `SELECT id FROM clients WHERE LOWER(domain_name) = $1 AND id <> $2 LIMIT 1`,
      [normalizedDomain, auth.clientId]
    );
    if (conflict.rows.length > 0)
      return res.status(409).json({ message: "This domain is already in use by another client" });

    let logoClause = "";
    const values = [company_name.trim(), normalizedDomain, theme_color || "#2B7DE9"];

    if (req.file) {
      const fsModule = require("fs");
      const uploadDir = path.join(__dirname, "uploads", "logos");
      if (!fsModule.existsSync(uploadDir)) fsModule.mkdirSync(uploadDir, { recursive: true });
      const filename = `logo_${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      fsModule.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      values.push(`/uploads/logos/${filename}`);
      logoClause = `, logo_url = $${values.length}`;
    }

    // Reset domain_status to Pending when domain changes
    const existing = await pool.query(`SELECT domain_name FROM clients WHERE id = $1`, [auth.clientId]);
    const oldDomain = existing.rows[0]?.domain_name || null;
    const domainChanged = oldDomain !== normalizedDomain;

    let statusClause = "";
    if (domainChanged) {
      values.push("Pending DNS Setup");
      statusClause = `, domain_status = $${values.length}`;
    }

    values.push(auth.clientId);
    const result = await pool.query(
      `UPDATE clients SET company_name=$1, domain_name=$2, theme_color=$3, updated_at=NOW() ${logoClause} ${statusClause} WHERE id=$${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Client not found" });
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ message: "Domain name is already taken" });
    console.log("Admin domain-config update error:", error);
    res.status(500).json({ message: "Could not update domain config" });
  }
});

app.post("/api/admin/domain-config/verify", requireAdminWithClient, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const clientRow = await pool.query(`SELECT domain_name FROM clients WHERE id = $1`, [auth.clientId]);
    if (clientRow.rows.length === 0) return res.status(404).json({ message: "Client not found" });

    const domain = clientRow.rows[0].domain_name;
    if (!domain) return res.status(400).json({ message: "No domain configured. Set a domain before verifying." });

    let newStatus = "Verification Failed";
    let resolvedIps = [];
    try {
      const addresses = await dns.promises.resolve4(domain);
      resolvedIps = addresses;
      if (addresses.includes(SERVER_IP)) newStatus = "Active";
    } catch {
      newStatus = "Verification Failed";
    }

    await pool.query(`UPDATE clients SET domain_status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, auth.clientId]);
    res.json({ status: newStatus, resolved_ips: resolvedIps, expected_ip: SERVER_IP });
  } catch (error) {
    console.log("Domain verify error:", error);
    res.status(500).json({ message: "Verification failed" });
  }
});

// ─── SUPER ADMIN: ADMINS (scoped to a client) ─────────────────────────────────
// These override the existing /api/superadmin/admins endpoints below to add client_id support

// ─── SUPER ADMIN ──────────────────────────────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  const auth = getAuthUser(req);
  if (auth.role !== "super-admin") {
    return res.status(403).json({ message: "Superadmin only" });
  }
  next();
}

app.get("/api/superadmin/admins", requireSuperAdmin, async (req, res) => {
  try {
    const { client_id } = req.query;
    const values = client_id ? [client_id] : [];
    const where = client_id ? "WHERE a.client_id = $1" : "";
    const result = await pool.query(`
      SELECT a.id, a.username, a.plain_password, a.is_active, a.created_at, a.client_id,
             c.company_name AS client_name
      FROM admins a
      LEFT JOIN clients c ON a.client_id = c.id
      ${where}
      ORDER BY a.id DESC
    `, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Superadmin list admins error:", error);
    res.status(500).json({ message: "Could not fetch admins" });
  }
});

app.post("/api/superadmin/admins", requireSuperAdmin, async (req, res) => {
  res.status(409).json({ message: "MasterPay has one default Admin. Edit the existing Admin instead." });
});

app.put("/api/superadmin/admins/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, is_active } = req.body || {};

    if (!username)
      return res.status(400).json({ message: "username is required" });

    let result;
    if (password && String(password).trim()) {
      const hashed = await bcrypt.hash(password, 10);
      result = await pool.query(
        `UPDATE admins SET username = $1, password = $2, plain_password = $3, is_active = $4
         WHERE id = $5 RETURNING id, username, plain_password, is_active, created_at`,
        [username, hashed, password, is_active !== false, id],
      );
    } else {
      result = await pool.query(
        `UPDATE admins SET username = $1, is_active = $2
         WHERE id = $3 RETURNING id, username, plain_password, is_active, created_at`,
        [username, is_active !== false, id],
      );
    }

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Admin not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Superadmin update admin error:", error);
    if (error.code === "23505")
      return res.status(409).json({ message: "Username already exists" });
    res.status(500).json({ message: "Could not update admin" });
  }
});

app.get(
  "/api/superadmin/admins/:id/report",
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const adminRow = await pool.query(
        `SELECT id, username, plain_password, is_active, created_at FROM admins WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (adminRow.rows.length === 0)
        return res.status(404).json({ message: "Admin not found" });

      const [
        agents,
        merchants,
        transactions,
        settlementTransactions,
      ] = await Promise.all([
        pool.query(
          `SELECT id, name, username, plain_password, is_active, created_at FROM agents WHERE created_by_admin_id = $1 ORDER BY id DESC`,
          [id],
        ),
        pool.query(
          `SELECT id, name, username, plain_password, agent_id, is_active, created_at FROM merchants WHERE created_by_admin_id = $1 ORDER BY id DESC`,
          [id],
        ),
        pool.query(
          `SELECT id, transaction_id, amount, utr_number, status, bank_name, account_number, merchant_id, agent_id, created_at, approved_or_reject_date FROM transactions WHERE created_by_admin_id = $1 ORDER BY id DESC`,
          [id],
        ),
        pool.query(
          `SELECT id, amount, utr_number, transaction_status, bank_name, account_number, merchant_id, agent_id, created_at, approved_or_reject_date FROM settlement_transactions WHERE created_by_admin_id = $1 ORDER BY id DESC`,
          [id],
        ),
      ]);

      const approvedVolume = transactions.rows
        .filter((t) => String(t.status) === "Approved")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const pendingCount = transactions.rows.filter((t) =>
        ["Pending", "UTR Submitted"].includes(String(t.status)),
      ).length;

      const summary = [
        { Metric: "Admin", Value: adminRow.rows[0].username },
        { Metric: "Admin Created", Value: adminRow.rows[0].created_at },
        { Metric: "Agents", Value: agents.rows.length },
        { Metric: "Merchants", Value: merchants.rows.length },
        { Metric: "Total Transactions", Value: transactions.rows.length },
        { Metric: "Approved Volume (INR)", Value: approvedVolume },
        { Metric: "Pending/UTR Submitted Count", Value: pendingCount },
        {
          Metric: "Settlement Transactions",
          Value: settlementTransactions.rows.length,
        },
        { Metric: "Report Generated At", Value: new Date().toISOString() },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(summary),
        "Summary",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(agents.rows.length ? agents.rows : [{}]),
        "Agents",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(merchants.rows.length ? merchants.rows : [{}]),
        "Merchants",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          transactions.rows.length ? transactions.rows : [{}],
        ),
        "Transactions",
      );
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          settlementTransactions.rows.length
            ? settlementTransactions.rows
            : [{}],
        ),
        "Settlements",
      );

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const safeName = (adminRow.rows[0].username || `admin-${id}`).replace(
        /[^a-z0-9_-]/gi,
        "_",
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="report-${safeName}-${id}.xlsx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.log("Superadmin report error:", error);
      res.status(500).json({ message: "Could not generate report" });
    }
  },
);

app.get("/api/superadmin/summary", requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Same IST-day-bounded date filter pattern used by the other dashboard
    // summary endpoints (see addDateFilter in /api/admin-dashboard). Only
    // applied to activity metrics (transaction count/volume) — roster counts
    // (admins/agents/merchants) intentionally stay all-time running totals
    // regardless of the selected period.
    const txnValues = [];
    let txnDateFilter = "";
    if (startDate && endDate) {
      txnValues.push(startDate, endDate);
      txnDateFilter = ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $${txnValues.length - 1} AND $${txnValues.length}`;
    } else if (startDate) {
      txnValues.push(startDate);
      txnDateFilter = ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${txnValues.length}`;
    } else if (endDate) {
      txnValues.push(endDate);
      txnDateFilter = ` AND DATE(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${txnValues.length}`;
    }

    const [admins, totals] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::INT AS count FROM admins WHERE is_active = true`,
      ),
      pool.query(
        `SELECT
          (SELECT COUNT(*) FROM agents)::INT AS agents,
          (SELECT COUNT(*) FROM merchants)::INT AS merchants,
          (SELECT COUNT(*) FROM transactions WHERE true${txnDateFilter})::INT AS transactions,
          (SELECT COALESCE(SUM(amount), 0)::NUMERIC FROM transactions WHERE status = 'Approved'${txnDateFilter}) AS approved_volume
        `,
        txnValues,
      ),
    ]);

    res.json({
      active_admins: admins.rows[0].count,
      ...totals.rows[0],
    });
  } catch (error) {
    console.log("Superadmin summary error:", error);
    res.status(500).json({ message: "Could not fetch summary" });
  }
});

// Shared IST-day-bounded date filter — same 3-branch shape duplicated
// throughout this file (e.g. the txnDateFilter block just above, and
// /api/admin-dashboard's addDateFilter). Centralized here since the new
// Super Admin control-center endpoints below need this exact pattern
// repeatedly. Mutates `values` in place (pushes the bound params) and
// returns the SQL fragment to append after a WHERE/AND.
function buildIstDateFilter(values, startDate, endDate, column = "created_at") {
  if (startDate && endDate) {
    values.push(startDate, endDate);
    return ` AND DATE(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $${values.length - 1} AND $${values.length}`;
  }
  if (startDate) {
    values.push(startDate);
    return ` AND DATE(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${values.length}`;
  }
  if (endDate) {
    values.push(endDate);
    return ` AND DATE(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${values.length}`;
  }
  return "";
}

// ─── SUPER ADMIN CONTROL CENTER ────────────────────────────────────────────────
// The 8 top summary cards. Deliberately a NEW route rather than extending
// /api/superadmin/summary above — that endpoint's shape (roster counts) is
// already consumed as-is by the redesigned dashboard's smaller "Platform
// Roster" strip, so leaving it untouched avoids any risk to that call site.
// Core query logic factored out so the export endpoint (§export/financial-overview)
// reuses the exact same SQL/formulas instead of duplicating them.
async function computeFinancialSummary(startDate, endDate, clientId) {
    const payinValues = [];
    const payinFilter = buildIstDateFilter(payinValues, startDate, endDate);
    const wdValues = [];
    const wdFilter = buildIstDateFilter(wdValues, startDate, endDate, "w.created_at");
    const stValues = [];
    const stFilter = buildIstDateFilter(stValues, startDate, endDate);
    const topupValues = [];
    const topupFilter = buildIstDateFilter(topupValues, startDate, endDate, "submitted_at");
    const payinCommissionValues = [];
    const payinCommissionFilter = buildIstDateFilter(payinCommissionValues, startDate, endDate, "t.created_at");
    const payoutCommissionValues = [];
    const payoutCommissionFilter = buildIstDateFilter(payoutCommissionValues, startDate, endDate, "wt.created_at");

    // Optional client_id filter (the one "advanced filter" wired end-to-end
    // from FiltersBar). transactions/settlement_transactions/
    // agent_topup_requests carry client_id directly; withdrawal_transactions
    // does not, so those two queries join merchants to reach it.
    let clientPayinClause = "", clientStClause = "", clientTopupClause = "", clientWdClause = "", clientPayoutCommClause = "";
    if (clientId) {
      payinValues.push(clientId);
      clientPayinClause = ` AND client_id = $${payinValues.length}`;
      stValues.push(clientId);
      clientStClause = ` AND client_id = $${stValues.length}`;
      topupValues.push(clientId);
      clientTopupClause = ` AND client_id = $${topupValues.length}`;
      wdValues.push(clientId);
      clientWdClause = ` AND m.client_id = $${wdValues.length}`;
      payoutCommissionValues.push(clientId);
      clientPayoutCommClause = ` AND m.client_id = $${payoutCommissionValues.length}`;
    }

    const [payinResult, wdResult, stResult, topupResult, payinCommissionResult, payoutCommissionResult] =
      await Promise.all([
        pool.query(
          `SELECT
             COALESCE(SUM(CASE WHEN status='Approved' THEN amount ELSE 0 END),0) AS payin_received,
             COUNT(CASE WHEN status='Approved' THEN 1 END) AS successful_count,
             COUNT(CASE WHEN status IN ('Approved','Rejected','Failed','Expired') THEN 1 END) AS finalized_count
           FROM transactions WHERE true${payinFilter}${clientPayinClause}`,
          payinValues,
        ),
        pool.query(
          `SELECT COALESCE(SUM(CASE WHEN w.status='cleared' THEN w.amount ELSE 0 END),0) AS withdrawals_sent
           FROM withdrawal_transactions w
           LEFT JOIN merchants m ON m.id = w.merchant_id
           WHERE true${wdFilter}${clientWdClause}`,
          wdValues,
        ),
        pool.query(
          `SELECT
             COUNT(CASE WHEN transaction_status='Pending' THEN 1 END) AS pending_settlements_count,
             COALESCE(SUM(CASE WHEN transaction_status='Approved' THEN amount ELSE 0 END),0) AS settlements_approved
           FROM settlement_transactions WHERE true${stFilter}${clientStClause}`,
          stValues,
        ),
        pool.query(
          `SELECT COALESCE(SUM(CASE WHEN status='Approved' THEN amount ELSE 0 END),0) AS approved_topups
           FROM agent_topup_requests WHERE true${topupFilter}${clientTopupClause}`,
          topupValues,
        ),
        // Gross payin commission collected — merchants.commission_percent × Approved
        // payin amount. Deliberately the gross figure, NOT /api/admin-dashboard's
        // adminCommission (= merchant commission − agent's share): that formula nets
        // out the agent's cut, which is right for one admin's own margin but wrong
        // here — the agent's share is still money the platform collected, just
        // redistributed afterward. See the "Total Commission Earned" tooltip text.
        pool.query(
          `SELECT COALESCE(SUM(t.amount * (m.commission_percent/100.0)),0) AS payin_commission
           FROM transactions t JOIN merchants m ON m.id = t.merchant_id
           WHERE t.status='Approved'${payinCommissionFilter}${clientId ? ` AND m.client_id = $${payinCommissionValues.length + 1}` : ""}`,
          clientId ? [...payinCommissionValues, clientId] : payinCommissionValues,
        ),
        pool.query(
          `SELECT COALESCE(SUM(wt.amount * (COALESCE(wmc.commission_percent,0)/100.0)),0) AS payout_commission
           FROM withdrawal_transactions wt
           LEFT JOIN withdrawal_merchant_configs wmc ON wmc.merchant_id = wt.merchant_id
           LEFT JOIN merchants m ON m.id = wt.merchant_id
           WHERE wt.status='cleared'${payoutCommissionFilter}${clientPayoutCommClause}`,
          payoutCommissionValues,
        ),
      ]);

    const payinReceived = Number(payinResult.rows[0].payin_received);
    const withdrawalsSent = Number(wdResult.rows[0].withdrawals_sent);
    const settlementsApproved = Number(stResult.rows[0].settlements_approved);
    const successfulCount = Number(payinResult.rows[0].successful_count);
    const finalizedCount = Number(payinResult.rows[0].finalized_count);
    const totalCommissionEarned =
      Number(payinCommissionResult.rows[0].payin_commission) +
      Number(payoutCommissionResult.rows[0].payout_commission);

    return {
      payin_received: payinReceived,
      withdrawals_sent: withdrawalsSent,
      pending_settlements_count: Number(stResult.rows[0].pending_settlements_count),
      approved_topups: Number(topupResult.rows[0].approved_topups),
      total_commission_earned: totalCommissionEarned,
      // Pure cash movement — kept separate from Total Commission Earned so nothing
      // double-counts (commission is a fee *inside* payin volume, not an
      // independent cash flow).
      net_platform_movement: payinReceived - withdrawalsSent - settlementsApproved,
      successful_transactions: successfulCount,
      // Real ratio (approved / finalized), unlike every other "successRate" in this
      // codebase which is a fake approvedCount>0?100:0 binary flag. Finalized =
      // terminal states only (Approved/Rejected/Failed/Expired); Pending/UTR
      // Submitted/Disputed are excluded from the denominator as still in-progress.
      success_rate: finalizedCount > 0 ? Math.round((successfulCount / finalizedCount) * 10000) / 100 : 0,
    };
}

app.get("/api/superadmin/summary/financial", requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate, client_id } = req.query;
    const summary = await computeFinancialSummary(startDate, endDate, client_id ? Number(client_id) : null);
    res.json(summary);
  } catch (error) {
    console.error("Superadmin financial summary error:", error);
    res.status(500).json({ message: "Could not fetch financial summary" });
  }
});

// Money In vs Money Out, day-bucketed (IST). Week/month rollup happens
// client-side by summing day buckets — the only date-grouping convention that
// exists anywhere in this codebase (see getDailyReportData's TOTAL row).
async function computeMoneyFlow(startDate, endDate) {
    const [inResult, outWdResult, outStResult] = await Promise.all([
      pool.query(
        `SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS day,
                COALESCE(SUM(amount),0) AS amount
         FROM transactions
         WHERE status='Approved'
           AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
         GROUP BY 1 ORDER BY 1`,
        [startDate, endDate],
      ),
      pool.query(
        `SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS day,
                COALESCE(SUM(amount),0) AS amount
         FROM withdrawal_transactions
         WHERE status='cleared'
           AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
         GROUP BY 1 ORDER BY 1`,
        [startDate, endDate],
      ),
      pool.query(
        `SELECT (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS day,
                COALESCE(SUM(amount),0) AS amount
         FROM settlement_transactions
         WHERE transaction_status='Approved'
           AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
         GROUP BY 1 ORDER BY 1`,
        [startDate, endDate],
      ),
    ]);

    const dayKey = (d) => {
      const dt = new Date(d);
      return dt.toISOString().slice(0, 10);
    };
    const dayMap = new Map();
    for (const row of inResult.rows) {
      const k = dayKey(row.day);
      dayMap.set(k, { day: k, money_in: Number(row.amount), money_out: 0 });
    }
    for (const row of outWdResult.rows) {
      const k = dayKey(row.day);
      const entry = dayMap.get(k) || { day: k, money_in: 0, money_out: 0 };
      entry.money_out += Number(row.amount);
      dayMap.set(k, entry);
    }
    for (const row of outStResult.rows) {
      const k = dayKey(row.day);
      const entry = dayMap.get(k) || { day: k, money_in: 0, money_out: 0 };
      entry.money_out += Number(row.amount);
      dayMap.set(k, entry);
    }

    const daysOut = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
    return daysOut;
}

app.get("/api/superadmin/money-flow", requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate)
      return res.status(400).json({ message: "startDate and endDate are required" });

    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(days) || days < 0 || days > 180)
      return res.status(400).json({ message: "Date range must be between 0 and 180 days" });

    const daysOut = await computeMoneyFlow(startDate, endDate);
    res.json({ days: daysOut });
  } catch (error) {
    console.error("Superadmin money-flow error:", error);
    res.status(500).json({ message: "Could not fetch money flow" });
  }
});

// Needs Attention — one Promise.all of small, targeted counts. Each item
// carries a filter_link so the frontend can deep-link straight to the
// correctly-filtered underlying list.
async function computeNeedsAttention() {
    const [
      pendingTopups, pendingWithdrawals, pendingSettlements,
      disputedPayins, disputedWithdrawals, failedWebhooks,
      lowBalanceAgents, inactiveAccounts, failedExpiredPayins,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::INT AS count FROM agent_topup_requests WHERE status = 'Pending'`),
      pool.query(`SELECT COUNT(*)::INT AS count FROM withdrawal_transactions WHERE status IN ('pending','picked')`),
      pool.query(`SELECT COUNT(*)::INT AS count FROM settlement_transactions WHERE transaction_status = 'Pending'`),
      pool.query(`SELECT COUNT(*)::INT AS count FROM transactions WHERE status = 'Disputed'`),
      pool.query(`SELECT COUNT(*)::INT AS count FROM withdrawal_transactions WHERE merchant_disputed_at IS NOT NULL`),
      // 7-day window: webhook_sent/webhook_response are write-once with no retry
      // mechanism (see fireWebhook()) — an unbounded count would accumulate every
      // historical failure forever, including ones from integrations fixed months
      // ago. 7 days keeps this an actionable "needs attention now" signal.
      pool.query(`
        SELECT COUNT(*)::INT AS count FROM transactions
        WHERE webhook_sent = false AND webhook_url IS NOT NULL AND webhook_url <> ''
          AND created_at >= NOW() - INTERVAL '7 days'
      `),
      // Exact-zero, not "below X": a zero-balance agent is already fully
      // blocked from new Pay-Ins by the wallet-gate logic (debitAgentWalletForPayin)
      // — the one unambiguous, already-consequential threshold, unlike an
      // arbitrary "below ₹N" with no existing precedent to anchor to.
      pool.query(`SELECT COUNT(*)::INT AS count FROM agent_wallets WHERE available_balance = 0`),
      pool.query(`SELECT COUNT(*)::INT AS count FROM agent_accounts WHERE is_active = false`),
      pool.query(`
        SELECT COUNT(*)::INT AS count FROM transactions
        WHERE status IN ('Failed','Expired') AND created_at >= NOW() - INTERVAL '7 days'
      `),
    ]);

    const items = [
      { key: "pending_topups", label: "Pending Agent Top-Ups", count: pendingTopups.rows[0].count, filter_link: "/superadmin/agent-topups?status=Pending" },
      { key: "pending_withdrawals", label: "Pending / Processing Withdrawals", count: pendingWithdrawals.rows[0].count, filter_link: "/withdrawal/transactions?status=pending" },
      { key: "pending_settlements", label: "Pending Settlement Approvals", count: pendingSettlements.rows[0].count, filter_link: "/superadmin-dashboard?breakdown=pending_settlements" },
      { key: "disputed_payins", label: "Disputed Pay-Ins", count: disputedPayins.rows[0].count, filter_link: "/superadmin-dashboard?breakdown=disputed_payins" },
      { key: "disputed_withdrawals", label: "Disputed Withdrawals", count: disputedWithdrawals.rows[0].count, filter_link: "/withdrawal/transactions?disputed=true" },
      { key: "failed_webhooks", label: "Failed Webhooks (7 days)", count: failedWebhooks.rows[0].count, filter_link: "/superadmin-dashboard?breakdown=failed_webhooks" },
      { key: "low_balance_agents", label: "Agents With Zero Balance", count: lowBalanceAgents.rows[0].count, filter_link: "/superadmin/agent-topups" },
      { key: "inactive_accounts", label: "Inactive Bank Accounts", count: inactiveAccounts.rows[0].count, filter_link: "/superadmin-dashboard?breakdown=inactive_accounts" },
      { key: "failed_expired_payins", label: "Failed / Expired Pay-Ins (7 days)", count: failedExpiredPayins.rows[0].count, filter_link: "/superadmin-dashboard?breakdown=failed_expired_payins" },
    ];

    return { items, total: items.reduce((sum, i) => sum + i.count, 0) };
}

// Integrity check: agent_wallets.available_balance must always equal
// SUM(agent_wallet_ledger.amount) for that agent, by invariant — every
// wallet mutation is a locked UPDATE + matching ledger INSERT inside the same
// transaction (see debitAgentWalletForPayin / refundAgentWalletForPayin
// / redebitAgentWalletForPayin / the top-up approval route). This should
// always return an empty list in correct operation; a non-empty result means
// the invariant was violated somewhere and needs investigating.
app.get("/api/superadmin/wallet-reconciliation", requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ow.agent_id, o.name, o.username, ow.available_balance,
             COALESCE(led.ledger_sum, 0) AS ledger_sum,
             ow.available_balance - COALESCE(led.ledger_sum, 0) AS drift
      FROM agent_wallets ow
      JOIN agents o ON o.id = ow.agent_id
      LEFT JOIN (
        SELECT agent_id, SUM(amount) AS ledger_sum
        FROM agent_wallet_ledger GROUP BY agent_id
      ) led ON led.agent_id = ow.agent_id
      WHERE ow.available_balance <> COALESCE(led.ledger_sum, 0)
      ORDER BY ow.agent_id
    `);
    res.json({ mismatches: result.rows, reconciled: result.rows.length === 0 });
  } catch (error) {
    console.error("Wallet reconciliation error:", error);
    res.status(500).json({ message: "Could not run wallet reconciliation check" });
  }
});

app.get("/api/superadmin/needs-attention", requireSuperAdmin, async (req, res) => {
  try {
    const result = await computeNeedsAttention();
    res.json(result);
  } catch (error) {
    console.error("Superadmin needs-attention error:", error);
    res.status(500).json({ message: "Could not fetch needs-attention data" });
  }
});

// Recent Financial Activity — merges the 5 relevant source tables (never a
// UNION, different column shapes), tagged by type, sorted by timestamp in
// JS. "Commission" is not a feed-row type (no commission-event table exists
// anywhere in the schema) — it's a computed sub-field on payin/withdrawal
// rows instead. "Refunds" surface via agent_wallet_ledger PAYIN_REFUND
// entries (withdrawal refunds already appear as status='refunded' rows in
// the withdrawal query, no extra query needed).
async function computeActivityFeed(limit) {
    const [payins, withdrawals, settlements, topups, refunds] = await Promise.all([
      pool.query(
        `SELECT t.id, t.transaction_id, t.amount, t.status, t.merchant_id, m.name AS merchant_name, t.created_at,
                (t.amount * COALESCE(m.commission_percent,0) / 100.0) AS commission_amount
         FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
         ORDER BY t.created_at DESC LIMIT $1`,
        [limit],
      ),
      pool.query(
        `SELECT w.id, w.amount, w.status, w.merchant_id, m.name AS merchant_name, w.created_at,
                (w.amount * COALESCE(wmc.commission_percent,0) / 100.0) AS commission_amount
         FROM withdrawal_transactions w
         LEFT JOIN merchants m ON m.id = w.merchant_id
         LEFT JOIN withdrawal_merchant_configs wmc ON wmc.merchant_id = w.merchant_id
         ORDER BY w.created_at DESC LIMIT $1`,
        [limit],
      ),
      pool.query(
        `SELECT s.id, s.amount, s.transaction_status AS status, s.merchant_id, m.name AS merchant_name, s.created_at
         FROM settlement_transactions s LEFT JOIN merchants m ON m.id = s.merchant_id
         ORDER BY s.created_at DESC LIMIT $1`,
        [limit],
      ),
      pool.query(
        `SELECT ot.id, ot.amount, ot.status, ot.agent_id, o.name AS agent_name, ot.submitted_at AS created_at
         FROM agent_topup_requests ot LEFT JOIN agents o ON o.id = ot.agent_id
         ORDER BY ot.submitted_at DESC LIMIT $1`,
        [limit],
      ),
      pool.query(
        `SELECT owl.id, owl.amount, owl.agent_id, o.name AS agent_name, owl.created_at
         FROM agent_wallet_ledger owl LEFT JOIN agents o ON o.id = owl.agent_id
         WHERE owl.entry_type = 'PAYIN_REFUND'
         ORDER BY owl.created_at DESC LIMIT $1`,
        [limit],
      ),
    ]);

    const feed = [
      ...payins.rows.map((r) => ({
        type: "payin", id: r.id, ref: r.transaction_id, amount: Number(r.amount), status: r.status,
        entity_name: r.merchant_name, commission_amount: Number(r.commission_amount || 0), created_at: r.created_at,
      })),
      ...withdrawals.rows.map((r) => ({
        type: "withdrawal", id: r.id, amount: Number(r.amount), status: r.status,
        entity_name: r.merchant_name, commission_amount: Number(r.commission_amount || 0), created_at: r.created_at,
      })),
      ...settlements.rows.map((r) => ({
        type: "settlement", id: r.id, amount: Number(r.amount), status: r.status,
        entity_name: r.merchant_name, created_at: r.created_at,
      })),
      ...topups.rows.map((r) => ({
        type: "topup", id: r.id, amount: Number(r.amount), status: r.status,
        entity_name: r.agent_name, created_at: r.created_at,
      })),
      ...refunds.rows.map((r) => ({
        type: "wallet_refund", id: r.id, amount: Number(r.amount), status: "Refunded",
        entity_name: r.agent_name, created_at: r.created_at,
      })),
    ];

    feed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return feed.slice(0, limit);
}

app.get("/api/superadmin/activity-feed", requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const items = await computeActivityFeed(limit);
    res.json({ items });
  } catch (error) {
    console.error("Superadmin activity-feed error:", error);
    res.status(500).json({ message: "Could not fetch activity feed" });
  }
});

// Export the filtered system overview as a multi-sheet XLSX workbook — reuses
// the exact XLSX.utils.book_new()/json_to_sheet()/XLSX.write() template
// already established at GET /api/superadmin/admins/:id/report above, and
// the same computeFinancialSummary/computeMoneyFlow/computeNeedsAttention/
// computeActivityFeed functions the live dashboard endpoints use — so the
// export can never drift from what's on screen. PDF needs no backend route:
// the frontend reuses the existing client-side print-to-PDF pattern from
// DailyReportContent.jsx (window.open + document.write + print()).
app.get("/api/superadmin/export/financial-overview", requireSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const [summary, moneyFlowDays, needsAttention, activity] = await Promise.all([
      computeFinancialSummary(startDate, endDate),
      startDate && endDate ? computeMoneyFlow(startDate, endDate) : Promise.resolve([]),
      computeNeedsAttention(),
      computeActivityFeed(100),
    ]);

    const summarySheet = [
      { Metric: "Total Pay-In Received", Value: summary.payin_received },
      { Metric: "Total Withdrawals Sent", Value: summary.withdrawals_sent },
      { Metric: "Pending Settlements (count)", Value: summary.pending_settlements_count },
      { Metric: "Approved Agent Top-Ups", Value: summary.approved_topups },
      { Metric: "Total Commission Earned", Value: summary.total_commission_earned },
      { Metric: "Net Platform Movement", Value: summary.net_platform_movement },
      { Metric: "Successful Transactions", Value: summary.successful_transactions },
      { Metric: "Success Rate (%)", Value: summary.success_rate },
      { Metric: "Date Range", Value: `${startDate || "all-time"} to ${endDate || "now"}` },
      { Metric: "Report Generated At", Value: new Date().toISOString() },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "Summary");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(moneyFlowDays.length ? moneyFlowDays : [{}]),
      "Money Flow",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(needsAttention.items.length ? needsAttention.items : [{}]),
      "Needs Attention",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(activity.length ? activity : [{}]),
      "Recent Activity",
    );

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="superadmin-financial-overview-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    res.send(buffer);
  } catch (error) {
    console.error("Superadmin export error:", error);
    res.status(500).json({ message: "Could not generate export" });
  }
});

// ─── HIERARCHY OVERVIEW ────────────────────────────────────────────────────────
// Client → Admin → Agent/Merchant → Merchant/Agent, lazily loaded one
// level at a time (progressive disclosure) — each level is a single grouped
// aggregate query, never N+1 per row.

// Latest of up to 3 possibly-null timestamps, without Postgres's GREATEST()
// NULL-poisoning gotcha (GREATEST returns NULL if any argument is NULL).
function maxDate(...dates) {
  const valid = dates.filter(Boolean).map((d) => new Date(d).getTime()).filter(Number.isFinite);
  return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}

app.get("/api/superadmin/hierarchy/clients", requireSuperAdmin, async (req, res) => {
  try {
    const clientsResult = await pool.query(
      `SELECT c.id AS client_id, c.company_name, c.domain_name, c.status,
              COALESCE(ac.admin_count,0)::INT AS admin_count,
              COALESCE(t.payin_volume,0) AS payin_volume,
              COALESCE(t.payin_count,0)::INT AS payin_count,
              COALESCE(t.commission_earned,0) AS commission_earned,
              COALESCE(t.pending_items,0)::INT AS pending_items,
              t.last_txn,
              COALESCE(w.withdrawal_volume,0) AS withdrawal_volume,
              w.last_wd,
              COALESCE(s.settlement_volume,0) AS settlement_volume,
              s.last_settle
       FROM clients c
       LEFT JOIN (SELECT client_id, COUNT(*) admin_count FROM admins GROUP BY client_id) ac ON ac.client_id = c.id
       LEFT JOIN (
         SELECT t.client_id,
                SUM(t.amount) FILTER (WHERE t.status='Approved') AS payin_volume,
                COUNT(*) FILTER (WHERE t.status='Approved') AS payin_count,
                SUM(t.amount * COALESCE(m.commission_percent,0)/100.0) FILTER (WHERE t.status='Approved') AS commission_earned,
                COUNT(*) FILTER (WHERE t.status IN ('Pending','UTR Submitted')) AS pending_items,
                MAX(t.created_at) AS last_txn
         FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
         GROUP BY t.client_id
       ) t ON t.client_id = c.id
       LEFT JOIN (
         SELECT m.client_id, SUM(w.amount) FILTER (WHERE w.status='cleared') AS withdrawal_volume, MAX(w.created_at) AS last_wd
         FROM withdrawal_transactions w JOIN merchants m ON m.id = w.merchant_id
         GROUP BY m.client_id
       ) w ON w.client_id = c.id
       LEFT JOIN (
         SELECT client_id, SUM(amount) FILTER (WHERE transaction_status='Approved') AS settlement_volume, MAX(created_at) AS last_settle
         FROM settlement_transactions GROUP BY client_id
       ) s ON s.client_id = c.id
       ORDER BY c.id DESC`,
    );

    // Legacy admins/transactions with client_id IS NULL ("main platform" domain,
    // predates multi-tenant clients) don't belong to any row in `clients` — surface
    // them as one synthetic bucket rather than silently dropping that data.
    const nullBucket = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM admins WHERE client_id IS NULL) AS admin_count,
         (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE client_id IS NULL AND status='Approved') AS payin_volume,
         (SELECT COUNT(*) FROM transactions WHERE client_id IS NULL AND status='Approved') AS payin_count,
         (SELECT COALESCE(SUM(t.amount * COALESCE(m.commission_percent,0)/100.0),0)
            FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
            WHERE t.client_id IS NULL AND t.status='Approved') AS commission_earned,
         (SELECT COUNT(*) FROM transactions WHERE client_id IS NULL AND status IN ('Pending','UTR Submitted')) AS pending_items,
         (SELECT MAX(created_at) FROM transactions WHERE client_id IS NULL) AS last_txn,
         (SELECT COALESCE(SUM(w.amount),0) FROM withdrawal_transactions w JOIN merchants m ON m.id=w.merchant_id WHERE m.client_id IS NULL AND w.status='cleared') AS withdrawal_volume,
         (SELECT MAX(w.created_at) FROM withdrawal_transactions w JOIN merchants m ON m.id=w.merchant_id WHERE m.client_id IS NULL) AS last_wd,
         (SELECT COALESCE(SUM(amount),0) FROM settlement_transactions WHERE client_id IS NULL AND transaction_status='Approved') AS settlement_volume,
         (SELECT MAX(created_at) FROM settlement_transactions WHERE client_id IS NULL) AS last_settle
      `,
    );
    const nb = nullBucket.rows[0];

    const rows = clientsResult.rows.map((r) => ({
      client_id: r.client_id,
      company_name: r.company_name,
      domain_name: r.domain_name,
      status: r.status,
      admin_count: r.admin_count,
      payin_volume: Number(r.payin_volume),
      payin_count: r.payin_count,
      commission_earned: Number(r.commission_earned),
      pending_items: r.pending_items,
      withdrawal_volume: Number(r.withdrawal_volume),
      settlement_volume: Number(r.settlement_volume),
      net: Number(r.payin_volume) - Number(r.withdrawal_volume) - Number(r.settlement_volume),
      last_activity: maxDate(r.last_txn, r.last_wd, r.last_settle),
    }));

    if (Number(nb.admin_count) > 0 || Number(nb.payin_count) > 0) {
      rows.push({
        client_id: null,
        company_name: "Main Platform (No Client)",
        domain_name: null,
        status: "Active",
        admin_count: Number(nb.admin_count),
        payin_volume: Number(nb.payin_volume),
        payin_count: Number(nb.payin_count),
        commission_earned: Number(nb.commission_earned),
        pending_items: Number(nb.pending_items),
        withdrawal_volume: Number(nb.withdrawal_volume),
        settlement_volume: Number(nb.settlement_volume),
        net: Number(nb.payin_volume) - Number(nb.withdrawal_volume) - Number(nb.settlement_volume),
        last_activity: maxDate(nb.last_txn, nb.last_wd, nb.last_settle),
      });
    }

    res.json({ clients: rows });
  } catch (error) {
    console.error("Hierarchy clients error:", error);
    res.status(500).json({ message: "Could not load client hierarchy" });
  }
});

app.get("/api/superadmin/hierarchy/clients/:clientId/admins", requireSuperAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const isNullBucket = clientId === "null";
    const clientScope = isNullBucket ? "a.client_id IS NULL" : "a.client_id = $1";
    const params = isNullBucket ? [] : [Number(clientId)];

    const result = await pool.query(
      `SELECT a.id AS admin_id, a.username, a.is_active,
              COALESCE(t.payin_volume,0) AS payin_volume,
              COALESCE(t.payin_count,0)::INT AS payin_count,
              COALESCE(t.commission_earned,0) AS commission_earned,
              COALESCE(t.pending_items,0)::INT AS pending_items,
              t.last_txn,
              COALESCE(w.withdrawal_volume,0) AS withdrawal_volume,
              w.last_wd,
              COALESCE(s.settlement_volume,0) AS settlement_volume,
              s.last_settle
       FROM admins a
       LEFT JOIN (
         SELECT t.created_by_admin_id,
                SUM(t.amount) FILTER (WHERE t.status='Approved') AS payin_volume,
                COUNT(*) FILTER (WHERE t.status='Approved') AS payin_count,
                SUM(t.amount * COALESCE(m.commission_percent,0)/100.0) FILTER (WHERE t.status='Approved') AS commission_earned,
                COUNT(*) FILTER (WHERE t.status IN ('Pending','UTR Submitted')) AS pending_items,
                MAX(t.created_at) AS last_txn
         FROM transactions t LEFT JOIN merchants m ON m.id = t.merchant_id
         GROUP BY t.created_by_admin_id
       ) t ON t.created_by_admin_id = a.id
       LEFT JOIN (
         SELECT m.created_by_admin_id, SUM(w.amount) FILTER (WHERE w.status='cleared') AS withdrawal_volume, MAX(w.created_at) AS last_wd
         FROM withdrawal_transactions w JOIN merchants m ON m.id = w.merchant_id
         GROUP BY m.created_by_admin_id
       ) w ON w.created_by_admin_id = a.id
       LEFT JOIN (
         SELECT created_by_admin_id, SUM(amount) FILTER (WHERE transaction_status='Approved') AS settlement_volume, MAX(created_at) AS last_settle
         FROM settlement_transactions GROUP BY created_by_admin_id
       ) s ON s.created_by_admin_id = a.id
       WHERE ${clientScope}
       ORDER BY a.id DESC`,
      params,
    );

    res.json({
      admins: result.rows.map((r) => ({
        admin_id: r.admin_id,
        username: r.username,
        is_active: r.is_active,
        payin_volume: Number(r.payin_volume),
        payin_count: r.payin_count,
        commission_earned: Number(r.commission_earned),
        pending_items: r.pending_items,
        withdrawal_volume: Number(r.withdrawal_volume),
        settlement_volume: Number(r.settlement_volume),
        net: Number(r.payin_volume) - Number(r.withdrawal_volume) - Number(r.settlement_volume),
        last_activity: maxDate(r.last_txn, r.last_wd, r.last_settle),
      })),
    });
  } catch (error) {
    console.error("Hierarchy admins error:", error);
    res.status(500).json({ message: "Could not load admin hierarchy" });
  }
});

app.get("/api/superadmin/hierarchy/admins/:adminId/agents-merchants", requireSuperAdmin, async (req, res) => {
  try {
    const adminId = Number(req.params.adminId);

    const [agentsResult, merchantsResult] = await Promise.all([
      pool.query(
        `SELECT ag.id AS agent_id, ag.name, ag.username, ag.is_active,
                COALESCE(t.payin_volume,0) AS payin_volume,
                COALESCE(t.payin_count,0)::INT AS payin_count,
                COALESCE(t.pending_items,0)::INT AS pending_items,
                t.last_txn,
                COALESCE(s.settlement_volume,0) AS settlement_volume,
                s.last_settle
         FROM agents ag
         LEFT JOIN (
           SELECT agent_id, SUM(amount) FILTER (WHERE status='Approved') AS payin_volume,
                  COUNT(*) FILTER (WHERE status='Approved') AS payin_count,
                  COUNT(*) FILTER (WHERE status IN ('Pending','UTR Submitted')) AS pending_items,
                  MAX(created_at) AS last_txn
           FROM transactions GROUP BY agent_id
         ) t ON t.agent_id = ag.id
         LEFT JOIN (
           SELECT agent_id, SUM(amount) FILTER (WHERE transaction_status='Approved') AS settlement_volume, MAX(created_at) AS last_settle
           FROM settlement_transactions GROUP BY agent_id
         ) s ON s.agent_id = ag.id
         WHERE ag.created_by_admin_id = $1
         ORDER BY ag.id DESC`,
        [adminId],
      ),
      pool.query(
        `SELECT m.id AS merchant_id, m.name, m.username, m.is_active, m.commission_percent,
                COALESCE(t.payin_volume,0) AS payin_volume,
                COALESCE(t.payin_count,0)::INT AS payin_count,
                COALESCE(t.pending_items,0)::INT AS pending_items,
                t.last_txn,
                COALESCE(w.withdrawal_volume,0) AS withdrawal_volume,
                w.last_wd
         FROM merchants m
         LEFT JOIN (
           SELECT merchant_id, SUM(amount) FILTER (WHERE status='Approved') AS payin_volume,
                  COUNT(*) FILTER (WHERE status='Approved') AS payin_count,
                  COUNT(*) FILTER (WHERE status IN ('Pending','UTR Submitted')) AS pending_items,
                  MAX(created_at) AS last_txn
           FROM transactions GROUP BY merchant_id
         ) t ON t.merchant_id = m.id
         LEFT JOIN (
           SELECT merchant_id, SUM(amount) FILTER (WHERE status='cleared') AS withdrawal_volume, MAX(created_at) AS last_wd
           FROM withdrawal_transactions GROUP BY merchant_id
         ) w ON w.merchant_id = m.id
         WHERE m.created_by_admin_id = $1
         ORDER BY m.id DESC`,
        [adminId],
      ),
    ]);

    res.json({
      agents: agentsResult.rows.map((r) => ({
        agent_id: r.agent_id, name: r.name, username: r.username, is_active: r.is_active,
        payin_volume: Number(r.payin_volume), payin_count: r.payin_count,
        pending_items: r.pending_items,
        settlement_volume: Number(r.settlement_volume),
        net: Number(r.payin_volume) - Number(r.settlement_volume),
        last_activity: maxDate(r.last_txn, r.last_settle),
      })),
      merchants: merchantsResult.rows.map((r) => ({
        merchant_id: r.merchant_id, name: r.name, username: r.username, is_active: r.is_active,
        payin_volume: Number(r.payin_volume), payin_count: r.payin_count,
        commission_earned: Number(r.payin_volume) * (Number(r.commission_percent || 0) / 100),
        pending_items: r.pending_items,
        withdrawal_volume: Number(r.withdrawal_volume),
        net: Number(r.payin_volume) - Number(r.withdrawal_volume),
        last_activity: maxDate(r.last_txn, r.last_wd),
      })),
    });
  } catch (error) {
    console.error("Hierarchy agents/merchants error:", error);
    res.status(500).json({ message: "Could not load agent/merchant hierarchy" });
  }
});

// Global search across users, transaction identifiers, and bank account
// identifiers. Name/username/company columns use infix ILIKE (small roster
// tables, a sequential scan is fine); transaction_id/utr_number/merchant_order_id/
// unique_id/account_number/upi_id use PREFIX match (q%) so the new btree
// indexes from initializeDatabase() are actually usable — infix matching on
// those would need pg_trgm (not used anywhere else in this codebase).
app.get("/api/superadmin/search", requireSuperAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2)
      return res.status(400).json({ message: "Search query must be at least 2 characters" });

    const infix = `%${q}%`;
    const prefix = `${q}%`;

    const [admins, agents, merchants, clients, transactions, agentAccounts] =
      await Promise.all([
        pool.query(`SELECT id, username, 'admin' AS type FROM admins WHERE username ILIKE $1 LIMIT 10`, [infix]),
        pool.query(`SELECT id, name, username, 'agent' AS type FROM agents WHERE name ILIKE $1 OR username ILIKE $1 LIMIT 10`, [infix]),
        pool.query(`SELECT id, name, username, 'merchant' AS type FROM merchants WHERE name ILIKE $1 OR username ILIKE $1 LIMIT 10`, [infix]),
        pool.query(`SELECT id, company_name, domain_name, 'client' AS type FROM clients WHERE company_name ILIKE $1 OR domain_name ILIKE $1 LIMIT 10`, [infix]),
        pool.query(
          `SELECT id, transaction_id, utr_number, merchant_order_id, unique_id, amount, status, 'transaction' AS type
           FROM transactions
           WHERE transaction_id LIKE $1 OR utr_number LIKE $1 OR merchant_order_id LIKE $1 OR unique_id LIKE $1
           ORDER BY created_at DESC LIMIT 15`,
          [prefix],
        ),
        pool.query(
          `SELECT id, agent_id, account_number, upi_id, bank_name, 'agent_account' AS type
           FROM agent_accounts WHERE account_number LIKE $1 OR upi_id LIKE $1 LIMIT 10`,
          [prefix],
        ),
      ]);

    res.json({
      query: q,
      results: {
        admins: admins.rows,
        agents: agents.rows,
        merchants: merchants.rows,
        clients: clients.rows,
        transactions: transactions.rows,
        agent_accounts: agentAccounts.rows,
      },
    });
  } catch (error) {
    console.error("Superadmin search error:", error);
    res.status(500).json({ message: "Could not perform search" });
  }
});

app.get("/api/superadmin/maintenance-mode", requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM platform_maintenance WHERE id = 1`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Get maintenance mode error:", error);
    res.status(500).json({ message: "Could not load maintenance status" });
  }
});

app.put("/api/superadmin/maintenance-mode", requireSuperAdmin, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const { is_enabled, message } = req.body;
    const result = await pool.query(
      `UPDATE platform_maintenance
       SET is_enabled = $1, message = $2, updated_by_role = 'super-admin', updated_by_id = $3, updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [!!is_enabled, message || null, Number(auth.userId)],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update maintenance mode error:", error);
    res.status(500).json({ message: "Could not update maintenance status" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SUPER ADMIN EMAIL ALERT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// ── Recipients ──────────────────────────────────────────────────────────────
// Each recipient row also carries its own last-send status/time and recent
// failure count via correlated subqueries — avoids a separate round trip to
// alert_logs just to render "delivery status / last sent time / recent
// failures" next to each email on the settings page.
app.get("/api/superadmin/alert-recipients", requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ar.*,
        (SELECT status FROM alert_logs WHERE recipient = ar.email ORDER BY created_at DESC LIMIT 1) AS last_status,
        (SELECT created_at FROM alert_logs WHERE recipient = ar.email ORDER BY created_at DESC LIMIT 1) AS last_sent_at,
        (SELECT COUNT(*) FROM alert_logs WHERE recipient = ar.email AND status = 'failed' AND created_at >= NOW() - INTERVAL '7 days')::INT AS recent_failures
      FROM alert_recipients ar
      ORDER BY ar.id DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("List alert recipients error:", error);
    res.status(500).json({ message: "Could not load alert recipients" });
  }
});

app.post("/api/superadmin/alert-recipients", requireSuperAdmin, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const email = cleanText(req.body?.email).toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required" });
    if (!isEmailFormatValid(email)) return res.status(400).json({ message: "Invalid email address format" });

    const existing = await pool.query(`SELECT id FROM alert_recipients WHERE LOWER(email) = $1`, [email]);
    if (existing.rows.length > 0) return res.status(409).json({ message: "This email is already a recipient" });

    const result = await pool.query(
      `INSERT INTO alert_recipients (email, created_by_super_admin_id) VALUES ($1, $2) RETURNING *`,
      [email, Number(auth.userId) || null],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Add alert recipient error:", error);
    res.status(500).json({ message: "Could not add recipient" });
  }
});

app.put("/api/superadmin/alert-recipients/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active, email } = req.body || {};
    const sets = [];
    const values = [];
    let idx = 1;

    if (email !== undefined) {
      const cleanEmail = cleanText(email).toLowerCase();
      if (!isEmailFormatValid(cleanEmail)) return res.status(400).json({ message: "Invalid email address format" });
      const dupe = await pool.query(`SELECT id FROM alert_recipients WHERE LOWER(email) = $1 AND id <> $2`, [cleanEmail, id]);
      if (dupe.rows.length > 0) return res.status(409).json({ message: "This email is already a recipient" });
      sets.push(`email = $${idx++}`);
      values.push(cleanEmail);
    }
    if (is_active !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(!!is_active);
    }
    if (sets.length === 0) return res.status(400).json({ message: "Nothing to update" });

    sets.push(`updated_at = NOW()`);
    values.push(id);
    const result = await pool.query(
      `UPDATE alert_recipients SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Recipient not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update alert recipient error:", error);
    res.status(500).json({ message: "Could not update recipient" });
  }
});

app.delete("/api/superadmin/alert-recipients/:id", requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM alert_recipients WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Recipient not found" });
    res.json({ message: "Recipient removed" });
  } catch (error) {
    console.error("Delete alert recipient error:", error);
    res.status(500).json({ message: "Could not remove recipient" });
  }
});

// ── Alert rules (thresholds / toggles) ──────────────────────────────────────
app.get("/api/superadmin/alert-settings", requireSuperAdmin, async (req, res) => {
  try {
    res.json(await getAlertSettings());
  } catch (error) {
    console.error("Get alert settings error:", error);
    res.status(500).json({ message: "Could not load alert settings" });
  }
});

app.put("/api/superadmin/alert-settings", requireSuperAdmin, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const {
      dispute_alerts_enabled,
      overdue_utr_alerts_enabled,
      overdue_utr_threshold_minutes,
      overdue_utr_reminder_enabled,
      overdue_utr_reminder_interval_minutes,
    } = req.body || {};

    const thresholdMin = Number(overdue_utr_threshold_minutes);
    const reminderMin = Number(overdue_utr_reminder_interval_minutes);
    if (!Number.isFinite(thresholdMin) || thresholdMin < 1) {
      return res.status(400).json({ message: "Overdue UTR threshold must be at least 1 minute" });
    }
    if (!Number.isFinite(reminderMin) || reminderMin < 1) {
      return res.status(400).json({ message: "Reminder interval must be at least 1 minute" });
    }

    const result = await pool.query(
      `UPDATE alert_settings SET
         dispute_alerts_enabled = $1,
         overdue_utr_alerts_enabled = $2,
         overdue_utr_threshold_minutes = $3,
         overdue_utr_reminder_enabled = $4,
         overdue_utr_reminder_interval_minutes = $5,
         updated_at = NOW(),
         updated_by_super_admin_id = $6
       WHERE id = 1 RETURNING *`,
      [!!dispute_alerts_enabled, !!overdue_utr_alerts_enabled, thresholdMin, !!overdue_utr_reminder_enabled, reminderMin, Number(auth.userId) || null],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update alert settings error:", error);
    res.status(500).json({ message: "Could not update alert settings" });
  }
});

// ── Test email ───────────────────────────────────────────────────────────────
// Sends (and logs, event_type='test') to one specific recipient id if given,
// otherwise to every currently-active recipient. Awaited (not fire-and-forget)
// since this is an explicit user action expecting an immediate result, not a
// side-effect of some other operation that must never be blocked.
app.post("/api/superadmin/alerts/test", requireSuperAdmin, async (req, res) => {
  try {
    const { recipient_id } = req.body || {};
    let recipients;
    if (recipient_id) {
      const r = await pool.query(`SELECT email FROM alert_recipients WHERE id = $1`, [recipient_id]);
      if (r.rows.length === 0) return res.status(404).json({ message: "Recipient not found" });
      recipients = [r.rows[0].email];
    } else {
      recipients = await getActiveAlertRecipients();
      if (recipients.length === 0) return res.status(400).json({ message: "No active recipients configured" });
    }

    const subject = "RDpay Alerts — Test Email";
    const html = buildAlertHtml({
      heading: "Test Email",
      intro: "This is a test email from RDpay's Super Admin Email Alert Configuration. If you received this, delivery is working correctly.",
      rows: [["Sent At", alertDateTime(new Date())]],
      linkLabel: "Open Alert Settings",
      link: alertPanelUrl("/superadmin/alerts"),
    });

    const results = [];
    for (const email of recipients) {
      try {
        await sendMailWithRetry({ to: email, subject, html, text: `Test email from RDpay Alerts, sent ${alertDateTime(new Date())}` });
        await logAlertAttempt({ eventType: "test", recipient: email, subject, status: "sent" });
        results.push({ email, status: "sent" });
      } catch (e) {
        await logAlertAttempt({ eventType: "test", recipient: email, subject, status: "failed", errorMessage: String(e.message || e).slice(0, 500) });
        results.push({ email, status: "failed", error: e.message });
      }
    }
    res.json({ results });
  } catch (error) {
    console.error("Test alert email error:", error);
    res.status(500).json({ message: "Could not send test email" });
  }
});

// ── Delivery log ─────────────────────────────────────────────────────────────
app.get("/api/superadmin/alert-logs", requireSuperAdmin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const where = [];
    const values = [];
    let idx = 1;
    if (req.query.status) { where.push(`status = $${idx++}`); values.push(req.query.status); }
    if (req.query.event_type) { where.push(`event_type = $${idx++}`); values.push(req.query.event_type); }
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT * FROM alert_logs ${whereClause} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      pool.query(`SELECT COUNT(*)::INT AS total FROM alert_logs ${whereClause}`, values),
    ]);
    res.json({
      data: rows.rows,
      total: count.rows[0].total,
      page,
      totalPages: Math.max(1, Math.ceil(count.rows[0].total / limit)),
    });
  } catch (error) {
    console.error("List alert logs error:", error);
    res.status(500).json({ message: "Could not load alert logs" });
  }
});

// ── Monitor: disputes (cross-tenant — Super Admin sees every client) ────────
app.get("/api/superadmin/alerts/disputes", requireSuperAdmin, async (req, res) => {
  try {
    const [payinDisputed, payinMerchantDisputed, withdrawalDisputed] = await Promise.all([
      pool.query(`
        SELECT t.id, 'payin' AS type, t.transaction_id, t.merchant_order_id, t.amount,
               t.disputed_utr AS utr, t.status, t.merchant_disputed_at, t.created_at,
               m.name AS merchant_name, c.company_name AS client_name
        FROM transactions t
        LEFT JOIN merchants m ON m.id = t.merchant_id
        LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.status = 'Disputed'
        ORDER BY t.approved_or_reject_date DESC NULLS LAST, t.created_at DESC
        LIMIT 200
      `),
      pool.query(`
        SELECT t.id, 'payin_merchant' AS type, t.transaction_id, t.merchant_order_id, t.amount,
               t.utr_number AS utr, t.status, t.merchant_disputed_at, t.created_at,
               t.merchant_dispute_reason,
               m.name AS merchant_name, c.company_name AS client_name
        FROM transactions t
        LEFT JOIN merchants m ON m.id = t.merchant_id
        LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.merchant_dispute_reason IS NOT NULL
        ORDER BY t.merchant_disputed_at DESC NULLS LAST
        LIMIT 200
      `),
      pool.query(`
        SELECT w.id, 'withdrawal' AS type, w.transaction_id, NULL AS merchant_order_id, w.amount,
               w.utr_number AS utr, w.status, w.merchant_disputed_at, w.created_at,
               w.merchant_dispute_reason,
               m.name AS merchant_name, c.company_name AS client_name
        FROM withdrawal_transactions w
        LEFT JOIN merchants m ON m.id = w.merchant_id
        LEFT JOIN clients c ON c.id = m.client_id
        WHERE w.merchant_disputed_at IS NOT NULL
        ORDER BY w.merchant_disputed_at DESC NULLS LAST
        LIMIT 200
      `),
    ]);
    res.json({
      payin: payinDisputed.rows,
      payin_merchant: payinMerchantDisputed.rows,
      withdrawal: withdrawalDisputed.rows,
    });
  } catch (error) {
    console.error("Superadmin disputes monitor error:", error);
    res.status(500).json({ message: "Could not load disputes" });
  }
});

// ── Monitor: overdue UTR submissions ────────────────────────────────────────
app.get("/api/superadmin/alerts/overdue-utr", requireSuperAdmin, async (req, res) => {
  try {
    const settings = await getAlertSettings();
    const thresholdMin = Math.max(1, Number(settings.overdue_utr_threshold_minutes) || 60);
    const result = await pool.query(
      `SELECT t.id, t.transaction_id, t.merchant_order_id, t.amount, t.utr_number,
              t.utr_submitted_at, t.overdue_alert_sent_at, t.overdue_alert_last_reminder_at,
              m.name AS merchant_name, c.company_name AS client_name, op.name AS agent_name,
              EXTRACT(EPOCH FROM (NOW() - t.utr_submitted_at))::INT / 60 AS pending_minutes
       FROM transactions t
       LEFT JOIN merchants m ON m.id = t.merchant_id
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN agents op ON op.id = t.agent_id
       WHERE t.status = 'UTR Submitted'
         AND t.utr_submitted_at IS NOT NULL
         AND t.utr_submitted_at <= NOW() - ($1 || ' minutes')::INTERVAL
       ORDER BY t.utr_submitted_at ASC
       LIMIT 200`,
      [String(thresholdMin)],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Superadmin overdue-UTR monitor error:", error);
    res.status(500).json({ message: "Could not load overdue UTR submissions" });
  }
});

// Lightweight header-strip endpoint — intentionally separate from
// /api/superadmin/needs-attention so the header's auto-refresh (every 60s)
// never re-runs that heavier 9-query aggregate.
app.get("/api/superadmin/status-strip", requireSuperAdmin, async (req, res) => {
  try {
    const [maintenance, pendingApprovals, failedWebhooks] = await Promise.all([
      pool.query(`SELECT is_enabled FROM platform_maintenance WHERE id = 1`),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM agent_topup_requests WHERE status='Pending') +
          (SELECT COUNT(*) FROM settlement_transactions WHERE transaction_status='Pending') +
          (SELECT COUNT(*) FROM withdrawal_transactions WHERE status IN ('pending','picked'))
          AS total
      `),
      pool.query(`
        SELECT COUNT(*)::INT AS count FROM transactions
        WHERE webhook_sent = false AND webhook_url IS NOT NULL AND webhook_url <> ''
          AND created_at >= NOW() - INTERVAL '7 days'
      `),
    ]);

    res.json({
      maintenance_enabled: maintenance.rows[0]?.is_enabled || false,
      pending_approvals: Number(pendingApprovals.rows[0].total),
      failed_webhooks: failedWebhooks.rows[0].count,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Status strip error:", error);
    res.status(500).json({ message: "Could not load status strip" });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    let agents, merchants, settlementAccounts;

    if (role === "agent") {
      agents = { rows: [{ count: 1 }] };
      merchants = await pool.query(
        "SELECT COUNT(*) FROM merchants WHERE agent_id=$1",
        [userId],
      );
      settlementAccounts = await pool.query(
        `SELECT COUNT(*) FROM settlement_accounts sa LEFT JOIN merchants m ON sa.merchant_id = m.id WHERE m.agent_id=$1`,
        [userId],
      );
    } else if (role === "merchant") {
      agents = { rows: [{ count: 0 }] };
      merchants = { rows: [{ count: 1 }] };
      settlementAccounts = await pool.query(
        "SELECT COUNT(*) FROM settlement_accounts WHERE merchant_id=$1",
        [userId],
      );
    } else if (role === "admin" && userId) {
      agents = await pool.query(
        "SELECT COUNT(*) FROM agents WHERE created_by_admin_id=$1",
        [userId],
      );
      merchants = await pool.query(
        "SELECT COUNT(*) FROM merchants WHERE created_by_admin_id=$1",
        [userId],
      );
      settlementAccounts = await pool.query(
        "SELECT COUNT(*) FROM settlement_accounts WHERE created_by_admin_id=$1",
        [userId],
      );
    } else {
      agents = await pool.query("SELECT COUNT(*) FROM agents");
      merchants = await pool.query("SELECT COUNT(*) FROM merchants");
      settlementAccounts = await pool.query(
        "SELECT COUNT(*) FROM settlement_accounts",
      );
    }

    res.json({
      totalAgents: agents.rows[0].count,
      totalMerchants: merchants.rows[0].count,
      totalSettlementAccounts: settlementAccounts.rows[0].count,
    });
  } catch (error) {
    console.log("Dashboard error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const values = [];
    const ownerFilter =
      role === "admin" && userId ? "WHERE created_by_admin_id = $1" : "";
    if (ownerFilter) values.push(userId);

    const result = await pool.query(
      `
      SELECT id, username AS name, username, plain_password, is_active,
             NULL::INT AS agent_id, NULL::INT AS merchant_id, 'admin' AS type FROM admins
      ${role === "admin" && userId ? "WHERE id = $1" : ""}
      UNION ALL
      SELECT id, name, username, plain_password, is_active,
             NULL::INT AS agent_id, NULL::INT AS merchant_id, 'agent' AS type FROM agents ${ownerFilter}
      UNION ALL
      SELECT id, name, username, plain_password, is_active,
             agent_id, NULL::INT AS merchant_id, 'merchant' AS type FROM merchants ${ownerFilter}
      ORDER BY type, id DESC
    `,
      values,
    );

    res.json(result.rows);
  } catch (error) {
    console.log("Users API error:", error);
    res.status(500).json({ message: "Could not fetch users" });
  }
});

// ─── AGENTS ───────────────────────────────────────────────────────────────────
app.get("/api/agents", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const adminId = getAdminOwnerId(auth);
    const clientId = getClientId(auth);
    const values = [];
    const conditions = [];
    if (adminId) { conditions.push(`a.created_by_admin_id = $${values.length+1}`); values.push(adminId); }
    if (clientId) { conditions.push(`a.client_id = $${values.length+1}`); values.push(clientId); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const result = await pool.query(
      `SELECT a.id, a.name, a.commission_percent, a.max_available_limit, a.max_payment_limit,
              a.min_transaction_amount, a.username, a.plain_password, a.is_active, a.created_at,
              (COALESCE(ap.agent_committed, 0) - COALESCE(asl.agent_settled, 0)) AS outstanding_amount
       FROM agents a
       LEFT JOIN (
         SELECT agent_id, COALESCE(SUM(amount),0) AS agent_committed
         FROM transactions
         WHERE agent_id IS NOT NULL
           AND status IN ('Approved','Success','Pending','UTR Submitted')
         GROUP BY agent_id
       ) ap ON ap.agent_id = a.id
       LEFT JOIN (
         SELECT agent_id, COALESCE(SUM(amount),0) AS agent_settled
         FROM settlement_transactions
         WHERE agent_id IS NOT NULL AND transaction_status = 'Approved'
         GROUP BY agent_id
       ) asl ON asl.agent_id = a.id
       ${where} ORDER BY a.id DESC`,
      values,
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
});

app.post("/api/agents", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const adminId = getAdminOwnerId(auth);
    const {
      name,
      commission_percent,
      max_payment_limit,
      min_transaction_amount,
      username,
      password,
      is_active,
    } = req.body;

    if (!name || !username || !password)
      return res
        .status(400)
        .json({ message: "Name, username and password are required" });
    if (
      Number(max_payment_limit || 0) < 0 ||
      Number(min_transaction_amount || 0) < 0
    )
      return res.status(400).json({ message: "Limits cannot be negative" });
    if (
      Number(max_payment_limit || 0) &&
      Number(min_transaction_amount || 0) > Number(max_payment_limit || 0)
    )
      return res
        .status(400)
        .json({
          message:
            "Minimum transaction amount cannot be greater than max payment limit",
        });

    const clientId2 = getClientId(auth);
    await assertUniqueUsername(username, "agent", null, clientId2);
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO agents (name, commission_percent, max_payment_limit, min_transaction_amount, created_by_admin_id, username, password, plain_password, is_active, client_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, commission_percent, max_payment_limit, min_transaction_amount, username, plain_password, is_active`,
      [name, commission_percent || 0, max_payment_limit || 0, min_transaction_amount || 0, adminId, username, hashedPassword, password, is_active, clientId2]
    );
    await ensureAgentWallet(result.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return;
    if (error.code === "23505")
      return res.status(400).json({ message: "Username already exists" });
    res.status(500).json({ message: "Could not create agent" });
  }
});

app.put("/api/agents/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      commission_percent,
      commission_charge_percent,
      max_available_limit,
      max_payment_limit,
      min_transaction_amount,
      username,
      password,
      is_active,
    } = req.body;

    const finalCommissionPercent =
      commission_percent ?? commission_charge_percent ?? 0;

    if (
      Number(max_available_limit || 0) < 0 ||
      Number(max_payment_limit || 0) < 0 ||
      Number(min_transaction_amount || 0) < 0
    ) {
      return res.status(400).json({ message: "Limits cannot be negative" });
    }
    if (
      Number(max_payment_limit || 0) &&
      Number(min_transaction_amount || 0) > Number(max_payment_limit || 0)
    ) {
      return res
        .status(400)
        .json({
          message:
            "Minimum transaction amount cannot be greater than max payment limit",
        });
    }

    let result;
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await pool.query(
        `UPDATE agents SET name=$1, commission_percent=$2, max_available_limit=$3, max_payment_limit=$4, min_transaction_amount=$5, username=$6, password=$7, plain_password=$8, is_active=$9
         WHERE id=$10 RETURNING id, name, commission_percent, max_available_limit, max_payment_limit, min_transaction_amount, username, plain_password, is_active`,
        [
          name,
          finalCommissionPercent,
          max_available_limit || 0,
          max_payment_limit || 0,
          min_transaction_amount || 0,
          username,
          hashedPassword,
          password,
          is_active,
          id,
        ],
      );
    } else {
      result = await pool.query(
        `UPDATE agents SET name=$1, commission_percent=$2, max_available_limit=$3, max_payment_limit=$4, min_transaction_amount=$5, username=$6, is_active=$7
         WHERE id=$8 RETURNING id, name, commission_percent, max_available_limit, max_payment_limit, min_transaction_amount, username, plain_password, is_active`,
        [
          name,
          finalCommissionPercent,
          max_available_limit || 0,
          max_payment_limit || 0,
          min_transaction_amount || 0,
          username,
          is_active,
          id,
        ],
      );
    }

    if (result.rows.length === 0)
      return res.status(404).json({ message: "Agent not found" });
    res.json(result.rows[0]);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return;
    if (error.code === "23505")
      return res.status(400).json({ message: "Username already exists" });
    res
      .status(500)
      .json({ message: error.message || "Could not update agent" });
  }
});

// ── Cascade delete helpers ──────────────────────────────────────────────────
// Delete a user AND all of its linked records. Run inside a DB transaction
// (pass the client). Children are deleted before parents to satisfy FKs.
async function cascadeDeleteMerchant(client, id) {
  await client.query("DELETE FROM transactions WHERE merchant_id=$1", [id]);
  await client.query("DELETE FROM settlement_transactions WHERE merchant_id=$1", [id]);
  await client.query("DELETE FROM withdrawal_transactions WHERE merchant_id=$1", [id]);
  await client.query("DELETE FROM settlement_accounts WHERE merchant_id=$1", [id]);
  await client.query("DELETE FROM tickets WHERE merchant_id=$1", [id]);
  await client.query("DELETE FROM merchants WHERE id=$1", [id]);
}

// Deletes everything an Agent owns directly (Agent's old functionality is
// now folded into Agent, so this covers what cascadeDeleteAgent used to
// handle plus the agent's wallet/topup/proof data). Transactions/settlements/
// withdrawals must be deleted before agent_accounts (FK: transactions.account_id).
async function cascadeDeleteAgent(client, id) {
  await client.query("DELETE FROM transactions WHERE agent_id=$1", [id]);
  await client.query("DELETE FROM settlement_transactions WHERE agent_id=$1", [id]);
  await client.query("DELETE FROM withdrawal_transactions WHERE agent_id=$1", [id]);
  await client.query(
    "DELETE FROM bank_transfers WHERE from_account_id IN (SELECT id FROM agent_accounts WHERE agent_id=$1) OR to_account_id IN (SELECT id FROM agent_accounts WHERE agent_id=$1)",
    [id],
  );
  await client.query(
    "DELETE FROM agent_account_withdrawals WHERE account_id IN (SELECT id FROM agent_accounts WHERE agent_id=$1)",
    [id],
  );
  await client.query("DELETE FROM agent_accounts WHERE agent_id=$1", [id]);
  await client.query("DELETE FROM agent_wallet_ledger WHERE agent_id=$1", [id]);
  await client.query("DELETE FROM agent_wallets WHERE agent_id=$1", [id]);
  await client.query("DELETE FROM agent_topup_requests WHERE agent_id=$1", [id]);
  await client.query("DELETE FROM agent_received_proofs WHERE agent_id=$1", [id]);
}

// Run a cascade delete inside a transaction; commit on success, rollback on error.
async function runCascadeDelete(res, label, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
    res.json({ message: `${label} and all its linked records deleted successfully` });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`${label} delete error:`, error.message);
    res.status(500).json({ message: `Could not delete ${label.toLowerCase()}: ${error.message}` });
  } finally {
    client.release();
  }
}

app.delete("/api/agents/:id", async (req, res) => {
  const id = req.params.id;
  await runCascadeDelete(res, "Agent", async (client) => {
    const ms = await client.query("SELECT id FROM merchants WHERE agent_id=$1", [id]);
    for (const m of ms.rows) await cascadeDeleteMerchant(client, m.id);
    await cascadeDeleteAgent(client, id);
    await client.query("DELETE FROM agents WHERE id=$1", [id]);
  });
});

// ─── MERCHANTS ────────────────────────────────────────────────────────────────
// Replace a merchant's full agent set (primary + extras) used for payin routing.
async function syncMerchantAgents(merchantId, agentIds) {
  const ids = [...new Set((agentIds || []).map((v) => Number(v)).filter((v) => v > 0))];
  await pool.query(`DELETE FROM merchant_agents WHERE merchant_id = $1`, [merchantId]);
  for (const aid of ids) {
    await pool.query(
      `INSERT INTO merchant_agents (merchant_id, agent_id) VALUES ($1, $2)
       ON CONFLICT (merchant_id, agent_id) DO NOTHING`,
      [merchantId, aid],
    );
  }
}

// Normalize an incoming agent assignment into { set, primary }.
// Accepts agent_ids[] (multi) or a single agent_id (legacy).
function resolveAgentSet(body) {
  const set = Array.isArray(body.agent_ids) && body.agent_ids.length
    ? [...new Set(body.agent_ids.map((v) => Number(v)).filter((v) => v > 0))]
    : (body.agent_id ? [Number(body.agent_id)] : []);
  return { set, primary: set[0] || null };
}

app.get("/api/merchants", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    let query = `
      SELECT merchants.id, merchants.name, merchants.commission_percent, merchants.agent_id, merchants.username,
             merchants.plain_password, merchants.is_active, merchants.created_at, agents.name AS agent_name,
             COALESCE((SELECT array_agg(ma.agent_id) FROM merchant_agents ma WHERE ma.merchant_id = merchants.id), ARRAY[]::int[]) AS agent_ids
      FROM merchants LEFT JOIN agents ON merchants.agent_id = agents.id
    `;
    const values = [];

    const conditions_m = [];
    if (role === "admin" && userId) { conditions_m.push(`merchants.created_by_admin_id = $${values.length+1}`); values.push(userId); }
    else if (role === "agent") { conditions_m.push(`merchants.agent_id = $${values.length+1}`); values.push(userId); }
    else if (role === "merchant") { conditions_m.push(`merchants.id = $${values.length+1}`); values.push(userId); }

    const clientId_m = getClientId(getAuthUser(req));
    if (clientId_m) { conditions_m.push(`merchants.client_id = $${values.length+1}`); values.push(clientId_m); }

    if (conditions_m.length) query += " WHERE " + conditions_m.join(" AND ");
    query += ` ORDER BY merchants.id DESC`;
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Merchants fetch error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.post("/api/merchants", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const { name, commission_percent, username, password, is_active } = req.body;
    const { set: agentSet, primary: primaryAgent } = resolveAgentSet(req.body);
    const adminId = getAdminOwnerId(auth) || await getOwnerFromAgent(primaryAgent);
    const clientId_mp = getClientId(auth);
    await assertUniqueUsername(username, "merchant", null, clientId_mp);
    const hashedPassword = await bcrypt.hash(password, 10);
    // Every merchant is directly API-ready — token/api_key moved here from the
    // old merchants table (see authenticateMerchantApiKey).
    const token = crypto.randomBytes(32).toString("hex");
    const apiKey = crypto.randomBytes(32).toString("hex");
    const result = await pool.query(
      `INSERT INTO merchants (name, commission_percent, agent_id, created_by_admin_id, username, password, plain_password, is_active, client_id, token, api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, name, commission_percent, agent_id, username, plain_password, is_active`,
      [name, commission_percent || 0, primaryAgent, adminId, username, hashedPassword, password, is_active, clientId_mp, token, apiKey]
    );
    await syncMerchantAgents(result.rows[0].id, agentSet);
    res.json(result.rows[0]);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return;
    if (error.code === "23505")
      return res.status(400).json({ message: "Username already exists" });
    res.status(500).json({ message: "Could not create merchant" });
  }
});

app.put("/api/merchants/:id", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const { id } = req.params;
    const {
      name,
      commission_percent,
      username,
      password,
      is_active,
    } = req.body;
    const { set: agentSet, primary: primaryAgent } = resolveAgentSet(req.body);
    await assertUniqueUsername(username, "merchant", id, getClientId(auth));
    let result;
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      result = await pool.query(
        `UPDATE merchants SET name=$1, commission_percent=$2, agent_id=$3, username=$4, password=$5, plain_password=$6, is_active=$7
         WHERE id=$8 RETURNING id, name, commission_percent, agent_id, username, plain_password, is_active`,
        [
          name,
          commission_percent || 0,
          primaryAgent,
          username,
          hashedPassword,
          password,
          is_active,
          id,
        ],
      );
    } else {
      result = await pool.query(
        `UPDATE merchants SET name=$1, commission_percent=$2, agent_id=$3, username=$4, is_active=$5
         WHERE id=$6 RETURNING id, name, commission_percent, agent_id, username, plain_password, is_active`,
        [
          name,
          commission_percent || 0,
          primaryAgent,
          username,
          is_active,
          id,
        ],
      );
    }
    await syncMerchantAgents(id, agentSet);
    res.json(result.rows[0]);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return;
    if (error.code === "23505")
      return res.status(400).json({ message: "Username already exists" });
    res.status(500).json({ message: "Could not update merchant" });
  }
});

app.delete("/api/merchants/:id", async (req, res) => {
  // Cascade: deletes the merchant AND its merchants, transactions,
  // settlements, payouts, settlement accounts and tickets.
  await runCascadeDelete(res, "Merchant", (client) =>
    cascadeDeleteMerchant(client, req.params.id),
  );
});

// ─── merchant ────────────────────────────────────────────────────────────
// ─── AGENTS (legacy — folded into Agent, see /api/agent-accounts etc. below) ─
// ─── AGENT WALLET / TOP-UP ────────────────────────────────────────────────────
// Agent's old wallet/top-up subsystem, now owned directly by Agent — no more
// separate child entity or invite/self-signup flow (agents sign up directly via
// the public /api/signup or are created by Admin via /api/agents).

// Resolves { clientId, adminId } for the currently-authenticated agent, used
// to scope their company-wallet-config lookup and to stamp new topup requests.
// Mirrors the dual-key (client_id, else created_by_admin_id) convention used
// elsewhere for legacy tenants without a client_id.
async function resolveAgentTenantScope(auth) {
  const agRow = await pool.query(
    `SELECT created_by_admin_id, client_id FROM agents WHERE id = $1`,
    [Number(auth.userId)],
  );
  if (agRow.rows.length === 0) return null;
  const { created_by_admin_id: adminId, client_id: agClientId } = agRow.rows[0];
  return { clientId: auth.clientId || agClientId || null, adminId: adminId || null };
}

app.post("/api/agent/topups", uploadTopupProof, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Not allowed" });
    const agentId = Number(auth.userId);

    const cleanMethod = String(req.body.method || "").toUpperCase().trim();
    if (!["USDT", "BANK_TRANSFER"].includes(cleanMethod))
      return res.status(400).json({ message: "method must be USDT or BANK_TRANSFER" });

    const numericAmount = Number(req.body.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0)
      return res.status(400).json({ message: "Amount must be greater than 0" });

    let txRef = "";
    if (cleanMethod === "USDT") {
      txRef = cleanText(req.body.usdt_tx_hash);
      if (!txRef) return res.status(400).json({ message: "Transaction hash is required" });
    } else {
      txRef = cleanText(req.body.bank_utr);
      if (!txRef) return res.status(400).json({ message: "UTR number is required" });
    }

    const scope = await resolveAgentTenantScope(auth);
    if (!scope) return res.status(404).json({ message: "Agent not found" });

    // Deposit-destination fields are ALWAYS taken from the server-side config,
    // never trusted from the client body — prevents a buggy/malicious client
    // from claiming it paid into an address that isn't the real company one.
    const config = await findCompanyWalletConfig(scope);
    if (!config)
      return res.status(400).json({
        message: "Deposit details are not configured for your account yet — contact your admin",
      });

    // Defends the agent-facing submission path even if an old config row
    // somehow predates the network-mandatory rule enforced on save (§ PUT
    // /api/admin/company-wallet-config) — an agent must never be allowed
    // to submit a USDT top-up with no network to send funds on.
    if (cleanMethod === "USDT" && !cleanText(config.usdt_network)) {
      return res.status(400).json({
        message: "USDT network is not configured for your account yet — contact your admin",
      });
    }

    const result = await pool.query(
      `INSERT INTO agent_topup_requests
        (agent_id, client_id, created_by_admin_id, method, amount,
         usdt_wallet_address, usdt_network, usdt_tx_hash,
         bank_name, bank_account_number, bank_ifsc, bank_utr, proof_file_path)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        agentId,
        scope.clientId,
        scope.adminId,
        cleanMethod,
        numericAmount,
        cleanMethod === "USDT" ? config.usdt_wallet_address : null,
        cleanMethod === "USDT" ? config.usdt_network : null,
        cleanMethod === "USDT" ? txRef : null,
        cleanMethod === "BANK_TRANSFER" ? config.bank_name : null,
        cleanMethod === "BANK_TRANSFER" ? config.bank_account_number : null,
        cleanMethod === "BANK_TRANSFER" ? config.bank_ifsc : null,
        cleanMethod === "BANK_TRANSFER" ? txRef : null,
        req.file.filename,
      ],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Agent topup submit error:", error);
    res.status(500).json({ message: "Could not submit top-up request" });
  }
});

app.get("/api/agent/topups", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Not allowed" });
    const agentId = Number(auth.userId);

    const { status, method, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = ["agent_id = $1"];
    const values = [agentId];
    if (status) { conditions.push(`status = $${values.length + 1}`); values.push(status); }
    if (method) { conditions.push(`method = $${values.length + 1}`); values.push(String(method).toUpperCase()); }
    if (from) { conditions.push(`submitted_at >= $${values.length + 1}`); values.push(from); }
    if (to) { conditions.push(`submitted_at <= $${values.length + 1}`); values.push(to); }
    const where = "WHERE " + conditions.join(" AND ");

    const countResult = await pool.query(`SELECT COUNT(*) FROM agent_topup_requests ${where}`, values);
    const rowsResult = await pool.query(
      `SELECT * FROM agent_topup_requests ${where} ORDER BY id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    const total = Number(countResult.rows[0].count);
    res.json({ data: rowsResult.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Agent topup list error:", error);
    res.status(500).json({ message: "Could not load top-up history" });
  }
});

app.get("/api/agent/wallet", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Not allowed" });

    const result = await pool.query(
      `SELECT available_balance FROM agent_wallets WHERE agent_id = $1`,
      [Number(auth.userId)],
    );
    res.json({ available_balance: Number(result.rows[0]?.available_balance || 0) });
  } catch (error) {
    console.error("Agent wallet fetch error:", error);
    res.status(500).json({ message: "Could not load wallet balance" });
  }
});

app.get("/api/agent/wallet/ledger", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Not allowed" });
    const agentId = Number(auth.userId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM agent_wallet_ledger WHERE agent_id = $1`,
      [agentId],
    );
    const rowsResult = await pool.query(
      `SELECT * FROM agent_wallet_ledger WHERE agent_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
      [agentId, limit, offset],
    );

    const total = Number(countResult.rows[0].count);
    res.json({ data: rowsResult.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Agent wallet ledger fetch error:", error);
    res.status(500).json({ message: "Could not load ledger history" });
  }
});

app.get("/api/agent/company-wallet-config", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Not allowed" });

    const scope = await resolveAgentTenantScope(auth);
    if (!scope) return res.status(404).json({ message: "Agent not found" });

    const config = await findCompanyWalletConfig(scope);
    if (!config) return res.status(404).json({ message: "Deposit details are not configured yet" });
    res.json(config);
  } catch (error) {
    console.error("Agent company-wallet-config fetch error:", error);
    res.status(500).json({ message: "Could not load deposit details" });
  }
});

// ─── ADMIN / SUPER-ADMIN: AGENT TOP-UP APPROVAL ───────────────────────────────
// Approvers are Admin (own tenant only) + Super-admin (all tenants). Matches
// settlement/withdrawal approval precedent in this codebase where financial
// sign-off stays at the tenant-owner level.

app.get("/api/admin/agent-topups", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { status, method, from, to, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    if (auth.role === "admin") {
      conditions.push(`ot.created_by_admin_id = $${values.length + 1}`);
      values.push(Number(auth.userId));
    } else {
      if (req.query.client_id) { conditions.push(`ot.client_id = $${values.length + 1}`); values.push(Number(req.query.client_id)); }
      if (req.query.admin_id) { conditions.push(`ot.created_by_admin_id = $${values.length + 1}`); values.push(Number(req.query.admin_id)); }
    }
    if (status) { conditions.push(`ot.status = $${values.length + 1}`); values.push(status); }
    if (method) { conditions.push(`ot.method = $${values.length + 1}`); values.push(String(method).toUpperCase()); }
    // Fixed: previously compared submitted_at (a timestamptz) directly against a
    // bare "YYYY-MM-DD" string, which Postgres reads as that day's midnight —
    // silently excluding everything submitted later that same UTC day (e.g.
    // to=2026-07-24 excluded a 09:56 UTC / 15:26 IST row). Use the same
    // IST-calendar-day-inclusive comparison as buildIstDateFilter/every other
    // date filter in this codebase instead of a raw timestamp compare.
    if (from) { conditions.push(`DATE(ot.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${values.length + 1}`); values.push(from); }
    if (to) { conditions.push(`DATE(ot.submitted_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${values.length + 1}`); values.push(to); }
    if (search) {
      conditions.push(`(o.name ILIKE $${values.length + 1} OR o.username ILIKE $${values.length + 1})`);
      values.push(`%${search}%`);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const baseFrom = `FROM agent_topup_requests ot LEFT JOIN agents o ON ot.agent_id = o.id ${where}`;

    const countResult = await pool.query(`SELECT COUNT(*) ${baseFrom}`, values);
    const rowsResult = await pool.query(
      `SELECT ot.*, o.name AS agent_name, o.username AS agent_username
       ${baseFrom} ORDER BY ot.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    const total = Number(countResult.rows[0].count);
    res.json({ data: rowsResult.rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin agent-topups list error:", error);
    res.status(500).json({ message: "Could not load top-up requests" });
  }
});

// First genuine SELECT ... FOR UPDATE in this codebase (issued via client.query
// inside a real client.query("BEGIN")). Locks the request row then the wallet
// row, in that fixed order, so concurrent approve attempts on the same request
// cannot both pass the Pending check and double-credit the wallet.
app.put("/api/admin/agent-topups/:id/approve", async (req, res) => {
  const auth = getAuthUser(req);
  if (!["admin", "super-admin"].includes(auth.role))
    return res.status(403).json({ message: "Forbidden" });

  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const scopeValues = [id];
    let scopeClause = "1=1";
    if (auth.role === "admin") {
      scopeClause = "created_by_admin_id = $2";
      scopeValues.push(Number(auth.userId));
    }

    const reqResult = await client.query(
      `SELECT * FROM agent_topup_requests WHERE id = $1 AND ${scopeClause} FOR UPDATE`,
      scopeValues,
    );
    if (reqResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Top-up request not found" });
    }
    const topup = reqResult.rows[0];
    if (topup.status !== "Pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This request has already been processed" });
    }

    const walletResult = await client.query(
      `SELECT * FROM agent_wallets WHERE agent_id = $1 FOR UPDATE`,
      [topup.agent_id],
    );
    if (walletResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(500).json({ message: "Wallet not initialized for this agent" });
    }
    const wallet = walletResult.rows[0];
    const newBalance = Number(wallet.available_balance) + Number(topup.amount);

    await client.query(
      `UPDATE agent_wallets SET available_balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, wallet.id],
    );

    await client.query(
      `INSERT INTO agent_wallet_ledger
        (agent_id, entry_type, amount, balance_after, reference_type, reference_id, created_by_role, created_by_id)
       VALUES ($1,'TOPUP_CREDIT',$2,$3,'topup_request',$4,$5,$6)`,
      [topup.agent_id, Number(topup.amount), newBalance, topup.id, auth.role, Number(auth.userId)],
    );

    const updated = await client.query(
      `UPDATE agent_topup_requests
       SET status = 'Approved', reviewed_by_role = $1, reviewed_by_id = $2, reviewed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [auth.role, Number(auth.userId), topup.id],
    );

    await client.query("COMMIT");
    res.json({ success: true, topup: updated.rows[0], wallet_balance: newBalance });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Agent topup approve error:", error);
    res.status(500).json({ message: error.message || "Could not approve top-up" });
  } finally {
    client.release();
  }
});

app.put("/api/admin/agent-topups/:id/reject", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const reason = cleanText(req.body?.reason);
    if (!reason) return res.status(400).json({ message: "Rejection reason is required" });
    if (reason.length > 500) return res.status(400).json({ message: "Rejection reason is too long (max 500 characters)" });

    const values = [reason, auth.role, Number(auth.userId), id];
    let query = `
      UPDATE agent_topup_requests
      SET status = 'Rejected', rejection_reason = $1, reviewed_by_role = $2, reviewed_by_id = $3, reviewed_at = NOW()
      WHERE id = $4 AND status = 'Pending'`;
    if (auth.role === "admin") {
      values.push(Number(auth.userId));
      query += ` AND created_by_admin_id = $${values.length}`;
    }
    query += ` RETURNING *`;

    const result = await pool.query(query, values);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Top-up request not found, not yours, or already processed" });

    res.json({ success: true, topup: result.rows[0] });
  } catch (error) {
    console.error("Agent topup reject error:", error);
    res.status(500).json({ message: "Could not reject top-up" });
  }
});

app.get("/api/agent-topups/:id/proof", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const { id } = req.params;

    let scope = "1=0";
    const values = [id];
    if (auth.role === "agent") {
      scope = "agent_id = $2";
      values.push(Number(auth.userId));
    } else if (auth.role === "admin") {
      scope = "created_by_admin_id = $2";
      values.push(Number(auth.userId));
    } else if (auth.role === "super-admin") {
      scope = "1=1";
    } else {
      return res.status(403).json({ message: "Not allowed" });
    }

    const result = await pool.query(
      `SELECT proof_file_path FROM agent_topup_requests WHERE id = $1 AND ${scope}`,
      values,
    );
    if (result.rows.length === 0 || !result.rows[0].proof_file_path)
      return res.status(404).json({ message: "Proof not found" });

    const filePath = path.join(TOPUP_PROOFS_DIR, path.basename(result.rows[0].proof_file_path));
    if (!fs.existsSync(filePath))
      return res.status(404).json({ message: "Proof not found" });

    res.sendFile(filePath);
  } catch (error) {
    console.error("Agent topup proof fetch error:", error);
    res.status(500).json({ message: "Could not load proof" });
  }
});

// ─── ADMIN / SUPER-ADMIN: COMPANY WALLET CONFIG ───────────────────────────────
// Per-client/tenant, not global — each Admin configures their own tenant's
// receiving USDT wallet + bank details; Super-admin can view/manage any
// tenant's. client_id is the primary key, falling back to created_by_admin_id
// for legacy admins with no client_id (same dual-key pattern used throughout).

// Explicit "Validate" action for the Admin UI (also fired on field blur).
// Authoritative validation still happens again inside PUT below — this
// endpoint exists purely for interactive feedback before the admin saves.
app.post("/api/admin/company-wallet-config/validate-upi", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const upiId = cleanText(req.body?.upi_id);
    if (!upiId) return res.status(400).json({ message: "UPI ID is required" });

    const valid = isUpiFormatValid(upiId);
    res.json({
      valid,
      verification_type: UPI_VERIFICATION_TYPE,
      message: valid
        ? "UPI ID format is valid. Note: only the format was checked — no UPI provider is configured to confirm the account actually exists."
        : "Invalid UPI ID format. Expected format: username@bank (e.g. name@okhdfcbank).",
    });
  } catch (error) {
    console.error("UPI validate error:", error);
    res.status(500).json({ message: "Could not validate UPI ID" });
  }
});

app.get("/api/admin/company-wallet-config", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    let clientId = null, adminId = null;
    if (auth.role === "admin") {
      adminId = Number(auth.userId);
      clientId = auth.clientId || null;
    } else {
      if (req.query.client_id) clientId = Number(req.query.client_id);
      if (req.query.admin_id) adminId = Number(req.query.admin_id);
      if (!clientId && !adminId)
        return res.status(400).json({ message: "client_id or admin_id is required" });
    }

    const config = await findCompanyWalletConfig({ clientId, adminId });
    if (!config) return res.status(404).json({ message: "No deposit details configured yet" });
    res.json(config);
  } catch (error) {
    console.error("Company wallet config fetch error:", error);
    res.status(500).json({ message: "Could not load deposit details" });
  }
});

app.put("/api/admin/company-wallet-config", uploadCompanyQr, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const {
      usdt_wallet_address, usdt_network, usdt_label,
      bank_name, bank_account_number, bank_ifsc, bank_account_holder_name, bank_upi_id,
      is_active,
    } = req.body;

    // UPI ID is optional (no QR is shown if unset — see findCompanyWalletConfig
    // consumers), but if one is provided it must pass format validation before
    // the config is saved. This is the authoritative check — the frontend's
    // on-blur/"Validate" call is only for interactive feedback and cannot be
    // relied on alone, since this route can be hit directly.
    const cleanUpiId = cleanText(bank_upi_id);
    if (cleanUpiId && !isUpiFormatValid(cleanUpiId)) {
      return res.status(400).json({
        message: "Invalid UPI ID format. Expected format: username@bank (e.g. name@okhdfcbank).",
      });
    }

    // Network is mandatory whenever a USDT wallet address is entered — an
    // address with no network is ambiguous (TRC20/ERC20/BEP20 addresses can
    // collide in format) and risks an agent sending funds on the wrong
    // chain. Authoritative here; the frontend also blocks this before submit.
    const cleanUsdtAddress = cleanText(usdt_wallet_address);
    const cleanUsdtNetwork = cleanText(usdt_network);
    if (cleanUsdtAddress && !cleanUsdtNetwork) {
      return res.status(400).json({
        message: "USDT Network is required whenever a wallet address is entered.",
      });
    }

    let clientId = null, adminId = null;
    if (auth.role === "admin") {
      adminId = Number(auth.userId);
      clientId = auth.clientId || null;
    } else {
      if (req.body.client_id) clientId = Number(req.body.client_id);
      if (req.body.admin_id) adminId = Number(req.body.admin_id);
      if (!clientId && !adminId)
        return res.status(400).json({ message: "client_id or admin_id is required" });
    }

    // multer populates req.body's non-file fields as strings, so `is_active`
    // may arrive as the string "false" instead of the boolean false when this
    // route is hit via multipart/form-data (needed whenever a QR file is
    // attached) — String(...) here keeps both the old JSON-body callers and
    // the new multipart ones correct.
    const activeFlag = String(is_active) !== "false";
    const updatedBy = Number(auth.role === "admin" ? auth.userId : (req.body.admin_id || auth.userId));

    // QR file: look up the existing row (regardless of is_active, unlike
    // findCompanyWalletConfig) to know what to replace/delete, then compute
    // the path to save — a new upload replaces it, remove_qr=true clears it,
    // otherwise the existing path is preserved (the upsert must not silently
    // null it out just because no new file was sent this time).
    const existingRow = clientId
      ? (await pool.query(`SELECT usdt_qr_file_path FROM company_wallet_configs WHERE client_id = $1`, [clientId])).rows[0]
      : (await pool.query(`SELECT usdt_qr_file_path FROM company_wallet_configs WHERE created_by_admin_id = $1 AND client_id IS NULL`, [adminId])).rows[0];
    const existingQrPath = existingRow?.usdt_qr_file_path || null;

    let qrFilePath = existingQrPath;
    if (req.file) {
      qrFilePath = `/uploads/company-qr/${req.file.filename}`;
    } else if (req.body.remove_qr === "true") {
      qrFilePath = null;
    }
    if ((req.file || req.body.remove_qr === "true") && existingQrPath) {
      const oldFilePath = path.join(__dirname, existingQrPath.replace(/^\//, ""));
      fs.unlink(oldFilePath, (e) => {
        if (e && e.code !== "ENOENT") console.error("QR file delete error:", e.message);
      });
    }

    let result;
    if (clientId) {
      result = await pool.query(
        `INSERT INTO company_wallet_configs
          (client_id, created_by_admin_id, usdt_wallet_address, usdt_network, usdt_label,
           bank_name, bank_account_number, bank_ifsc, bank_account_holder_name, bank_upi_id,
           is_active, updated_by_admin_id, usdt_qr_file_path, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
         ON CONFLICT (client_id) WHERE client_id IS NOT NULL DO UPDATE SET
           usdt_wallet_address = EXCLUDED.usdt_wallet_address,
           usdt_network = EXCLUDED.usdt_network,
           usdt_label = EXCLUDED.usdt_label,
           bank_name = EXCLUDED.bank_name,
           bank_account_number = EXCLUDED.bank_account_number,
           bank_ifsc = EXCLUDED.bank_ifsc,
           bank_account_holder_name = EXCLUDED.bank_account_holder_name,
           bank_upi_id = EXCLUDED.bank_upi_id,
           is_active = EXCLUDED.is_active,
           updated_by_admin_id = EXCLUDED.updated_by_admin_id,
           usdt_qr_file_path = EXCLUDED.usdt_qr_file_path,
           updated_at = NOW()
         RETURNING *`,
        [clientId, adminId, usdt_wallet_address || null, usdt_network || null, usdt_label || null,
          bank_name || null, bank_account_number || null, bank_ifsc || null, bank_account_holder_name || null, cleanUpiId || null,
          activeFlag, updatedBy, qrFilePath],
      );
    } else {
      result = await pool.query(
        `INSERT INTO company_wallet_configs
          (client_id, created_by_admin_id, usdt_wallet_address, usdt_network, usdt_label,
           bank_name, bank_account_number, bank_ifsc, bank_account_holder_name, bank_upi_id,
           is_active, updated_by_admin_id, usdt_qr_file_path, updated_at)
         VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (created_by_admin_id) WHERE client_id IS NULL DO UPDATE SET
           usdt_wallet_address = EXCLUDED.usdt_wallet_address,
           usdt_network = EXCLUDED.usdt_network,
           usdt_label = EXCLUDED.usdt_label,
           bank_name = EXCLUDED.bank_name,
           bank_account_number = EXCLUDED.bank_account_number,
           bank_ifsc = EXCLUDED.bank_ifsc,
           bank_account_holder_name = EXCLUDED.bank_account_holder_name,
           bank_upi_id = EXCLUDED.bank_upi_id,
           is_active = EXCLUDED.is_active,
           updated_by_admin_id = EXCLUDED.updated_by_admin_id,
           usdt_qr_file_path = EXCLUDED.usdt_qr_file_path,
           updated_at = NOW()
         RETURNING *`,
        [adminId, usdt_wallet_address || null, usdt_network || null, usdt_label || null,
          bank_name || null, bank_account_number || null, bank_ifsc || null, bank_account_holder_name || null, cleanUpiId || null,
          activeFlag, updatedBy, qrFilePath],
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Company wallet config upsert error:", error);
    res.status(500).json({ message: "Could not save deposit details" });
  }
});

// Super-admin only: every client, with a configured/unconfigured flag — the
// tenant picker for the super-admin config-management UI.
app.get("/api/admin/company-wallet-configs", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "super-admin")
      return res.status(403).json({ message: "Forbidden" });

    const result = await pool.query(
      `SELECT c.id AS client_id, c.company_name, c.domain_name,
              cwc.id AS config_id, cwc.usdt_wallet_address, cwc.usdt_network, cwc.usdt_label,
              cwc.bank_name, cwc.bank_account_number, cwc.bank_ifsc, cwc.bank_account_holder_name, cwc.bank_upi_id,
              cwc.is_active, cwc.updated_at,
              (cwc.id IS NOT NULL) AS configured
       FROM clients c
       LEFT JOIN company_wallet_configs cwc ON cwc.client_id = c.id
       ORDER BY c.company_name ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Company wallet configs list error:", error);
    res.status(500).json({ message: "Could not load deposit configs" });
  }
});

// ─── AGENT ACCOUNTS ────────────────────────────────────────────────────────
app.get("/api/agent-accounts", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    let query = `
      SELECT oa.*, a.name AS agent_name,
             la.last_active
      FROM agent_accounts oa
      LEFT JOIN agents a ON oa.agent_id = a.id
      LEFT JOIN (
        SELECT account_id, MAX(created_at) AS last_active
        FROM transactions WHERE account_id IS NOT NULL GROUP BY account_id
      ) la ON la.account_id = oa.id
    `;
    const values = [];

    const conditions_oa = [];
    if (role === "admin" && userId) {
      conditions_oa.push(`oa.created_by_admin_id = $${values.length + 1}`);
      values.push(userId);
    } else if (role === "agent") {
      conditions_oa.push(`oa.agent_id = $${values.length + 1}`);
      values.push(Number(auth.agentId || userId));
    }

    const clientId_oa = getClientId(auth);
    if (clientId_oa) {
      conditions_oa.push(`oa.client_id = $${values.length + 1}`);
      values.push(clientId_oa);
    }

    // Additive optional filter for the Super Admin "Inactive Bank Accounts"
    // Needs-Attention breakdown — omitted param adds no clause.
    if (req.query.is_active === "false" || req.query.is_active === "true") {
      conditions_oa.push(`oa.is_active = $${values.length + 1}`);
      values.push(req.query.is_active === "true");
    }

    if (conditions_oa.length) query += " WHERE " + conditions_oa.join(" AND ");
    query += ` ORDER BY oa.id DESC`;
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Agent accounts fetch error:", error);
    res.status(500).json({ message: "Could not fetch agent accounts" });
  }
});

// Agent-received proofs that were recorded (not erased) because the UTR already
// existed in `transactions` with a different amount. Lets the agent see that their
// submission was saved, and admins reconcile it.
app.get("/api/agent-received-proofs", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    let query = `
      SELECT orp.*, a.name AS agent_name
      FROM agent_received_proofs orp
      LEFT JOIN agents a ON a.id = orp.agent_id
    `;
    const values = [];
    if (role === "admin" && userId) {
      query += ` WHERE orp.created_by_admin_id = $1`;
      values.push(userId);
    } else if (role === "agent") {
      query += ` WHERE orp.agent_id = $1`;
      values.push(Number(auth.agentId || userId));
    }
    query += ` ORDER BY orp.id DESC`;

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Agent received proofs fetch error:", error);
    res.status(500).json({ message: "Could not fetch received proofs" });
  }
});

app.post("/api/agent-accounts", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const {
      agent_id,
      ifsc_code,
      account_number,
      account_holder_name,
      upi_id,
      max_payment_limit,
      min_transaction_amount,
      is_active,
    } = req.body;

    const finalAgentId =
      role === "agent"
        ? Number(auth.agentId || userId)
        : Number(agent_id || 0);
    if (!finalAgentId)
      return res.status(400).json({ message: "Please select agent" });

    const cleanIfsc = ifsc_code.trim().toUpperCase();
    const ifscResponse = await fetch(`https://ifsc.razorpay.com/${cleanIfsc}`);
    if (!ifscResponse.ok)
      return res
        .status(400)
        .json({
          message: "Invalid IFSC Code. Please enter a valid IFSC code.",
        });

    const ifscData = await ifscResponse.json();
    const bankName = ifscData.BANK || "";

    const agentResult = await pool.query(
      `SELECT created_by_admin_id FROM agents WHERE id = $1 LIMIT 1`,
      [finalAgentId],
    );
    if (agentResult.rows.length === 0)
      return res.status(400).json({ message: "Agent not found" });

    const adminId = agentResult.rows[0].created_by_admin_id;
    const clientId_oa = getClientId(auth);

    const result = await pool.query(
      `INSERT INTO agent_accounts (agent_id, created_by_admin_id, bank_name, ifsc_code, account_number, account_holder_name, upi_id, max_payment_limit, max_available_limit, min_transaction_amount, is_active, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        finalAgentId,
        adminId,
        bankName,
        cleanIfsc,
        account_number,
        account_holder_name,
        upi_id,
        max_payment_limit || 0,
        max_payment_limit || 0,
        min_transaction_amount || 0,
        is_active,
        clientId_oa,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Agent account create error:", error);
    res.status(500).json({ message: "Could not create agent account" });
  }
});

app.put("/api/agent-accounts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      ifsc_code,
      account_number,
      account_holder_name,
      upi_id,
      max_payment_limit,
      min_transaction_amount,
      is_active,
    } = req.body;

    const cleanIfsc = ifsc_code.trim().toUpperCase();
    const ifscResponse = await fetch(`https://ifsc.razorpay.com/${cleanIfsc}`);
    if (!ifscResponse.ok)
      return res
        .status(400)
        .json({
          message: "Invalid IFSC Code. Please enter a valid IFSC code.",
        });

    const ifscData = await ifscResponse.json();
    const bankName = ifscData.BANK || "";

    const result = await pool.query(
      `UPDATE agent_accounts SET bank_name=$1, ifsc_code=$2, account_number=$3, account_holder_name=$4, upi_id=$5, max_payment_limit=$6, max_available_limit=$7, min_transaction_amount=$8, is_active=$9
       WHERE id=$10 RETURNING *`,
      [
        bankName,
        cleanIfsc,
        account_number,
        account_holder_name,
        upi_id,
        max_payment_limit || 0,
        max_payment_limit || 0,
        min_transaction_amount || 0,
        is_active,
        id,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Agent account update error:", error);
    res.status(500).json({ message: "Could not update agent account" });
  }
});

app.delete("/api/agent-accounts/:id", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const { id } = req.params;

    // Ownership scope: agent can only delete their own account; admin theirs.
    const vals = [id];
    let scope = "";
    if (role === "agent") {
      scope = ` AND agent_id = $2`;
      vals.push(Number(auth.agentId || userId));
    } else if (role === "admin") {
      scope = ` AND created_by_admin_id = $2`;
      vals.push(userId);
    }

    // Block deletion if the account has any transaction history — it would break
    // reporting/reconciliation. Deactivate (Is Active = No) instead.
    const used = await pool.query(
      `SELECT 1 FROM transactions WHERE account_id = $1 LIMIT 1`,
      [id],
    );
    if (used.rows.length > 0) {
      return res.status(409).json({
        message:
          "This account has transactions and cannot be deleted. Turn it Inactive instead.",
      });
    }

    const del = await pool.query(
      `DELETE FROM agent_accounts WHERE id = $1${scope} RETURNING id`,
      vals,
    );
    if (del.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Account not found or not allowed" });
    }
    res.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    if (error && error.code === "23503") {
      return res.status(409).json({
        message:
          "This account is referenced by other records and cannot be deleted. Turn it Inactive instead.",
      });
    }
    console.log("Agent account delete error:", error);
    res.status(500).json({ message: "Could not delete agent account" });
  }
});

// ─── SETTLEMENT ACCOUNTS ──────────────────────────────────────────────────────
app.get("/api/settlement-accounts", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    let query = `
      SELECT sa.*, m.name AS merchant_name, m.agent_id, a.name AS agent_name
      FROM settlement_accounts sa
      LEFT JOIN merchants m ON sa.merchant_id = m.id
      LEFT JOIN agents a ON m.agent_id = a.id
    `;
    const values = [];

    const conditions_sa = [];
    if (role === "admin" && userId) {
      conditions_sa.push(`sa.created_by_admin_id = $${values.length + 1}`);
      values.push(userId);
    } else if (role === "merchant") {
      conditions_sa.push(`sa.merchant_id = $${values.length + 1}`);
      values.push(userId);
    } else if (role === "agent") {
      conditions_sa.push(`m.agent_id = $${values.length + 1}`);
      values.push(userId);
    }

    const clientId_sa = getClientId(auth);
    if (clientId_sa) {
      conditions_sa.push(`sa.client_id = $${values.length + 1}`);
      values.push(clientId_sa);
    }

    if (conditions_sa.length) query += " WHERE " + conditions_sa.join(" AND ");
    query += ` ORDER BY sa.id DESC`;
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Settlement accounts fetch error:", error);
    res.status(500).json({ message: "Could not fetch settlement accounts" });
  }
});

app.post("/api/settlement-accounts", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const {
      merchant_id,
      ifsc_code,
      account_number,
      account_holder_name,
      upi_id,
      max_payment_limit,
      min_transaction_amount,
      is_active,
    } = req.body;

    const finalMerchantId = role === "merchant" ? userId : merchant_id || null;
    const adminId = await getOwnerFromMerchant(finalMerchantId);
    const clientId_sa = getClientId(auth);

    const cleanIfsc = ifsc_code.trim().toUpperCase();
    const ifscResponse = await fetch(`https://ifsc.razorpay.com/${cleanIfsc}`);
    if (!ifscResponse.ok)
      return res
        .status(400)
        .json({
          message: "Invalid IFSC Code. Please enter a valid IFSC code.",
        });

    const ifscData = await ifscResponse.json();
    const bankName = ifscData.BANK || "";

    const result = await pool.query(
      `INSERT INTO settlement_accounts (merchant_id, created_by_admin_id, bank_name, ifsc_code, account_number, account_holder_name, upi_id, max_payment_limit, min_transaction_amount, is_active, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        finalMerchantId,
        adminId,
        bankName,
        cleanIfsc,
        account_number,
        account_holder_name,
        upi_id,
        max_payment_limit || 0,
        min_transaction_amount || 0,
        is_active,
        clientId_sa,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Settlement account create error:", error);
    res.status(500).json({ message: "Could not create settlement account" });
  }
});

app.put("/api/settlement-accounts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      merchant_id,
      ifsc_code,
      account_number,
      account_holder_name,
      upi_id,
      max_payment_limit,
      min_transaction_amount,
      is_active,
    } = req.body;

    const cleanIfsc = ifsc_code.trim().toUpperCase();
    const ifscResponse = await fetch(`https://ifsc.razorpay.com/${cleanIfsc}`);
    if (!ifscResponse.ok)
      return res
        .status(400)
        .json({
          message: "Invalid IFSC Code. Please enter a valid IFSC code.",
        });

    const ifscData = await ifscResponse.json();
    const bankName = ifscData.BANK || "";

    const result = await pool.query(
      `UPDATE settlement_accounts SET merchant_id=$1, bank_name=$2, ifsc_code=$3, account_number=$4, account_holder_name=$5, upi_id=$6, max_payment_limit=$7, min_transaction_amount=$8, is_active=$9
       WHERE id=$10 RETURNING *`,
      [
        merchant_id || null,
        bankName,
        cleanIfsc,
        account_number,
        account_holder_name,
        upi_id,
        max_payment_limit || 0,
        min_transaction_amount || 0,
        is_active,
        id,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Settlement account update error:", error);
    res.status(500).json({ message: "Could not update settlement account" });
  }
});

app.delete("/api/settlement-accounts/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    // Detach historical settlement transactions first — each one already stores its
    // own bank_name/account_number/etc., so nulling the FK keeps the record intact
    // while letting the account be deleted (the FK would otherwise block it).
    await client.query(
      "UPDATE settlement_transactions SET settlement_account_id = NULL WHERE settlement_account_id = $1",
      [id],
    );
    await client.query("DELETE FROM settlement_accounts WHERE id = $1", [id]);
    await client.query("COMMIT");
    res.json({ message: "Settlement account deleted successfully" });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("DELETE SETTLEMENT ACCOUNT ERROR", error);
    res
      .status(500)
      .json({ message: error.message || "Could not delete settlement account" });
  } finally {
    client.release();
  }
});

// ─── SETTLEMENT TRANSACTIONS ──────────────────────────────────────────────────
// app.get("/api/settlement-transactions", async (req, res) => {
//   try {
//     const auth = getAuthUser(req);
//     const role = auth.role;
//     const userId = Number(auth.userId);

//     let query = `
//       SELECT st.*, m.name AS merchant_name, o.name AS agent_name, a.name AS agent_name
//       FROM settlement_transactions st
//       LEFT JOIN merchants m ON st.merchant_id = m.id
//       LEFT JOIN agents o ON st.agent_id = o.id
//       LEFT JOIN agents a ON st.agent_id = a.id
//     `;
//     const values = [];

//     if (role === "admin" && userId) { query += ` WHERE st.created_by_admin_id = $1`; values.push(userId); }
//     else if (role === "agent") { query += ` WHERE st.agent_id = $1`; values.push(userId); }
//     else if (role === "merchant") { query += ` WHERE st.merchant_id = $1`; values.push(userId); }
//     else if (role === "agent") { query += ` WHERE st.agent_id = $1`; values.push(userId); }

//     query += ` ORDER BY st.id DESC`;
//     const result = await pool.query(query, values);
//     res.json(result.rows);
//   } catch (error) {
//     console.log("Settlement transactions fetch error:", error);
//     res.status(500).json({ message: "Could not fetch settlement transactions" });
//   }
// });

app.get("/api/settlement-transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);

    const viewRole = req.query.viewRole || req.headers.viewrole;
    const viewId = req.query.viewId || req.headers.viewid;

    const role = viewRole || auth.role;
    const userId = Number(viewId || auth.userId);

    let query = `
      SELECT st.*, m.name AS merchant_name, a.name AS agent_name
      FROM settlement_transactions st
      LEFT JOIN merchants m ON st.merchant_id = m.id
      LEFT JOIN agents a ON st.agent_id = a.id
      WHERE true
    `;

    const values = [];

    if (role === "merchant" && userId) {
      query += ` AND st.merchant_id = $${values.length + 1}`;
      values.push(userId);
    } else if (role === "agent" && userId) {
      query += ` AND st.agent_id = $${values.length + 1}`;
      values.push(userId);
    } else if (role === "admin" && userId) {
      query += ` AND st.created_by_admin_id = $${values.length + 1}`;
      values.push(userId);
    } else if (role === "super-admin") {
      // Super-admin sees everything — no ownership restriction. Previously
      // fell through to the deny-all "else" below, silently returning zero
      // rows for this role; fixed so super-admin breakdown drawers can use
      // this endpoint.
    } else {
      query += ` AND 1 = 0`;
    }

    // Additive optional filters for the Super Admin control-center breakdown
    // drawers — omitted params add no clause, so existing callers (which never
    // pass these) are unaffected.
    const { transaction_status, startDate, endDate } = req.query;
    if (transaction_status) {
      query += ` AND st.transaction_status = $${values.length + 1}`;
      values.push(transaction_status);
    }
    query += buildIstDateFilter(values, startDate, endDate, "st.created_at");

    query += ` ORDER BY st.id DESC`;

    const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10) || 1) : null;
    const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50)) : null;
    if (page && limit) {
      query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, (page - 1) * limit);
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Settlement transactions fetch error:", error);
    res
      .status(500)
      .json({ message: "Could not fetch settlement transactions" });
  }
});
app.post("/api/admin/settlement-transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const actualRole = auth.originalRole || auth.role;
    const actualUserId = Number(auth.originalUserId || auth.userId);

    if (actualRole !== "admin" || !actualUserId) {
      return res
        .status(403)
        .json({ message: "Only admin can create settlement from this page" });
    }

    const { amount, settlement_account_id, settlement_date } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0)
      return res.status(400).json({ message: "Valid amount is required" });
    if (!settlement_account_id)
      return res
        .status(400)
        .json({ message: "Settlement account is required" });

    const accountResult = await pool.query(
      `SELECT sa.*, m.agent_id, m.name AS merchant_name
       FROM settlement_accounts sa
       LEFT JOIN merchants m ON sa.merchant_id = m.id
       WHERE sa.id = $1 AND sa.is_active = true AND sa.created_by_admin_id = $2`,
      [settlement_account_id, actualUserId],
    );

    if (accountResult.rows.length === 0) {
      return res
        .status(400)
        .json({
          message: "This settlement account is not allowed for this admin",
        });
    }

    const account = accountResult.rows[0];

    // No minimum amount limit for merchant settlements (admin-created).
    if (numericAmount > Number(account.max_payment_limit || 0))
      return res
        .status(400)
        .json({
          message: `Maximum payment limit is ${account.max_payment_limit}`,
        });

    // Optional back-dating: admin may set the settlement date; when omitted the
    // row falls back to the current timestamp. Stored at noon so IST date
    // bucketing (used by reports/reconciliation) lands on the chosen day.
    const settlementCreatedAt = settlement_date
      ? `${settlement_date} 12:00:00`
      : null;

    const result = await pool.query(
      `INSERT INTO settlement_transactions (amount, utr_number, bank_name, ifsc_code, account_number, account_holder_name, upi_id, transaction_status, approved_or_reject_date, settlement_account_id, merchant_id, agent_id, created_by_admin_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, COALESCE($14::timestamp, NOW())) RETURNING *`,
      [
        numericAmount,
        "",
        account.bank_name || "",
        account.ifsc_code || "",
        account.account_number || "",
        account.account_holder_name || "",
        account.upi_id || "",
        "Pending",
        null,
        account.id,
        account.merchant_id,
        account.agent_id || null,
        actualUserId,
        settlementCreatedAt,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return;
    console.log("Admin settlement transaction create error:", error);
    res
      .status(500)
      .json({ message: "Could not create admin settlement transaction" });
  }
});

app.post("/api/settlement-transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const { amount, settlement_account_id, agent_id } = req.body;

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0)
      return res.status(400).json({ message: "Valid amount is required" });
    if (!settlement_account_id)
      return res
        .status(400)
        .json({ message: "Settlement account is required" });

    const finalAgentId = role === "agent" ? userId : agent_id;
    if (!finalAgentId)
      return res.status(400).json({ message: "Agent not found" });

    const agentResult = await pool.query(
      `SELECT * FROM agents WHERE id = $1 AND is_active = true`,
      [finalAgentId],
    );
    if (agentResult.rows.length === 0)
      return res.status(400).json({ message: "Active agent not found" });

    const agent = agentResult.rows[0];

    const accountResult = await pool.query(
      `SELECT sa.*, m.agent_id, m.name AS merchant_name
       FROM settlement_accounts sa LEFT JOIN merchants m ON sa.merchant_id = m.id
       WHERE sa.id = $1 AND sa.is_active = true AND m.agent_id = $2`,
      [settlement_account_id, agent.id],
    );

    if (accountResult.rows.length === 0)
      return res
        .status(400)
        .json({
          message: "This settlement account is not allowed for this agent",
        });

    const account = accountResult.rows[0];
    if (numericAmount < Number(account.min_transaction_amount || 0))
      return res
        .status(400)
        .json({
          message: `Minimum transaction amount is ${account.min_transaction_amount}`,
        });
    if (numericAmount > Number(account.max_payment_limit || 0))
      return res
        .status(400)
        .json({
          message: `Maximum payment limit is ${account.max_payment_limit}`,
        });

    const result = await pool.query(
      `INSERT INTO settlement_transactions (amount, utr_number, bank_name, ifsc_code, account_number, account_holder_name, upi_id, transaction_status, approved_or_reject_date, settlement_account_id, merchant_id, agent_id, created_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        numericAmount,
        "",
        account.bank_name || "",
        account.ifsc_code || "",
        account.account_number || "",
        account.account_holder_name || "",
        account.upi_id || "",
        "Pending",
        null,
        account.id,
        account.merchant_id,
        agent.id,
        agent.created_by_admin_id || account.created_by_admin_id || null,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Settlement transaction create error:", error);
    res
      .status(500)
      .json({ message: "Could not create settlement transaction" });
  }
});

app.put(
  "/api/settlement-transactions/:id/utr",
  uploadSettlementProof,
  async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const { id } = req.params;
    const { utr_number } = req.body;
    const proofPath = req.file ? `/uploads/${req.file.filename}` : "";

    if (!utr_number || !utr_number.trim())
      return res.status(400).json({ message: "UTR number is required" });

    await assertUniqueUtr(utr_number, "settlement_transactions", id);

    const values = [utr_number.trim()];
    let setClause = `utr_number = $1, transaction_status = 'Pending', approved_or_reject_date = NULL`;
    if (proofPath) {
      values.push(proofPath);
      setClause += `, proof = $${values.length}`;
    }
    values.push(id);
    let query = `UPDATE settlement_transactions SET ${setClause} WHERE id = $${values.length}`;

    if (role === "agent") {
      values.push(userId);
      query += ` AND agent_id = $${values.length}`;
    }
    query += ` RETURNING *`;

    const result = await pool.query(query, values);
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ message: "Settlement transaction not found" });
    res.json(result.rows[0]);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return;
    res.status(500).json({ message: "Could not update UTR" });
  }
});

app.put("/api/settlement-transactions/:id/status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const { id } = req.params;
    const { transaction_status } = req.body;

    if (!["Approved", "Rejected"].includes(transaction_status))
      return res
        .status(400)
        .json({ message: "Status must be Approved or Rejected" });

    let query = `UPDATE settlement_transactions SET transaction_status = $1, approved_or_reject_date = CURRENT_TIMESTAMP WHERE id = $2`;
    const values = [transaction_status, id];

    if (role === "merchant") {
      query += ` AND merchant_id = $3`;
      values.push(userId);
    } else if (role === "agent") {
      query += ` AND agent_id = $3`;
      values.push(userId);
    }
    query += ` RETURNING *`;

    const result = await pool.query(query, values);
    if (result.rows.length === 0)
      return res
        .status(404)
        .json({
          message: "Settlement transaction not found or not authorized",
        });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Could not update settlement status" });
  }
});

// ─── AGENT → ADMIN SETTLEMENT (agent creates, admin approves) ────────────────
app.post("/api/agent/settlement-transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;

    const loggedInAgentId = Number(auth.agentId || auth.userId);
    const payloadAgentId = Number(req.body.agent_id || req.body.agentId || 0);
    const finalAgentId = payloadAgentId || loggedInAgentId;

    if (role !== "agent" || !loggedInAgentId) {
      return res
        .status(403)
        .json({ message: "Only agent can create this settlement" });
    }

    if (!finalAgentId || finalAgentId !== loggedInAgentId) {
      return res
        .status(403)
        .json({ message: "Agent is not authorized for this settlement" });
    }

    const numericAmount = Number(req.body.amount);

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const agentResult = await pool.query(
      `SELECT id, created_by_admin_id 
       FROM agents 
       WHERE id = $1 AND is_active = true`,
      [finalAgentId],
    );

    if (agentResult.rows.length === 0) {
      return res.status(400).json({ message: "Active agent not found" });
    }

    const agent = agentResult.rows[0];

    if (!agent.created_by_admin_id) {
      return res
        .status(400)
        .json({ message: "This agent is not linked to any admin" });
    }

    const result = await pool.query(
      `INSERT INTO settlement_transactions
        (
          amount,
          utr_number,
          bank_name,
          ifsc_code,
          account_number,
          account_holder_name,
          upi_id,
          transaction_status,
          approved_or_reject_date,
          settlement_account_id,
          merchant_id,
          agent_id,
          created_by_admin_id,
          created_by_agent_id
        )
       VALUES
        ($1, '', '', '', '', '', '', 'Pending', NULL, NULL, NULL, $2, $3, $4)
       RETURNING *`,
      [numericAmount, finalAgentId, agent.created_by_admin_id, finalAgentId],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.log("Agent settlement create error:", error);
    res.status(500).json({ message: "Could not create settlement request" });
  }
});

// ─── ADMIN: GET AGENT-CREATED SETTLEMENTS (for approve/reject page) ───────────
app.get("/api/admin/agent-created-settlements", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const actualRole = auth.originalRole || auth.role;
    const actualUserId = Number(auth.originalUserId || auth.userId);

    if (actualRole !== "admin" || !actualUserId) {
      return res.status(403).json({ message: "Admin only" });
    }

    const result = await pool.query(
      `SELECT st.*, a.name AS agent_name
       FROM settlement_transactions st
       LEFT JOIN agents a ON st.agent_id = a.id
       WHERE st.created_by_agent_id IS NOT NULL
         AND st.created_by_admin_id = $1
       ORDER BY st.id DESC`,
      [actualUserId],
    );
    res.json(result.rows);
  } catch (error) {
    console.log("Admin agent-created settlements fetch error:", error);
    res
      .status(500)
      .json({ message: "Could not fetch agent settlement requests" });
  }
});

// ─── ADMIN: APPROVE/REJECT AGENT-CREATED SETTLEMENTS ─────────────────────────
app.put("/api/admin/agent-created-settlements/:id/status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const actualRole = auth.originalRole || auth.role;
    const actualUserId = Number(auth.originalUserId || auth.userId);

    if (actualRole !== "admin" || !actualUserId) {
      return res.status(403).json({ message: "Admin only" });
    }

    const { id } = req.params;
    const { transaction_status, notes } = req.body;

    if (!["Approved", "Rejected"].includes(transaction_status)) {
      return res
        .status(400)
        .json({ message: "Status must be Approved or Rejected" });
    }

    const result = await pool.query(
      `UPDATE settlement_transactions
       SET 
         transaction_status = $1,
         notes = $2,
         approved_or_reject_date = CURRENT_TIMESTAMP
       WHERE id = $3
         AND created_by_agent_id IS NOT NULL
         AND created_by_admin_id = $4
       RETURNING *`,
      [transaction_status, notes || "", id, actualUserId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Settlement not found or not authorized" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.log("Update agent settlement status error:", error);
    res.status(500).json({ message: "Could not update settlement status" });
  }
});

app.post("/api/admin/agent-settlement-transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const actualRole = auth.originalRole || auth.role;
    const actualUserId = Number(auth.originalUserId || auth.userId);

    if (actualRole !== "admin" || !actualUserId) {
      return res
        .status(403)
        .json({ message: "Only admin can create agent settlement" });
    }

    const { amount, agent_id } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0)
      return res.status(400).json({ message: "Valid amount is required" });
    if (!agent_id)
      return res.status(400).json({ message: "Agent is required" });

    // Verify agent belongs to this admin
    const agentResult = await pool.query(
      `SELECT id, name FROM agents WHERE id = $1 AND created_by_admin_id = $2`,
      [Number(agent_id), actualUserId],
    );
    if (agentResult.rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Agent not found or not authorized" });
    }

    const result = await pool.query(
      `INSERT INTO settlement_transactions (amount, utr_number, bank_name, ifsc_code, account_number, account_holder_name, upi_id, transaction_status, approved_or_reject_date, settlement_account_id, merchant_id, agent_id, created_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        numericAmount,
        "",
        "",
        "",
        "",
        "",
        "",
        "Pending",
        null,
        null,
        null,
        Number(agent_id),
        actualUserId,
      ],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Admin agent settlement create error:", error);
    res
      .status(500)
      .json({
        message: "Could not create admin-to-agent settlement transaction",
      });
  }
});

// ─── AGENT → AGENT SETTLEMENT ─────────────────────────────────────────────
// ─── TRANSACTIONS / PAYINS ────────────────────────────────────────────────────
app.get("/api/transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    let query = `
      SELECT t.*, m.name AS merchant_name, m.is_active AS merchant_status,
             a.name AS agent_name, a.is_active AS agent_status
      FROM transactions t
      LEFT JOIN merchants m ON t.merchant_id = m.id
      LEFT JOIN agents a ON t.agent_id = a.id
    `;
    const values = [];

    const conds_t = [];
    if (role === "admin" && userId) { conds_t.push(`t.created_by_admin_id = $${values.length+1}`); values.push(userId); }
    else if (role === "agent") { conds_t.push(`t.agent_id = $${values.length+1}`); values.push(userId); conds_t.push(`t.status <> 'Agent Verified'`); }
    else if (role === "merchant") {
      // Own transactions PLUS agent-verified bank proofs under this merchant's agent,
      // so the merchant can see incoming bank credits (for reconciliation / matching).
      conds_t.push(`(t.merchant_id = $${values.length+1} OR (t.status = 'Agent Verified' AND t.agent_id = (SELECT agent_id FROM merchants WHERE id = $${values.length+1})))`);
      values.push(userId);
    }

    const clientId_t = getClientId(getAuthUser(req));
    if (clientId_t) {
      conds_t.push(`t.client_id = $${values.length+1}`);
      values.push(clientId_t);
    }

    // Additive optional filters for the Super Admin control-center breakdown
    // drawers — omitted params add no clause, so every existing caller's
    // behavior (and the role-based scoping above) is unaffected.
    const { status, startDate, endDate, merchant_id, agent_id, webhook_failed } = req.query;
    if (status) {
      // Supports a single status or a comma-separated list (e.g.
      // status=Failed,Expired for the "Failed/Expired Pay-Ins" Needs-Attention
      // breakdown), matching this column's existing free-text status values.
      const statusList = String(status).split(",").map((s) => s.trim()).filter(Boolean);
      if (statusList.length === 1) {
        conds_t.push(`t.status = $${values.length + 1}`);
        values.push(statusList[0]);
      } else if (statusList.length > 1) {
        const placeholders = statusList.map((_, i) => `$${values.length + 1 + i}`);
        conds_t.push(`t.status IN (${placeholders.join(",")})`);
        values.push(...statusList);
      }
    }
    if (merchant_id) { conds_t.push(`t.merchant_id = $${values.length + 1}`); values.push(Number(merchant_id)); }
    if (agent_id) { conds_t.push(`t.agent_id = $${values.length + 1}`); values.push(Number(agent_id)); }
    if (webhook_failed === "true") {
      // Mirrors the Needs-Attention "failed webhooks" count exactly: write-once,
      // no retry — see fireWebhook(). 7-day window keeps this actionable.
      conds_t.push(`t.webhook_sent = false AND t.webhook_url IS NOT NULL AND t.webhook_url <> '' AND t.created_at >= NOW() - INTERVAL '7 days'`);
    }
    // buildIstDateFilter returns a " AND ..." fragment (or "") meant to follow
    // an existing WHERE clause — strip the leading " AND " and fold it into
    // conds_t instead, since conds_t may otherwise be empty (no WHERE at all).
    const dateFragment = buildIstDateFilter(values, startDate, endDate, "t.created_at");
    if (dateFragment) conds_t.push(dateFragment.replace(/^ AND /, ""));

    if (conds_t.length) query += " WHERE " + conds_t.join(" AND ");
    query += ` ORDER BY t.id DESC`;

    const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10) || 1) : null;
    const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50)) : null;
    if (page && limit) {
      query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, (page - 1) * limit);
    }

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Transactions fetch error:", error);
    res.status(500).json({ message: "Could not fetch transactions" });
  }
});

app.post("/api/transactions/:id/trigger-webhook", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin", "agent"].includes(auth.role)) {
      return res.status(403).json({ message: "Forbidden — admin/agent only" });
    }

    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM transactions WHERE id = $1 LIMIT 1`,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const txn = result.rows[0];

    // Scope check: agent can only trigger for their own transactions
    if (auth.role === "agent" && Number(txn.agent_id) !== Number(auth.userId)) {
      return res.status(403).json({ message: "Not your transaction" });
    }

    if (!txn.webhook_url || !txn.webhook_url.trim()) {
      return res.status(400).json({ message: "No webhook URL found" });
    }

    await fireWebhook(pool, txn);

    res.json({ message: "Webhook triggered successfully" });
  } catch (error) {
    console.log("Manual webhook trigger error:", error);
    res.status(500).json({ message: "Could not trigger webhook" });
  }
});

app.post("/api/payins", async (req, res) => {
  try {
    const maintenanceCheck = await checkMaintenanceBlocksPayins();
    if (maintenanceCheck.blocked)
      return res.status(503).json({ message: maintenanceCheck.message, maintenance: true });

    const { amount, webhook_url, unique_id, merchant_id } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0)
      return res.status(400).json({ message: "Valid amount is required" });

    let merchant = null,
      merchantId = null,
      agentId = null;

    if (merchant_id) {
      const mResult = await pool.query(
        `SELECT * FROM merchants WHERE id = $1`,
        [merchant_id],
      );
      if (mResult.rows.length > 0) {
        merchant = mResult.rows[0];
        merchantId = merchant.id || null;
        agentId = merchant.agent_id || null;
      }
    }

    const account = await findCandidateAgentAccount(pool, {
      amount: numericAmount,
      merchantId,
      requireAgentRestriction: false,
    });

    if (!account)
      return res
        .status(400)
        .json({
          message: "No active agent bank account has enough available limit",
        });

    const transactionId = crypto.randomBytes(12).toString("hex");

    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");

      result = await client.query(
        `INSERT INTO transactions (transaction_id, amount, utr_number, payment_proof, bank_name, ifsc_code, account_number, account_holder_name, upi_id, account_id, merchant_id, agent_id, created_by_admin_id, max_payment_limit, max_available_limit, min_transaction_amount, webhook_url, unique_id, approved_or_reject_date, status, client_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [
          transactionId,
          numericAmount,
          "",
          "",
          account.bank_name,
          account.ifsc_code,
          account.account_number,
          account.account_holder_name,
          account.upi_id,
          account.id,
          merchantId,
          account.agent_id || agentId,
          account.created_by_admin_id || account.agent_owner_id || null,
          account.max_payment_limit || 0,
          account.max_available_limit || 0,
          account.min_transaction_amount || 0,
          webhook_url || "",
          unique_id || "",
          null,
          "Pending",
          merchant?.client_id || null,
        ],
      );

      if (isWalletGateEnabled()) {
        // Informational debit only — never blocks Pay-In creation. See
        // debitAgentWalletForPayin: it cannot return ok:false for
        // insufficient balance anymore, so there is no failure branch here.
        await debitAgentWalletForPayin(client, {
          agentId: account.agent_id,
          amount: numericAmount,
          transactionId: result.rows[0].id,
        });
      }

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    // Account eligibility/routing (max_payment_limit vs. committed_today,
    // is_active, min_transaction_amount) is entirely unaffected by the wallet
    // debit above — it is computed live in findCandidateAgentAccount and
    // never depends on wallet balance.
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Payin create error:", error);
    res.status(500).json({ message: "Could not create payin" });
  }
});

app.post("/api/transactions/:id/resolve-dispute", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action } = req.body || {};

    if (action !== "approve" && action !== "reject") {
      return res
        .status(400)
        .json({ message: "action must be 'approve' or 'reject'" });
    }

    await client.query("BEGIN");

    // FOR UPDATE — closes the one gap in the payin lifecycle that had no row
    // lock: without it, two concurrent resolve-dispute("approve") calls for
    // the same transaction could both read status='Disputed' before either
    // commits, and both proceed to re-debit the agent's wallet.
    const existing = await client.query(
      `SELECT * FROM transactions WHERE id = $1 AND status = 'Disputed' LIMIT 1 FOR UPDATE`,
      [id],
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ message: "Disputed transaction not found" });
    }

    const txn = existing.rows[0];

    if (action === "approve") {
      const disputedUtr = String(txn.disputed_utr || "").trim();
      if (!disputedUtr) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "No disputed UTR on this transaction" });
      }

      const collision = await client.query(
        `SELECT id FROM transactions
         WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
           AND id <> $2
           AND COALESCE(TRIM(utr_number), '') <> ''
         LIMIT 1`,
        [disputedUtr, id],
      );
      if (collision.rows.length > 0) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({
            message: "Disputed UTR is already used on another transaction",
          });
      }

      const updated = await client.query(
        `UPDATE transactions
         SET utr_number = $1,
             status = 'Approved',
             approved_or_reject_date = NOW()
         WHERE id = $2
         RETURNING *`,
        [disputedUtr, id],
      );

      // max_available_limit is no longer independently re-debited — the
      // agent wallet re-debit below is the single source of truth.

      if (isWalletGateEnabled() && txn.agent_id && Number(txn.amount) > 0) {
        // Informational re-debit only — never blocks dispute approval. See
        // redebitAgentWalletForPayin: it cannot return ok:false for
        // insufficient balance anymore, so there is no failure branch here.
        await redebitAgentWalletForPayin(client, {
          agentId: txn.agent_id,
          amount: Number(txn.amount),
          transactionId: txn.id,
        });
      }

      await client.query("COMMIT");

      const approvedTxn = updated.rows[0];
      fireWebhook(pool, approvedTxn, "payin.approved");

      return res.json({
        success: true,
        message: "Dispute approved. Transaction marked as Approved.",
        transaction: approvedTxn,
      });
    }

    const updated = await client.query(
      `UPDATE transactions
       SET status = 'Rejected',
           approved_or_reject_date = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );

    await client.query("COMMIT");

    const rejectedTxn = updated.rows[0];
    fireWebhook(pool, rejectedTxn, "payin.failed");

    return res.json({
      success: true,
      message: "Dispute rejected. Transaction marked as Rejected.",
      transaction: rejectedTxn,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("RESOLVE DISPUTE ERROR", error);
    return res
      .status(500)
      .json({ message: error.message || "Could not resolve dispute" });
  } finally {
    client.release();
  }
});

// Rescue an Expired/Failed/unmatched payin: the customer paid into the bank but
// never submitted a UTR (so the order expired). Staff reads the UTR off the bank
// credit, enters it here, and the order is approved + webhook fired. Recovers money
// that would otherwise stay uncredited.
app.post("/api/transactions/:id/rescue", async (req, res) => {
  const client = await pool.connect();
  try {
    const auth = getAuthUser(req);
    if (!["agent", "admin", "super-admin"].includes(auth.role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { id } = req.params;
    const utr = String(req.body?.utr_number || "").trim();
    if (!utr) return res.status(400).json({ message: "utr_number is required" });

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT * FROM transactions WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Transaction not found" });
    }
    const txn = existing.rows[0];

    if (["Approved", "Success"].includes(txn.status)) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ message: `Transaction is already ${txn.status}` });
    }

    // UTR must be unique among LIVE transactions. A dead order (Failed/Rejected/
    // Expired) or an agent-verified proof holding this UTR must not block the
    // correct order from claiming it.
    const collision = await client.query(
      `SELECT id FROM transactions
       WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
         AND id <> $2
         AND COALESCE(TRIM(utr_number), '') <> ''
         AND status NOT IN ('Failed','Rejected','Expired','Agent Verified','Disputed')
       LIMIT 1`,
      [utr, id],
    );
    if (collision.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ message: "This UTR is already used on another transaction" });
    }

    // SAFEGUARD: only rescue-approve if a real bank receipt (agent-verified proof)
    // matches this UTR AND amount. Blocks crediting e.g. an ₹80,000 order against a
    // ₹10,000 payment. Bank UTRs carry a leading "T" — normalize before comparing.
    const proofMatch = await client.query(
      `SELECT id, amount FROM transactions
       WHERE status = 'Agent Verified'
         AND regexp_replace(lower(trim(utr_number)), '^t', '') = regexp_replace(lower(trim($1)), '^t', '')
         AND ABS(amount - $2) < 1
       LIMIT 1`,
      [utr, Number(txn.amount || 0)],
    );
    if (proofMatch.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Cannot approve: no verified bank receipt matches UTR ${utr} for ₹${Number(txn.amount || 0)}. This payment is not confirmed against a real bank credit of the SAME amount — do not approve until an agent-verified proof matches both the UTR and the amount.`,
      });
    }

    const updated = await client.query(
      `UPDATE transactions
       SET utr_number = $1,
           status = 'Approved',
           utr_submitted_at = COALESCE(utr_submitted_at, NOW()),
           approved_or_reject_date = NOW()
       WHERE id = $2
       RETURNING *`,
      [utr, id],
    );

    await client.query("COMMIT");

    const approvedTxn = updated.rows[0];
    fireWebhook(pool, approvedTxn, "payin.approved");

    return res.json({
      success: true,
      message: "Expired order rescued and approved.",
      transaction: approvedTxn,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("RESCUE TRANSACTION ERROR", error);
    return res
      .status(500)
      .json({ message: error.message || "Could not rescue transaction" });
  } finally {
    client.release();
  }
});

app.put(
  "/api/transactions/:id/proof",
  upload.single("payment_proof"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { utr_number } = req.body;
      const proofPath = req.file ? `/uploads/${req.file.filename}` : "";
      const cleanUtr = String(utr_number || "").trim();

      if (!cleanUtr && !proofPath) {
        client.release();
        return res
          .status(400)
          .json({ message: "Please add UTR number or upload payment proof" });
      }

      await client.query("BEGIN");

      const currentResult = await client.query(
        `SELECT * FROM transactions WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (currentResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Transaction not found" });
      }
      const current = currentResult.rows[0];

      if (current.status === "Approved") {
        await client.query("ROLLBACK");
        const sameUtr =
          String(current.utr_number || "")
            .trim()
            .toLowerCase() === cleanUtr.toLowerCase();
        if (!cleanUtr || sameUtr) {
          return res.json({
            message: "Transaction already approved.",
            transaction: current,
          });
        }
        return res
          .status(409)
          .json({
            message: "Transaction already approved with a different UTR.",
            utr_number: current.utr_number,
          });
      }

      if (cleanUtr) {
        const orphanResult = await client.query(
          `SELECT * FROM transactions
         WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
           AND id <> $2
         LIMIT 1`,
          [cleanUtr, id],
        );

        if (orphanResult.rows.length > 0) {
          const orphan = orphanResult.rows[0];

          // Match by amount + UTR only (UTR is unique system-wide). Drop account_id requirement.
          // Amounts match within <₹1 so a 1944 proof still merges with a 1944.44 payment.
          const sameAmount = amountsMatch(orphan.amount, current.amount);
          // A stray agent bank-credit proof (unique_id "proof-…", no merchant)
          // can occasionally end up in Pending; it still represents a real credit
          // for this UTR, so treat it as mergeable rather than throwing "UTR
          // already exists". Normal merchant Pending orders are NOT auto-merged.
          const isAgentProofRow =
            String(orphan.unique_id || "").startsWith("proof-") &&
            orphan.merchant_id == null &&
            orphan.agent_id != null;
          const mergeable =
            sameAmount &&
            (orphan.status === "Approved" ||
              orphan.status === "Agent Verified" ||
              (isAgentProofRow && orphan.status === "Pending"));

          if (mergeable) {
            // Delete the orphan first - the unique UTR index would reject the UPDATE below
            // while the orphan still holds the same UTR.
            await client.query(`DELETE FROM transactions WHERE id = $1`, [
              orphan.id,
            ]);

            const merged = await client.query(
              `UPDATE transactions
             SET utr_number = $1,
                 payment_proof = COALESCE(NULLIF($2, ''), $3),
                 status = 'Approved',
                 utr_submitted_at = COALESCE(utr_submitted_at, NOW()),
                 approved_or_reject_date = NOW()
             WHERE id = $4
             RETURNING *`,
              [cleanUtr, proofPath, orphan.payment_proof || "", id],
            );

            // Refund the agent's wallet if the deleted orphan had already
            // debited it (only "Approved" orphans ever did — "Agent
            // Verified" proofs never routed/debited in the first place).
            // Previously this only refunded the legacy max_available_limit
            // counter and never touched the wallet at all — a real leak,
            // since the orphan's original debit is now permanently gone
            // (the row is deleted) with nothing crediting it back.
            if (
              isWalletGateEnabled() &&
              orphan.status === "Approved" &&
              orphan.agent_id &&
              Number(orphan.amount) > 0
            ) {
              await refundAgentWalletForPayin(client, {
                agentId: orphan.agent_id,
                amount: Number(orphan.amount),
                transactionId: orphan.id,
                notes: "Orphan transaction merged/deleted during proof verification",
              });
            }

            await client.query("COMMIT");

            const mergedTxn = merged.rows[0];
            fireWebhook(pool, mergedTxn);

            return res.json({
              message:
                orphan.status === "Agent Verified"
                  ? "Matched agent's proof. Transaction approved."
                  : "Matched agent's submission. Transaction approved.",
              transaction: mergedTxn,
            });
          }

          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ message: "UTR number already exists. UTR cannot repeat." });
        }
      }

      const result = await client.query(
        `UPDATE transactions SET utr_number=$1, payment_proof=$2, status='Pending', utr_submitted_at = COALESCE(utr_submitted_at, NOW()), approved_or_reject_date=NULL WHERE id=$3 RETURNING *`,
        [cleanUtr, proofPath, id],
      );

      await client.query("COMMIT");
      res.json(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (handleKnownValidationError(res, error)) return;
      console.log("Update proof error:", error);
      res.status(500).json({ message: "Could not update payment proof" });
    } finally {
      client.release();
    }
  },
);

app.put("/api/transactions/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      transaction_id,
      amount,
      utr_number,
      bank_name,
      ifsc_code,
      account_number,
      account_holder_name,
      upi_id,
      approved_or_reject_date,
      status,
    } = req.body;

    // Admin / super-admin may approve directly from the edit page, overriding the
    // agent-verified-proof safeguard below (owner-authorized manual approval).
    const authUser = getAuthUser(req);
    const isAdminApprover = ["admin", "super-admin"].includes(
      authUser.originalRole || authUser.role,
    );

    await assertUniqueUtr(utr_number, "transactions", id);

    // SAFEGUARD: a hosted-checkout payin can only be manually approved if a real
    // bank receipt (agent-verified proof) matches its UTR + amount. This blocks
    // blind manual approvals — e.g. crediting an ₹80,000 checkout against a ₹10,000
    // payment. The bank stores UTRs with a leading "T"; normalize it before matching.
    // Admins bypass this check (isAdminApprover).
    if (status === "Approved" && !isAdminApprover) {
      const cur = (
        await pool.query(
          `SELECT checkout_mode, status AS cur_status, amount, utr_number FROM transactions WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (cur && cur.checkout_mode && cur.cur_status !== "Approved") {
        const effUtr = String(utr_number || "").trim() || cur.utr_number || "";
        const effAmount = Number(amount) > 0 ? Number(amount) : Number(cur.amount || 0);
        const match = await pool.query(
          `SELECT id FROM transactions
           WHERE status = 'Agent Verified'
             AND regexp_replace(lower(trim(utr_number)), '^t', '') = regexp_replace(lower(trim($1)), '^t', '')
             AND ABS(amount - $2) < 1
           LIMIT 1`,
          [effUtr, effAmount],
        );
        if (match.rows.length === 0) {
          return res.status(400).json({
            message: `Cannot approve: no verified bank receipt matches UTR ${effUtr || "(none)"} for ₹${effAmount}. This payment is not confirmed against a real bank credit — approve only once an agent-verified proof matches the UTR AND amount.`,
          });
        }
      }
    }

    const result = await pool.query(
      // Preserve the customer's submitted UTR: if the incoming utr_number is blank
      // (e.g. an agent rejecting the transaction), keep the existing UTR instead
      // of wiping it, so rejected rows still show the UTR the client submitted.
      `UPDATE transactions SET transaction_id=$1, amount=$2,
              utr_number = CASE WHEN COALESCE(TRIM($3),'') = '' THEN utr_number ELSE $3 END,
              bank_name=$4, ifsc_code=$5, account_number=$6, account_holder_name=$7, upi_id=$8, approved_or_reject_date=$9, status=$10
       WHERE id=$11 RETURNING *`,
      [
        transaction_id || "",
        amount || 0,
        utr_number || "",
        bank_name || "",
        ifsc_code || "",
        account_number || "",
        account_holder_name || "",
        upi_id || "",
        approved_or_reject_date || null,
        status || "Pending",
        id,
      ],
    );

    const updatedTxn = result.rows[0];
    if (updatedTxn && status === "Approved") fireWebhook(pool, updatedTxn);
    res.json(updatedTxn);
  } catch (error) {
    if (handleKnownValidationError(res, error)) return; // e.g. duplicate UTR (409)
    console.log("Transaction update error:", error);
    res.status(500).json({ message: "Could not update transaction" });
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM transactions WHERE id=$1", [req.params.id]);
    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Could not delete transaction" });
  }
});

app.post("/api/payment-proof/verify", async (req, res) => {
  const client = await pool.connect();

  try {
    const { utr_number, amount, account_id } = req.body;

    if (!utr_number || !String(utr_number).trim()) {
      return res.status(400).json({ message: "UTR Number is required" });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const cleanUtr = String(utr_number).trim();
    const numericAmount = Number(amount);

    await client.query("BEGIN");

    // Account is OPTIONAL. Matching is purely by amount + UTR. If a valid account is
    // supplied we stamp its agent/bank onto the row; if it is missing or invalid it
    // never blocks the match or the auto-approve.
    let account = null;
    if (account_id) {
      const accountResult = await client.query(
        `SELECT
            oa.*,
            ag.created_by_admin_id AS agent_admin_id
         FROM agent_accounts oa
         LEFT JOIN agents ag ON ag.id = oa.agent_id
         WHERE oa.id = $1
         LIMIT 1`,
        [Number(account_id)],
      );
      if (accountResult.rows.length > 0) account = accountResult.rows[0];
    }

    const existingUtr = await client.query(
      `SELECT id, amount, status
       FROM transactions
       WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
       ORDER BY id ASC
       LIMIT 1`,
      [cleanUtr],
    );

    if (existingUtr.rows.length > 0) {
      const existing = existingUtr.rows[0];

      if (!amountsMatch(existing.amount, numericAmount)) {
        // UTR is globally unique in `transactions`, so we can't add a second row and we
        // must not overwrite the existing one. Don't block the agent — record what
        // they actually received in agent_received_proofs for admin reconciliation.
        if (!account) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message:
              "UTR already exists with a different amount. Select an account so we can record your received payment.",
            existing,
          });
        }
        const recorded = await client.query(
          `INSERT INTO agent_received_proofs (
             utr_number, amount, account_id, agent_id, created_by_admin_id,
             bank_name, ifsc_code, account_number, account_holder_name, upi_id,
             existing_transaction_id, existing_amount, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Agent Verified')
           RETURNING *`,
          [
            cleanUtr,
            numericAmount,
            account.id,
            account.agent_id || null,
            account.created_by_admin_id || account.agent_admin_id || null,
            account.bank_name || "",
            account.ifsc_code || "",
            account.account_number || "",
            account.account_holder_name || "",
            account.upi_id || "",
            existing.id,
            existing.amount,
          ],
        );
        await client.query("COMMIT");
        return res.json({
          message:
            "Recorded your received payment. The UTR already exists with a different amount, so it's saved for admin review (existing transaction left untouched).",
          created_new_transaction: false,
          recorded_for_review: true,
          received_proof: recorded.rows[0],
        });
      }

      // Approve the matched row. Stamp the account only if one was supplied;
      // otherwise keep the transaction's own bank/agent from when it was created.
      const updateExisting = account
        ? await client.query(
            `UPDATE transactions
             SET status = 'Approved',
                 approved_or_reject_date = CURRENT_TIMESTAMP,
                 account_id = $2,
                 agent_id = $3,
                 created_by_admin_id = COALESCE(created_by_admin_id, $4),
                 bank_name = $5,
                 ifsc_code = $6,
                 account_number = $7,
                 account_holder_name = $8,
                 upi_id = $9
             WHERE id = $1
             RETURNING *`,
            [
              existing.id,
              account.id,
              account.agent_id || null,
              account.created_by_admin_id || account.agent_admin_id || null,
              account.bank_name || "",
              account.ifsc_code || "",
              account.account_number || "",
              account.account_holder_name || "",
              account.upi_id || "",
            ],
          )
        : await client.query(
            `UPDATE transactions
             SET status = 'Approved', approved_or_reject_date = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [existing.id],
          );

      await client.query("COMMIT");

      for (const txn of updateExisting.rows) {
        fireWebhook(pool, txn);
      }

      return res.json({
        message: "Existing UTR found. Transaction approved successfully.",
        created_new_transaction: false,
        transaction: updateExisting.rows[0],
      });
    }

    const settlementDuplicate = await client.query(
      `SELECT id
       FROM settlement_transactions
       WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
       LIMIT 1`,
      [cleanUtr],
    );

    if (settlementDuplicate.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "UTR already exists in settlement transactions",
      });
    }

    // No transaction matched this amount + UTR. Without an account we have no agent
    // to attribute a new proof row to, so just report no match.
    if (!account) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        message: "No pending transaction found with this UTR and amount",
      });
    }

    // Agent's submission alone never auto-approves a merchant row that hasn't submitted UTR yet.
    // The earlier "existing UTR found" branch handles the case where the merchant already submitted
    // a matching UTR. Otherwise we save as Agent Verified (status name kept for backward-compatible
    // reporting) and wait for the merchant's submit-utr.

    const transactionId = crypto.randomBytes(12).toString("hex");

    const insertResult = await client.query(
      `INSERT INTO transactions (
        transaction_id,
        amount,
        utr_number,
        payment_proof,
        bank_name,
        ifsc_code,
        account_number,
        account_holder_name,
        upi_id,
        account_id,
        merchant_id,
        agent_id,
        created_by_admin_id,
        max_payment_limit,
        max_available_limit,
        min_transaction_amount,
        webhook_url,
        unique_id,
        approved_or_reject_date,
        status,
        client_id
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NULL,'Agent Verified',$19
      )
      RETURNING *`,
      [
        transactionId,
        numericAmount,
        cleanUtr,
        "",
        account.bank_name || "",
        account.ifsc_code || "",
        account.account_number || "",
        account.account_holder_name || "",
        account.upi_id || "",
        account.id,
        null,
        account.agent_id || null,
        account.created_by_admin_id || account.agent_admin_id || null,
        account.max_payment_limit || 0,
        account.max_available_limit || 0,
        account.min_transaction_amount || 0,
        "",
        `proof-${transactionId}`,
        account.client_id || null,
      ],
    );

    await client.query("COMMIT");

    return res.json({
      message:
        "No matching merchant transaction yet. Saved as Agent Verified proof, awaiting merchant submission.",
      created_new_transaction: true,
      transaction: insertResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("Payment proof verify error:", error);

    return res.status(500).json({
      message: error.message || "Could not verify payment proof",
    });
  } finally {
    client.release();
  }
});

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[₹INR\s]/gi, "")
    .trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

// Normalize a column header: lowercase, strip special chars, collapse whitespace
function normalizeHeader(key) {
  return String(key || "")
    .toLowerCase()
    .trim()
    .replace(/[_\-\.\/\\|#]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract a UTR/reference number from a raw cell value (handles embedded UTRs in narration text)
function extractUtrFromString(raw) {
  const val = normalizeText(raw);
  if (!val) return null;
  // Alphanumeric UTRs: IMPS, NEFT, RTGS, UPI refs (e.g. YESB0000123456789)
  const alphanum = val.match(/\b[A-Z]{2,}[A-Z0-9]{8,}\b/g) || [];
  // Pure numeric UTRs: 10-22 digits
  const numeric = val.match(/\b\d{10,22}\b/g) || [];
  const ignored = new Set([
    "BALANCE", "DEPOSIT", "WITHDRAWAL", "CREDIT", "DEBIT",
    "AMOUNT", "DATE", "ACCOUNT", "TRANSFER", "PAYMENT",
    "RECEIVED", "NARRATION", "DESCRIPTION", "REMARKS",
  ]);
  const valid = [...alphanum, ...numeric].filter(
    (m) => !ignored.has(m) && m.length >= 10
  );
  return valid[0] || null;
}

// Detect which header maps to UTR and which to Amount using keyword priority tiers.
// Returns { utrKey, amountKey } — either may be null if undetected.
function detectPaymentColumns(headers) {
  const norm = headers.map(normalizeHeader);

  // UTR matchers — ordered from most to least specific
  const utrMatchers = [
    (h) => h === "utr" || h === "rrn",
    (h) => /\butr\b/.test(h),
    (h) => /\brrn\b/.test(h),
    (h) => /\btrace\s*(no|number|id)?\b/.test(h),
    (h) => /\btransaction\s*(id|no|number|ref|reference)\b/.test(h),
    (h) => /\btxn\s*(id|no|number|ref|reference)\b/.test(h),
    (h) => /\b(payment|bank)\s*(id|ref|reference)\b/.test(h),
    (h) =>
      /\bref(erence)?\s*(no|number|id|#)?\b/.test(h) &&
      !h.includes("merchant") &&
      !h.includes("order"),
    (h) => /\bretrieval\b/.test(h),
    (h) => /\b(imps|neft|rtgs|upi)\s*(ref|id|no|number)?\b/.test(h),
    (h) => h.includes("reference") || h.includes("narration") || h.includes("remarks"),
  ];

  // Amount matchers — ordered from most to least specific
  const amountMatchers = [
    (h) => /\b(credit|deposit)\s*(amount|inr|cr)\b/.test(h),
    (h) =>
      h === "credit amount" || h === "deposit amount" || h === "received amount",
    (h) => /\b(received|receipt)\s*amount\b/.test(h),
    (h) => /\bpaid\s*(amount|in)\b/.test(h),
    (h) => /\b(transaction|payment|transfer|net|total)\s*amount\b/.test(h),
    (h) => h.includes("amount") && (h.includes("cr") || h.includes("credit")),
    (h) => h === "amount" || h === "value" || h === "inr",
    (h) =>
      h.includes("amount") &&
      !h.includes("min") &&
      !h.includes("max") &&
      !h.includes("limit"),
    (h) => h.includes("credit") && !h.includes("card"),
    (h) => h.includes("deposit"),
    (h) => h.includes("value") || (h.includes("inr") && !h.includes("utr")),
  ];

  const findCol = (matchers, excludeIdx = -1) => {
    for (const matcher of matchers) {
      for (let i = 0; i < norm.length; i++) {
        if (i === excludeIdx) continue;
        if (matcher(norm[i])) return { key: headers[i], idx: i };
      }
    }
    return null;
  };

  const utrResult = findCol(utrMatchers);
  const amountResult = findCol(amountMatchers, utrResult?.idx ?? -1);

  return {
    utrKey: utrResult?.key ?? null,
    amountKey: amountResult?.key ?? null,
  };
}

// Last-resort: infer UTR and Amount columns from the actual cell values in sample rows
function detectColumnsByData(headers, rows) {
  const sample = rows.slice(0, Math.min(10, rows.length));
  const utrScores = new Array(headers.length).fill(0);
  const amtScores = new Array(headers.length).fill(0);

  for (const row of sample) {
    for (let i = 0; i < headers.length; i++) {
      const val = String(row[headers[i]] || "").trim();
      if (!val) continue;
      // UTR-like: alphanumeric 10-22 chars, not a 10-digit phone number
      if (/^[A-Z0-9]{10,22}$/i.test(val) && !/^\d{10}$/.test(val))
        utrScores[i] += 2;
      if (/^\d{11,22}$/.test(val)) utrScores[i]++;
      // Amount-like: parseable number, positive, < 10M, not a very long integer
      const num = normalizeAmount(val);
      if (
        num !== null &&
        num > 0 &&
        num < 10000000 &&
        String(val).replace(/[,₹INR\s]/g, "").length <= 12
      )
        amtScores[i]++;
    }
  }

  let utrIdx = utrScores.indexOf(Math.max(...utrScores));
  if (utrScores[utrIdx] === 0) utrIdx = -1;

  const maskedAmt = amtScores.map((s, i) => (i === utrIdx ? -1 : s));
  let amtIdx = maskedAmt.indexOf(Math.max(...maskedAmt));
  if (amtIdx < 0 || amtScores[amtIdx] === 0) amtIdx = -1;

  return {
    utrKey: utrIdx >= 0 ? headers[utrIdx] : null,
    amountKey: amtIdx >= 0 ? headers[amtIdx] : null,
  };
}

app.post(
  "/api/payment-proof/bulk-upload",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "Excel file is required" });

      const { account } = req.body;
      if (!account)
        return res.status(400).json({ message: "Account is required" });

      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];

      // Read raw arrays so we can handle blank rows before the actual header row
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
      });

      if (!rawRows.length)
        return res.status(400).json({ message: "Excel file is empty" });

      // Find header row: prefer first row whose cells contain any known header keyword;
      // fall back to first row with 2+ non-empty cells.
      const knownHeaderWords = [
        "utr", "rrn", "txn", "transaction", "ref", "reference",
        "amount", "credit", "deposit", "debit", "narration", "date",
        "description", "balance", "received", "paid", "value", "trace",
        "bank", "remarks", "cheque", "chq", "imps", "neft", "rtgs", "upi",
      ];
      let headerRowIndex = 0;
      let foundByKeyword = false;
      for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
        const cells = rawRows[i].map((v) => String(v || "").toLowerCase().trim());
        const nonEmpty = cells.filter(Boolean);
        if (
          nonEmpty.length >= 2 &&
          nonEmpty.some((c) => knownHeaderWords.some((kw) => c.includes(kw)))
        ) {
          headerRowIndex = i;
          foundByKeyword = true;
          break;
        }
      }
      if (!foundByKeyword) {
        for (let i = 0; i < Math.min(rawRows.length, 30); i++) {
          if (rawRows[i].filter((v) => String(v || "").trim().length > 0).length >= 2) {
            headerRowIndex = i;
            break;
          }
        }
      }

      // Build headers array; give unnamed columns a placeholder so they can be scanned
      const rawHeaders = rawRows[headerRowIndex].map((h, i) =>
        h !== undefined && String(h).trim() !== ""
          ? String(h).trim()
          : `__col${i}`
      );

      // Build object rows; skip completely blank rows
      const rows = rawRows
        .slice(headerRowIndex + 1)
        .map((rawRow) => {
          const obj = {};
          rawHeaders.forEach((h, i) => {
            obj[h] = rawRow[i] !== undefined ? rawRow[i] : "";
          });
          return obj;
        })
        .filter((row) =>
          Object.values(row).some((v) => String(v || "").trim().length > 0)
        );

      if (!rows.length)
        return res.status(400).json({ message: "Excel file has no data rows" });

      // Detect UTR and Amount columns once for the whole file
      let columns = detectPaymentColumns(rawHeaders);

      // Fall back to data-driven detection for any column still unidentified
      if (!columns.utrKey || !columns.amountKey) {
        const dataColumns = detectColumnsByData(rawHeaders, rows);
        if (!columns.utrKey) columns.utrKey = dataColumns.utrKey;
        if (!columns.amountKey) columns.amountKey = dataColumns.amountKey;
      }

      let approved = 0,
        failed = 0,
        utrNotFound = 0;
      const results = [];

      for (const row of rows) {
        // ── Extract UTR ──────────────────────────────────────────────────────
        let utr = null;

        if (columns.utrKey) {
          utr = extractUtrFromString(row[columns.utrKey]);
        }
        // Fallback: scan every cell (handles UTR embedded in narration columns)
        if (!utr) {
          for (const key of rawHeaders) {
            const candidate = extractUtrFromString(row[key]);
            if (candidate) { utr = candidate; break; }
          }
        }

        if (!utr) {
          utrNotFound++;
          failed++;
          results.push({
            row,
            status: "Failed",
            reason: columns.utrKey
              ? `UTR not found in column "${columns.utrKey}" and no UTR pattern detected in any other cell`
              : "UTR column not detected — no header matched (utr/rrn/txn id/reference) and no UTR pattern found in row data",
          });
          continue;
        }

        // ── Extract Amount ───────────────────────────────────────────────────
        let amount = null;

        if (columns.amountKey) {
          const v = normalizeAmount(row[columns.amountKey]);
          if (v && v > 0) amount = v;
        }
        // Fallback: scan remaining cells for a plausible payment amount
        if (!amount) {
          for (const key of rawHeaders) {
            if (key === columns.utrKey) continue;
            const v = normalizeAmount(row[key]);
            if (v && v > 0 && v < 10000000) { amount = v; break; }
          }
        }

        if (!amount) {
          failed++;
          results.push({
            utr_number: utr,
            row,
            status: "Failed",
            reason: columns.amountKey
              ? `Amount missing or zero in column "${columns.amountKey}" and no numeric amount found in any other cell`
              : "Amount column not detected — no header matched (amount/credit/deposit/received) and no numeric amount found in row data",
          });
          continue;
        }

        const cleanUtr = String(utr).trim();
        const cleanAccount = String(account).trim();
        const numericAmount = Number(amount);

        const matchedExisting = await pool.query(
          `UPDATE transactions SET status = 'Approved', approved_or_reject_date = NOW()
         WHERE ABS(amount - $1) < 1 AND account_number = $2 AND (LOWER(TRIM(utr_number)) = LOWER(TRIM($3)) OR LOWER(TRIM(disputed_utr)) = LOWER(TRIM($3))) AND status IN ('Pending', 'UTR Submitted', 'Disputed')
         RETURNING *`,
          [numericAmount, cleanAccount, cleanUtr],
        );

        if (matchedExisting.rows.length > 0) {
          approved += matchedExisting.rows.length;
          for (const txn of matchedExisting.rows) fireWebhook(pool, txn);
          results.push({
            utr_number: utr,
            amount,
            account,
            status: "Approved",
            transaction_id: matchedExisting.rows[0].id,
          });
          continue;
        }

        // Agent's Excel row never auto-approves a merchant row that hasn't submitted UTR yet.
        // The earlier "match by exact UTR" branch already handles the case where the merchant
        // (or customer in checkout) submitted this same UTR first. Otherwise we save as Agent
        // Verified and wait for the merchant's submit-utr.

        const utrAlreadyUsed = await pool.query(
          `SELECT id, status FROM transactions WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1)) LIMIT 1`,
          [cleanUtr],
        );

        if (utrAlreadyUsed.rows.length > 0) {
          failed++;
          results.push({
            utr_number: utr,
            amount,
            account,
            status: "Failed",
            reason: `UTR already recorded on transaction #${utrAlreadyUsed.rows[0].id} (status: ${utrAlreadyUsed.rows[0].status})`,
          });
          continue;
        }

        const accountResult = await pool.query(
          `SELECT id, agent_id, client_id, created_by_admin_id, bank_name, ifsc_code, account_number, account_holder_name, upi_id, max_payment_limit, max_available_limit, min_transaction_amount
         FROM agent_accounts WHERE TRIM(account_number) = TRIM($1) AND is_active = true LIMIT 1`,
          [cleanAccount],
        );

        if (accountResult.rows.length === 0) {
          failed++;
          results.push({
            utr_number: utr,
            amount,
            account,
            status: "Failed",
            reason: "Agent account not found or inactive",
          });
          continue;
        }

        const oaccount = accountResult.rows[0];
        const transactionId = crypto.randomBytes(12).toString("hex");

        const proofInsert = await pool.query(
          `INSERT INTO transactions (
          transaction_id, amount, utr_number, payment_proof,
          bank_name, ifsc_code, account_number, account_holder_name, upi_id,
          account_id, agent_id, created_by_admin_id,
          max_payment_limit, max_available_limit, min_transaction_amount,
          webhook_url, unique_id, status, client_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'Agent Verified',$18)
        RETURNING *`,
          [
            transactionId,
            numericAmount,
            cleanUtr,
            "",
            oaccount.bank_name || "",
            oaccount.ifsc_code || "",
            oaccount.account_number || "",
            oaccount.account_holder_name || "",
            oaccount.upi_id || "",
            oaccount.id,
            oaccount.agent_id,
            oaccount.created_by_admin_id || null,
            oaccount.max_payment_limit || 0,
            oaccount.max_available_limit || 0,
            oaccount.min_transaction_amount || 0,
            "",
            `proof-${transactionId}`,
            oaccount.client_id || null,
          ],
        );

        results.push({
          utr_number: utr,
          amount,
          account,
          status: "Agent Verified",
          transaction_id: proofInsert.rows[0].id,
          note: "Saved as proof, awaiting merchant transaction",
        });
      }

      return res.json({
        message: "Excel processed successfully",
        approved,
        failed,
        utrNotFound,
        detectedColumns: {
          utr: columns.utrKey || "auto-scan",
          amount: columns.amountKey || "auto-scan",
        },
        results,
      });
    } catch (error) {
      console.error("Bulk upload error:", error.stack || error);
      return res.status(500).json({
        message: "Could not process Excel file",
        error: error.message,
        ...(process.env.NODE_ENV !== "production" && { detail: error.stack }),
      });
    }
  },
);

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────────
// Amounts: Approved only. Counts: all statuses via CASE WHEN.
app.get("/api/admin-dashboard", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const adminId = getAdminOwnerId(auth);
    const { startDate, endDate, viewAgentId, merchantId } = req.query;
    const selectedAgentId = viewAgentId ? Number(viewAgentId) : null;
    const selectedMerchantId = merchantId ? Number(merchantId) : null;

    const emptyStats = {
      adminCommission: 0,
      settlementRemaining: 0,
      settlementRemainingByAgent: 0,
      commissionByAgent: 0,
      commissionByMerchant: 0,
      totalAgentCommission: 0,
      totalMerchantCommission: 0,
      payinAmountByAgent: 0,
      payinAmountByMerchant: 0,
      payinAmountByAgent: 0,
      payinAmountByMerchant: 0,
      totalPayinAmount: 0,
      payinTransactionsByAgent: 0,
      payinTransactionsByMerchant: 0,
      payinTransactionsByAgent: 0,
      payinTransactionsByMerchant: 0,
      totalPayinTransactions: 0,
      settlementAmountByAgent: 0,
      settlementAmountByMerchant: 0,
      settlementAmountByAgent: 0,
      totalSettlementAmount: 0,
      settlementTransactionsByAgent: 0,
      settlementTransactionsByMerchant: 0,
      settlementTransactionsByAgent: 0,
      totalSettlementTransactions: 0,
      totalWithdrawal: 0,
      successRate: 0,
    };

    if (!adminId) return res.json(emptyStats);

    const addDateFilter = (alias, values) => {
      let sql = "";
      if (startDate && endDate) {
        values.push(startDate, endDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $${values.length - 1} AND $${values.length}`;
      } else if (startDate) {
        values.push(startDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${values.length}`;
      } else if (endDate) {
        values.push(endDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${values.length}`;
      }
      return sql;
    };

    const addAgentFilter = (alias, values) => {
      if (!selectedAgentId) return "";
      values.push(selectedAgentId);
      return ` AND ${alias}.agent_id = $${values.length}`;
    };

    // Optional single-merchant filter for the headline KPIs (transactions /
    // settlements / withdrawals all carry merchant_id).
    const addMerchantFilter = (alias, values) => {
      if (!selectedMerchantId) return "";
      values.push(selectedMerchantId);
      return ` AND ${alias}.merchant_id = $${values.length}`;
    };

    // ── PayIn summary (Approved only for amounts) ──
    const payinValues = [adminId];
    const payinAgentFilter = addAgentFilter("t", payinValues);
    const payinMerchantFilter = addMerchantFilter("t", payinValues);
    const payinDate = addDateFilter("t", payinValues);

    const payinSummary = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.status = 'Approved' THEN t.amount ELSE 0 END), 0) AS total_payin_amount,
         COUNT(CASE WHEN t.status = 'Approved' THEN 1 END) AS total_payin_transactions,
         COUNT(CASE WHEN t.status IN ('Approved','Success') THEN 1 END) AS approved_count,
         COUNT(CASE WHEN t.status IN ('Approved','Success','Failed','Rejected','Expired') THEN 1 END) AS finalized_count
       FROM transactions t
       WHERE t.created_by_admin_id = $1 ${payinAgentFilter} ${payinMerchantFilter} ${payinDate}`,
      payinValues,
    );

    // ── Settlement summary (Approved only) ──
    const settlementValues = [adminId];
    const settlementAgentFilter = addAgentFilter("st", settlementValues);
    const settlementMerchantFilter = addMerchantFilter("st", settlementValues);
    const settlementDate = addDateFilter("st", settlementValues);

    const settlementSummary = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN st.transaction_status = 'Approved' THEN st.amount ELSE 0 END), 0) AS total_settlement_amount,
         COUNT(CASE WHEN st.transaction_status = 'Approved' THEN 1 END) AS total_settlement_transactions
       FROM settlement_transactions st
       WHERE st.created_by_admin_id = $1 ${settlementAgentFilter} ${settlementMerchantFilter} ${settlementDate}`,
      settlementValues,
    );

    const withdrawalValues = [adminId];
    const withdrawalAgentFilter = addAgentFilter("wt", withdrawalValues);
    const withdrawalMerchantFilter = addMerchantFilter("wt", withdrawalValues);
    const withdrawalDate = addDateFilter("wt", withdrawalValues);

    const withdrawalSummary = await pool.query(
      `SELECT COALESCE(SUM(wt.amount), 0) AS total_withdrawal
       FROM withdrawal_transactions wt
       JOIN merchants m ON m.id = wt.merchant_id
       WHERE wt.status = 'cleared' AND m.created_by_admin_id = $1 ${withdrawalAgentFilter} ${withdrawalMerchantFilter} ${withdrawalDate}`,
      withdrawalValues,
    );

    // ── Payout commission (on cleared/successful payouts only) ──
    // Each merchant's withdrawal config carries a commission_percent; commission is
    // earned on payouts that actually completed (status = 'cleared').
    const payoutCommValues = [adminId];
    const payoutCommAgentFilter = addAgentFilter("wt", payoutCommValues);
    const payoutCommMerchantFilter = addMerchantFilter("wt", payoutCommValues);
    const payoutCommDate = addDateFilter("wt", payoutCommValues);

    const payoutCommissionResult = await pool.query(
      `SELECT COALESCE(SUM(wt.amount * (COALESCE(wmc.commission_percent, 0) / 100.0)), 0) AS payout_commission
       FROM withdrawal_transactions wt
       JOIN merchants m ON m.id = wt.merchant_id
       LEFT JOIN withdrawal_merchant_configs wmc ON wmc.merchant_id = wt.merchant_id
       WHERE wt.status = 'cleared' AND m.created_by_admin_id = $1 ${payoutCommAgentFilter} ${payoutCommMerchantFilter} ${payoutCommDate}`,
      payoutCommValues,
    );

    // ── Commission by agent ──
    // Date filter lives in the JOIN (not WHERE) so agents with no transactions in
    // the range still appear with 0, and so commission matches the Total Payin period
    // (overall when no dates are selected).
    const agentValues = [adminId];
    let agentFilter = "";
    if (selectedAgentId) {
      agentValues.push(selectedAgentId);
      agentFilter = ` AND a.id = $${agentValues.length}`;
    }
    // When a single merchant is selected, count only that merchant's payins toward
    // the agent's commission (filter sits in the JOIN, like the date filter).
    let agentMerchantJoin = "";
    if (selectedMerchantId) {
      agentValues.push(selectedMerchantId);
      agentMerchantJoin = ` AND t.merchant_id = $${agentValues.length}`;
    }
    const agentCommDate = addDateFilter("t", agentValues);

    const agentCommission = await pool.query(
      `SELECT a.id, a.name, COALESCE(SUM(t.amount * (a.commission_percent / 100.0)), 0) AS amount
       FROM agents a
       LEFT JOIN transactions t ON t.agent_id = a.id AND t.status = 'Approved' ${agentMerchantJoin} ${agentCommDate}
       WHERE a.created_by_admin_id = $1 ${agentFilter}
       GROUP BY a.id, a.name ORDER BY amount DESC`,
      agentValues,
    );

    // ── Commission by merchant ──
    const merchantValues = [adminId];
    let merchantFilter = "";
    if (selectedAgentId) {
      merchantValues.push(selectedAgentId);
      merchantFilter += ` AND m.agent_id = $${merchantValues.length}`;
    }
    if (selectedMerchantId) {
      merchantValues.push(selectedMerchantId);
      merchantFilter += ` AND m.id = $${merchantValues.length}`;
    }
    const merchantCommDate = addDateFilter("t", merchantValues);

    const merchantCommission = await pool.query(
      `SELECT m.id, m.name, COALESCE(SUM(t.amount * (m.commission_percent / 100.0)), 0) AS amount
       FROM merchants m
       LEFT JOIN transactions t ON t.merchant_id = m.id AND t.status = 'Approved' ${merchantCommDate}
       WHERE m.created_by_admin_id = $1 ${merchantFilter}
       GROUP BY m.id, m.name ORDER BY amount DESC`,
      merchantValues,
    );

    // ── Settlement remaining ──
    const settlementRemainingValues = [adminId];
    let settlementRemainingAgentFilter = "";
    if (selectedAgentId) {
      settlementRemainingValues.push(selectedAgentId);
      settlementRemainingAgentFilter = ` AND a.id = $2`;
    }

    const settlementRemainingPayinDate = addDateFilter("transactions", settlementRemainingValues);
    const settlementRemainingSettleDate = addDateFilter("settlement_transactions", settlementRemainingValues);

    const settlementRemainingByAgent = await pool.query(
      `SELECT COALESCE(t.total_payin, 0) - COALESCE(st.total_settlement, 0) AS amount
       FROM agents a
       LEFT JOIN (SELECT agent_id, SUM(amount) AS total_payin FROM transactions WHERE created_by_admin_id = $1 AND status = 'Approved' ${settlementRemainingPayinDate} GROUP BY agent_id) t ON t.agent_id = a.id
       LEFT JOIN (SELECT agent_id, SUM(amount) AS total_settlement FROM settlement_transactions WHERE created_by_admin_id = $1 AND transaction_status = 'Approved' ${settlementRemainingSettleDate} GROUP BY agent_id) st ON st.agent_id = a.id
       WHERE a.created_by_admin_id = $1 ${settlementRemainingAgentFilter}
       ORDER BY amount DESC LIMIT 1`,
      settlementRemainingValues,
    );

    const totalPayinAmount = Number(
      payinSummary.rows[0]?.total_payin_amount || 0,
    );
    const totalSettlementAmount = Number(
      settlementSummary.rows[0]?.total_settlement_amount || 0,
    );
    const totalWithdrawal = Number(
      withdrawalSummary.rows[0]?.total_withdrawal || 0,
    );
    const grossSettlementRemaining = totalPayinAmount - totalSettlementAmount;

    const totalAgentCommission = agentCommission.rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const totalMerchantCommission = merchantCommission.rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    // Admin keeps the merchant commission minus the agents' share. This is the
    // platform's margin and must NOT depend on how much has been settled.
    const adminCommission = totalMerchantCommission - totalAgentCommission;
    const payoutCommission = Number(
      payoutCommissionResult.rows[0]?.payout_commission || 0,
    );
    // Settlement Remaining = (payin - settled) - payin commission - payout commission
    // - cleared payouts. This is what is still owed to merchants, net of both fees.
    const settlementRemaining =
      grossSettlementRemaining - adminCommission - payoutCommission - totalWithdrawal;

    const approvedCount = Number(payinSummary.rows[0]?.approved_count || 0);
    const finalizedCount = Number(payinSummary.rows[0]?.finalized_count || 0);

    res.json({
      adminCommission,
      // Admin's margin on payins == payin commission (alias for the dashboard KPI).
      payinCommission: adminCommission,
      payoutCommission,
      settlementRemaining,
      settlementRemainingByAgent: Number(
        settlementRemainingByAgent.rows[0]?.amount || 0,
      ),
      commissionByAgent: Number(agentCommission.rows[0]?.amount || 0),
      commissionByMerchant: Number(merchantCommission.rows[0]?.amount || 0),
      totalAgentCommission,
      totalMerchantCommission,
      payinAmountByAgent: totalPayinAmount,
      payinAmountByMerchant: totalPayinAmount,
      totalPayinAmount,
      totalWithdrawal,
      payinTransactionsByAgent: Number(
        payinSummary.rows[0]?.total_payin_transactions || 0,
      ),
      payinTransactionsByMerchant: Number(
        payinSummary.rows[0]?.total_payin_transactions || 0,
      ),
      totalPayinTransactions: Number(
        payinSummary.rows[0]?.total_payin_transactions || 0,
      ),
      settlementAmountByMerchant: totalSettlementAmount,
      settlementAmountByAgent: totalSettlementAmount,
      totalSettlementAmount,
      settlementTransactionsByMerchant: Number(
        settlementSummary.rows[0]?.total_settlement_transactions || 0,
      ),
      settlementTransactionsByAgent: Number(
        settlementSummary.rows[0]?.total_settlement_transactions || 0,
      ),
      totalSettlementTransactions: Number(
        settlementSummary.rows[0]?.total_settlement_transactions || 0,
      ),
      // Payin success rate reflects successful payins only — 100% when there are any
      // approved/successful payins, otherwise 0.
      successRate: approvedCount > 0 ? 100 : 0,
    });
  } catch (error) {
    console.log("Admin dashboard error:", error);
    res.status(500).json({ message: "Dashboard Error", error: error.message });
  }
});

// ─── ADMIN DASHBOARD DETAILS ──────────────────────────────────────────────────
// KEY FIX: All payinTransactionsByX cases LEFT JOIN all transactions (no status filter
// in JOIN), then COUNT(CASE WHEN status = 'X') to get correct pending/rejected counts.
// Amount cases still filter Approved only via SUM(CASE WHEN ... THEN amount ELSE 0 END).
app.get("/api/admin-dashboard/details", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const adminId = getAdminOwnerId(auth);
    const { type, viewAgentId, startDate, endDate } = req.query;
    const selectedAgentId = viewAgentId ? Number(viewAgentId) : null;

    if (!adminId) return res.json([]);

    const values = [adminId];
    let agentFilter = `a.created_by_admin_id = $1`;
    let merchantFilter = `m.created_by_admin_id = $1`;

    if (selectedAgentId) {
      values.push(selectedAgentId);
      agentFilter += ` AND a.id = $${values.length}`;
      merchantFilter += ` AND m.agent_id = $${values.length}`;
    }

    // Same IST-day date-filter pattern as /api/admin-dashboard's addDateFilter.
    // Each case clones `values` before appending its own date params, since
    // different cases join on different aliases (or none at all).
    const addDateFilter = (alias, arr) => {
      let sql = "";
      if (startDate && endDate) {
        arr.push(startDate, endDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $${arr.length - 1} AND $${arr.length}`;
      } else if (startDate) {
        arr.push(startDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${arr.length}`;
      } else if (endDate) {
        arr.push(endDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${arr.length}`;
      }
      return sql;
    };

    let result;

    switch (type) {
      // ── Commission ──────────────────────────────────────────────────────────
      case "commissionByAgent": {
        const vals = [...values];
        const dateFilter = addDateFilter("t", vals);
        result = await pool.query(
          `SELECT a.id, a.name,
             COALESCE(SUM(t.amount * (a.commission_percent / 100.0)), 0) AS amount
           FROM agents a
           LEFT JOIN transactions t ON t.agent_id = a.id AND t.status = 'Approved' ${dateFilter}
           WHERE ${agentFilter} GROUP BY a.id, a.name ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      case "commissionByMerchant": {
        const vals = [...values];
        const dateFilter = addDateFilter("t", vals);
        result = await pool.query(
          `SELECT m.id, m.name,
             COALESCE(SUM(t.amount * (m.commission_percent / 100.0)), 0) AS amount
           FROM merchants m
           LEFT JOIN transactions t ON t.merchant_id = m.id AND t.status = 'Approved' ${dateFilter}
           WHERE ${merchantFilter} GROUP BY m.id, m.name ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      // ── PayIn Amount (Approved only) ─────────────────────────────────────
      case "payinAmountByAgent": {
        const vals = [...values];
        const dateFilter = addDateFilter("t", vals);
        result = await pool.query(
          `SELECT a.id, a.name,
             COALESCE(SUM(CASE WHEN t.status = 'Approved' THEN t.amount ELSE 0 END), 0) AS amount
           FROM agents a
           LEFT JOIN transactions t ON t.agent_id = a.id ${dateFilter}
           WHERE ${agentFilter} GROUP BY a.id, a.name ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      case "payinAmountByMerchant": {
        const vals = [...values];
        const dateFilter = addDateFilter("t", vals);
        result = await pool.query(
          `SELECT m.id, m.name,
             COALESCE(SUM(CASE WHEN t.status = 'Approved' THEN t.amount ELSE 0 END), 0) AS amount
           FROM merchants m
           LEFT JOIN transactions t ON t.merchant_id = m.id ${dateFilter}
           WHERE ${merchantFilter} GROUP BY m.id, m.name ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      // ── PayIn Transactions (all statuses counted correctly) ───────────────
      case "payinTransactionsByAgent": {
        const vals = [...values];
        const dateFilter = addDateFilter("t", vals);
        result = await pool.query(
          `SELECT a.id, a.name,
             COUNT(CASE WHEN t.status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN t.status IN ('Pending','UTR Submitted') THEN 1 END) AS pending,
             COUNT(CASE WHEN t.status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(t.id) AS totaltransactions
           FROM agents a
           LEFT JOIN transactions t ON t.agent_id = a.id ${dateFilter}
           WHERE ${agentFilter} GROUP BY a.id, a.name ORDER BY totaltransactions DESC`,
          vals,
        );
        break;
      }

      case "payinTransactionsByMerchant": {
        const vals = [...values];
        const dateFilter = addDateFilter("t", vals);
        result = await pool.query(
          `SELECT m.id, m.name,
             COUNT(CASE WHEN t.status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN t.status IN ('Pending','UTR Submitted') THEN 1 END) AS pending,
             COUNT(CASE WHEN t.status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(t.id) AS totaltransactions
           FROM merchants m
           LEFT JOIN transactions t ON t.merchant_id = m.id ${dateFilter}
           WHERE ${merchantFilter} GROUP BY m.id, m.name ORDER BY totaltransactions DESC`,
          vals,
        );
        break;
      }

      case "totalPayinTransactions": {
        const vals = [...values];
        const dateFilter = addDateFilter("transactions", vals);
        result = await pool.query(
          `SELECT 'Details' AS name,
             COUNT(CASE WHEN status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN status IN ('Pending','UTR Submitted') THEN 1 END) AS pending,
             COUNT(CASE WHEN status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(*) AS totaltransactions
           FROM transactions
           WHERE created_by_admin_id = $1 ${selectedAgentId ? "AND agent_id = $2" : ""} ${dateFilter}`,
          vals,
        );
        break;
      }

      // ── Settlement Amount (Approved only) ─────────────────────────────────
      case "settlementAmountByAgent": {
        const vals = [...values];
        const dateFilter = addDateFilter("st", vals);
        result = await pool.query(
          `SELECT a.id, a.name,
             COALESCE(SUM(CASE WHEN st.transaction_status = 'Approved' THEN st.amount ELSE 0 END), 0) AS amount
           FROM agents a
           LEFT JOIN settlement_transactions st ON st.agent_id = a.id ${dateFilter}
           WHERE ${agentFilter} GROUP BY a.id, a.name ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      case "settlementAmountByMerchant": {
        const vals = [...values];
        const dateFilter = addDateFilter("st", vals);
        result = await pool.query(
          `SELECT m.id, m.name,
             COALESCE(SUM(CASE WHEN st.transaction_status = 'Approved' THEN st.amount ELSE 0 END), 0) AS amount
           FROM merchants m
           LEFT JOIN settlement_transactions st ON st.merchant_id = m.id ${dateFilter}
           WHERE ${merchantFilter} GROUP BY m.id, m.name ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      // ── Settlement Transactions (all statuses counted correctly) ──────────
      case "settlementTransactionsByAgent": {
        const vals = [...values];
        const dateFilter = addDateFilter("st", vals);
        result = await pool.query(
          `SELECT a.id, a.name,
             COUNT(CASE WHEN st.transaction_status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN st.transaction_status = 'Pending' THEN 1 END) AS pending,
             COUNT(CASE WHEN st.transaction_status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(st.id) AS totaltransactions
           FROM agents a
           LEFT JOIN settlement_transactions st ON st.agent_id = a.id ${dateFilter}
           WHERE ${agentFilter} GROUP BY a.id, a.name ORDER BY totaltransactions DESC`,
          vals,
        );
        break;
      }

      case "settlementTransactionsByMerchant": {
        const vals = [...values];
        const dateFilter = addDateFilter("st", vals);
        result = await pool.query(
          `SELECT m.id, m.name,
             COUNT(CASE WHEN st.transaction_status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN st.transaction_status = 'Pending' THEN 1 END) AS pending,
             COUNT(CASE WHEN st.transaction_status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(st.id) AS totaltransactions
           FROM merchants m
           LEFT JOIN settlement_transactions st ON st.merchant_id = m.id ${dateFilter}
           WHERE ${merchantFilter} GROUP BY m.id, m.name ORDER BY totaltransactions DESC`,
          vals,
        );
        break;
      }

      case "totalSettlementTransactions": {
        const vals = [...values];
        const dateFilter = addDateFilter("settlement_transactions", vals);
        result = await pool.query(
          `SELECT 'Details' AS name,
             COUNT(CASE WHEN transaction_status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN transaction_status = 'Pending' THEN 1 END) AS pending,
             COUNT(CASE WHEN transaction_status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(*) AS totaltransactions
           FROM settlement_transactions
           WHERE created_by_admin_id = $1 ${selectedAgentId ? "AND agent_id = $2" : ""} ${dateFilter}`,
          vals,
        );
        break;
      }

      case "settlementRemainingByAgent": {
        const vals = [...values];
        const payinDateFilter = addDateFilter("transactions", vals);
        const settleDateFilter = addDateFilter("settlement_transactions", vals);
        result = await pool.query(
          `SELECT a.id, a.name,
             COALESCE(t.total_payin, 0) - COALESCE(st.total_settlement, 0) AS amount
           FROM agents a
           LEFT JOIN (
             SELECT agent_id, SUM(amount) AS total_payin
             FROM transactions WHERE created_by_admin_id = $1 AND status = 'Approved' ${payinDateFilter}
             GROUP BY agent_id
           ) t ON t.agent_id = a.id
           LEFT JOIN (
             SELECT agent_id, SUM(amount) AS total_settlement
             FROM settlement_transactions WHERE created_by_admin_id = $1 AND transaction_status = 'Approved' ${settleDateFilter}
             GROUP BY agent_id
           ) st ON st.agent_id = a.id
           WHERE ${agentFilter} ORDER BY amount DESC`,
          vals,
        );
        break;
      }

      default:
        return res.json([]);
    }

    res.json(result.rows);
  } catch (error) {
    console.log("Dashboard details error:", error);
    res.status(500).json({ message: "Details fetch error" });
  }
});

// ─── MERCHANT DASHBOARD ───────────────────────────────────────────────────────
app.get("/api/merchant-dashboard", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const merchantId = Number(auth.merchantId || auth.userId);
    const { startDate, endDate } = req.query;

    if (!merchantId)
      return res.status(401).json({ message: "Merchant not found" });

    const values = [merchantId];
    let transactionDateFilter = "";
    let settlementDateFilter = "";
    let withdrawalDateFilter = "";

    if (startDate && endDate) {
      values.push(startDate, endDate);
      transactionDateFilter = ` AND DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $2 AND $3`;
      settlementDateFilter = ` AND DATE(st.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $2 AND $3`;
      withdrawalDateFilter = ` AND DATE(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $2 AND $3`;
    } else if (startDate) {
      values.push(startDate);
      transactionDateFilter = ` AND DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $2`;
      settlementDateFilter = ` AND DATE(st.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $2`;
      withdrawalDateFilter = ` AND DATE(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $2`;
    } else if (endDate) {
      values.push(endDate);
      transactionDateFilter = ` AND DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $2`;
      settlementDateFilter = ` AND DATE(st.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $2`;
      withdrawalDateFilter = ` AND DATE(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $2`;
    }

    const merchantResult = await pool.query(
      `SELECT * FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const merchant = merchantResult.rows[0];

    // Approved amounts only
    const payinSummary = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.status = 'Approved' THEN t.amount ELSE 0 END), 0) AS total_payin_amount,
         COUNT(t.id) AS total_payin_transactions,
         COUNT(CASE WHEN t.status = 'Approved' THEN 1 END) AS approved,
         COUNT(CASE WHEN t.status IN ('Pending','UTR Submitted') THEN 1 END) AS pending,
         COUNT(CASE WHEN t.status = 'Rejected' THEN 1 END) AS rejected
       FROM transactions t
       WHERE t.merchant_id = $1 ${transactionDateFilter}`,
      values,
    );

    const settlementSummary = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN st.transaction_status = 'Approved' THEN st.amount ELSE 0 END), 0) AS total_settlement_amount
       FROM settlement_transactions st WHERE st.merchant_id = $1 ${settlementDateFilter}`,
      values,
    );

    const withdrawalSummary = await pool.query(
      `SELECT COALESCE(SUM(wt.amount), 0) AS total_withdrawal_amount
   FROM withdrawal_transactions wt
   WHERE wt.merchant_id = $1
     AND LOWER(wt.status) IN ('approved', 'cleared')
     ${withdrawalDateFilter}`,
      values,
    );

    // Agent commission on this merchant's approved payins — mirrors admin dashboard's
    // agentCommission query scoped to a single merchant.
    const agentCommissionResult = await pool.query(
      `SELECT COALESCE(SUM(t.amount * (COALESCE(a.commission_percent, 0) / 100.0)), 0) AS agent_commission
       FROM transactions t
       JOIN agents a ON a.id = t.agent_id
       WHERE t.merchant_id = $1 AND t.status = 'Approved' ${transactionDateFilter}`,
      values,
    );

    // Payout commission on cleared withdrawals — mirrors admin dashboard's
    // payoutCommissionResult query scoped to a single merchant.
    const payoutCommissionResult = await pool.query(
      `SELECT COALESCE(SUM(wt.amount * (COALESCE(wmc.commission_percent, 0) / 100.0)), 0) AS payout_commission
       FROM withdrawal_transactions wt
       LEFT JOIN withdrawal_merchant_configs wmc ON wmc.merchant_id = wt.merchant_id
       WHERE wt.merchant_id = $1 AND wt.status = 'cleared' ${withdrawalDateFilter}`,
      values,
    );

    // Cleared-only withdrawals for the outstanding formula (admin uses 'cleared' only).
    const clearedWithdrawalResult = await pool.query(
      `SELECT COALESCE(SUM(wt.amount), 0) AS cleared_withdrawal
       FROM withdrawal_transactions wt
       WHERE wt.merchant_id = $1 AND wt.status = 'cleared' ${withdrawalDateFilter}`,
      values,
    );

    const totalPayinAmount = Number(
      payinSummary.rows[0]?.total_payin_amount || 0,
    );
    const totalSettlementAmount = Number(
      settlementSummary.rows[0]?.total_settlement_amount || 0,
    );
    const totalWithdrawalAmount = Number(
      withdrawalSummary.rows[0]?.total_withdrawal_amount || 0,
    );
    const totalPayinTransactions = Number(
      payinSummary.rows[0]?.total_payin_transactions || 0,
    );
    const approvedTransactions = Number(payinSummary.rows[0]?.approved || 0);
    const totalCommissionAmount =
      totalPayinAmount * (Number(merchant?.commission_percent || 0) / 100);

    const agentCommissionAmount = Number(
      agentCommissionResult.rows[0]?.agent_commission || 0,
    );
    const payoutCommissionAmount = Number(
      payoutCommissionResult.rows[0]?.payout_commission || 0,
    );
    const clearedWithdrawalAmount = Number(
      clearedWithdrawalResult.rows[0]?.cleared_withdrawal || 0,
    );

    // Net platform commission = merchant commission minus agent's share.
    // This mirrors admin dashboard: adminCommission = totalMerchantCommission - totalAgentCommission.
    const netCommission = totalCommissionAmount - agentCommissionAmount;

    // Outstanding = (payin - settled) - netCommission - payoutCommission - clearedWithdrawals.
    // Identical formula to admin's settlementRemaining, scoped to this merchant.
    const totalOutstandingAmount =
      (totalPayinAmount - totalSettlementAmount) - netCommission - payoutCommissionAmount - clearedWithdrawalAmount;

    res.json({
      totalOutstandingAmount,
      totalCommissionAmount,
      totalPayinAmount,
      totalSettlementAmount,
      totalPayinTransactions,
      totalWithdrawalAmount,
      approved: approvedTransactions,
      pending: Number(payinSummary.rows[0]?.pending || 0),
      rejected: Number(payinSummary.rows[0]?.rejected || 0),
      successRate: approvedTransactions > 0 ? 100 : 0,
    });
  } catch (error) {
    console.log("Merchant dashboard error:", error);
    res.status(500).json({ message: "Merchant dashboard error" });
  }
});

app.get("/api/merchant-dashboard/details", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const merchantId = Number(auth.merchantId || auth.userId);
    const { type, startDate, endDate } = req.query;

    if (!merchantId)
      return res.status(401).json({ message: "Merchant not found" });

    // Same IST-day date-filter pattern used by /api/merchant-dashboard's own
    // inline date-filter blocks.
    const addDateFilter = (alias, arr) => {
      let sql = "";
      if (startDate && endDate) {
        arr.push(startDate, endDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $${arr.length - 1} AND $${arr.length}`;
      } else if (startDate) {
        arr.push(startDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $${arr.length}`;
      } else if (endDate) {
        arr.push(endDate);
        sql += ` AND DATE(${alias}.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $${arr.length}`;
      }
      return sql;
    };

    let result;

    switch (type) {
      case "totalPayinTransactions": {
        const vals = [merchantId];
        const dateFilter = addDateFilter("transactions", vals);
        result = await pool.query(
          `SELECT 'Record 1' AS name,
             COUNT(CASE WHEN status = 'Approved' THEN 1 END) AS approved,
             COUNT(CASE WHEN status IN ('Pending','UTR Submitted') THEN 1 END) AS pending,
             COUNT(CASE WHEN status = 'Rejected' THEN 1 END) AS rejected,
             COUNT(*) AS totaltransactions
           FROM transactions WHERE merchant_id = $1 ${dateFilter}`,
          vals,
        );
        break;
      }

      default:
        return res.json([]);
    }

    res.json(result.rows);
  } catch (error) {
    console.log("Merchant dashboard details error:", error);
    res.status(500).json({ message: "Merchant dashboard details error" });
  }
});

// ─── AGENT DASHBOARD ───────────────────────────────────────────────────────
// ─── AGENT DASHBOARD ──────────────────────────────────────────────────────────
app.get("/api/agent-dashboard", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const agentId = Number(
      auth.agentId ||
        auth.agent_id ||
        auth.userId ||
        req.headers.agentid ||
        req.headers.agent_id,
    );
    const { startDate, endDate } = req.query;

    if (!agentId) return res.status(401).json({ message: "Agent not found" });

    const values = [agentId];
    let dateFilter = "";
    let withdrawalDateFilter = "";
    let settlementDateFilter = "";

    if (startDate && endDate) {
      values.push(startDate, endDate);
      dateFilter = ` AND DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $2 AND $3`;
      withdrawalDateFilter = ` AND DATE(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $2 AND $3`;
      settlementDateFilter = ` AND DATE(st.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') BETWEEN $2 AND $3`;
    } else if (startDate) {
      values.push(startDate);
      dateFilter = ` AND DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $2`;
      withdrawalDateFilter = ` AND DATE(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $2`;
      settlementDateFilter = ` AND DATE(st.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= $2`;
    } else if (endDate) {
      values.push(endDate);
      dateFilter = ` AND DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $2`;
      withdrawalDateFilter = ` AND DATE(wt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $2`;
      settlementDateFilter = ` AND DATE(st.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= $2`;
    }

    const agent = (
      await pool.query(`SELECT * FROM agents WHERE id = $1`, [agentId])
    ).rows[0];
    if (!agent)
      return res.status(404).json({ message: "Agent not found in database" });

    const summaryResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.status = 'Approved' THEN t.amount ELSE 0 END), 0) AS total_payin_amount,
         COUNT(CASE WHEN t.status = 'Approved' THEN 1 END) AS total_payin_transactions,
         COUNT(t.id) AS total_transactions,
         COUNT(CASE WHEN t.status = 'UTR Submitted' THEN 1 END) AS pending_verifications
       FROM transactions t
       WHERE t.agent_id = $1 ${dateFilter}`,
      values,
    );

    const withdrawalSummaryResult = await pool.query(
      `SELECT COALESCE(SUM(wt.amount), 0) AS total_withdrawal_amount
       FROM withdrawal_transactions wt
       WHERE wt.agent_id = $1
         AND LOWER(wt.status) IN ('cleared', 'approved')
         ${withdrawalDateFilter}`,
      values,
    );

    const settlementSummaryResult = await pool.query(
      `SELECT COALESCE(SUM(st.amount), 0) AS total_settlement_amount
       FROM settlement_transactions st
       WHERE st.agent_id = $1
         AND st.transaction_status = 'Approved'
         ${settlementDateFilter}`,
      values,
    );

    // Wallet balance — folded in from the old Agent dashboard (Agent's
    // wallet/top-up system is now the Agent's own, see agent_wallets).
    const walletResult = await pool.query(
      `SELECT available_balance FROM agent_wallets WHERE agent_id = $1`,
      [agentId],
    );
    const ledgerSumResult = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS settlement_amount FROM agent_wallet_ledger WHERE agent_id = $1 AND entry_type = 'TOPUP_CREDIT'`,
      [agentId],
    );

    const row = summaryResult.rows[0];
    const totalPayinAmount = Number(row.total_payin_amount || 0);
    const totalPayinTransactions = Number(row.total_payin_transactions || 0);
    const totalTransactions = Number(row.total_transactions || 0);
    const totalCommissionAmount =
      totalPayinAmount * (Number(agent.commission_percent || 0) / 100);
    const totalWithdrawalAmount = Number(
      withdrawalSummaryResult.rows[0]?.total_withdrawal_amount || 0,
    );
    const totalSettlementAmount = Number(
      settlementSummaryResult.rows[0]?.total_settlement_amount || 0,
    );
    const walletBalance = Number(walletResult.rows[0]?.available_balance || 0);

    res.json({
      totalPayinAmount,
      totalPayinTransactions,
      totalTransactions,
      totalCommissionAmount,
      totalOutstandingAmount: totalCommissionAmount,
      successRate: totalPayinTransactions > 0 ? 100 : 0,
      pendingVerifications: Number(row.pending_verifications || 0),
      totalWithdrawalAmount,
      totalSettlementAmount,
      // Wallet fields (folded in from the old Agent dashboard):
      walletBalance,
      settlementRemaining: walletBalance,
      settlementAmount: Number(ledgerSumResult.rows[0]?.settlement_amount || 0),
    });
  } catch (error) {
    console.log("Agent dashboard error:", error);
    res.status(500).json({ message: "Agent dashboard error" });
  }
});

// ─── EXTERNAL PAYIN API ───────────────────────────────────────────────────────
// Rebuilt to match POST /api/payins and POST /api/payin/checkout/create
// exactly (shared account-selection helper, maintenance check, atomic wallet
// debit) — this route previously had its own independent, unlocked copy of
// the account-selection query with no wallet-gate check at all, a full
// bypass of the maintenance-mode and wallet-balance safety mechanisms.
app.post(
  "/api/payin/create",
  authenticateMerchantApiKey,
  async (req, res) => {
    try {
      const maintenanceCheck = await checkMaintenanceBlocksPayins();
      if (maintenanceCheck.blocked)
        return res.status(503).json({ success: false, message: maintenanceCheck.message, maintenance: true });

      const merchant = req.merchantApiUser;
      const {
        merchant_order_id,
        amount,
        customer_name,
        customer_mobile,
        webhook_url,
      } = req.body;
      const numericAmount = Number(amount);

      if (!merchant_order_id) {
        return res.status(400).json({
          success: false,
          message: "merchant_order_id is required",
        });
      }

      if (!numericAmount || numericAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Valid amount is required",
        });
      }

      if (!merchant.agent_id) {
        return res.status(400).json({
          success: false,
          message: "Merchant is not linked to an agent",
        });
      }

      const account = await findCandidateAgentAccount(pool, {
        amount: numericAmount,
        merchantId: Number(merchant.merchant_id),
        requireAgentRestriction: true,
      });

      if (!account) {
        return res.status(400).json({
          success: false,
          message: "No active agent bank account available for this amount",
        });
      }

      const transactionId = crypto.randomBytes(12).toString("hex");

      const client = await pool.connect();
      let result;
      try {
        await client.query("BEGIN");

        result = await client.query(
          `INSERT INTO transactions (
          transaction_id,
          merchant_order_id,
          amount,
          customer_name,
          customer_mobile,
          utr_number,
          payment_proof,
          bank_name,
          ifsc_code,
          account_number,
          account_holder_name,
          upi_id,
          account_id,
          merchant_id,
          agent_id,
          created_by_admin_id,
          max_payment_limit,
          max_available_limit,
          min_transaction_amount,
          webhook_url,
          unique_id,
          approved_or_reject_date,
          status,
          client_id
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,
          $21,$22,$23,$24
        )
        RETURNING *`,
          [
            transactionId,
            merchant_order_id,
            numericAmount,
            customer_name || "",
            customer_mobile || "",
            "",
            "",
            account.bank_name || "",
            account.ifsc_code || "",
            account.account_number || "",
            account.account_holder_name || "",
            account.upi_id || "",
            account.id,
            merchant.merchant_id,
            // Stamp the agent whose account actually took the payin (multi-agent routing)
            account.agent_id || merchant.agent_id,
            merchant.created_by_admin_id || account.agent_owner_id || null,
            account.max_payment_limit || 0,
            account.max_available_limit || 0,
            account.min_transaction_amount || 0,
            webhook_url || "",
            merchant_order_id,
            null,
            "Pending",
            merchant.client_id || null,
          ],
        );

        if (isWalletGateEnabled()) {
          // Informational debit only — never blocks Pay-In creation. See
          // debitAgentWalletForPayin: it cannot return ok:false for
          // insufficient balance anymore, so there is no failure branch here.
          await debitAgentWalletForPayin(client, {
            agentId: account.agent_id,
            amount: numericAmount,
            transactionId: result.rows[0].id,
          });
        }

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      const transaction = result.rows[0];

      return res.json({
        success: true,
        transaction_id: transaction.id,
        transaction_ref: transaction.transaction_id,
        merchant_order_id: transaction.merchant_order_id,
        amount: transaction.amount,
        status: transaction.status,
        bank_details: {
          bank_name: transaction.bank_name,
          ifsc_code: transaction.ifsc_code,
          account_number: transaction.account_number,
          account_holder_name: transaction.account_holder_name,
          upi_id: transaction.upi_id,
        },
      });
    } catch (error) {
      console.log("PAYIN CREATE ERROR", error.message, error.stack);
      return res.status(500).json({
        success: false,
        message: error.message || "Could not create payin",
      });
    }
  },
);

app.post("/api/payin/agent-submitutr", async (req, res) => {
  try {
    const { account_number, utr_number, amount, agent_username } = req.body;

    if (!agent_username || !String(agent_username).trim())
      return res
        .status(400)
        .json({ success: false, message: "agent_username is required" });
    if (!account_number || !String(account_number).trim())
      return res
        .status(400)
        .json({ success: false, message: "account_number is required" });
    if (!utr_number || !String(utr_number).trim())
      return res
        .status(400)
        .json({ success: false, message: "utr_number is required" });
    if (!amount || Number(amount) <= 0)
      return res
        .status(400)
        .json({ success: false, message: "Valid amount is required" });

    const cleanAgentUsername = String(agent_username).trim();
    const cleanAccountNumber = String(account_number).trim();
    const cleanUtrNumber = String(utr_number).trim();
    const numericAmount = Number(amount);

    const agentResult = await pool.query(
      `SELECT id, username, name, created_by_admin_id, is_active FROM agents WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) AND is_active = true LIMIT 1`,
      [cleanAgentUsername],
    );
    if (agentResult.rows.length === 0)
      return res
        .status(404)
        .json({
          success: false,
          message: "Active agent not found for this username",
        });

    const agent = agentResult.rows[0];

    const accountResult = await pool.query(
      `SELECT * FROM agent_accounts WHERE TRIM(account_number) = TRIM($1) AND agent_id = $2 AND is_active = true LIMIT 1`,
      [cleanAccountNumber, agent.id],
    );
    if (accountResult.rows.length === 0)
      return res
        .status(403)
        .json({
          success: false,
          message: "This account number does not belong to this agent",
        });

    const account = accountResult.rows[0];

    // Idempotency + double-credit guard: if this UTR is already Approved on any
    // transaction (a sibling order for the same single payment was already
    // approved — manually or by an earlier call), do NOT try to approve a second
    // row. That would double-credit and trips the UTR unique index (raw 500).
    // Return a clean success so the agent bot treats it as already done.
    const approvedDup = await pool.query(
      `SELECT id, transaction_id, amount, status FROM transactions
       WHERE regexp_replace(lower(trim(utr_number)), '^t', '') = regexp_replace(lower(trim($1)), '^t', '')
         AND status = 'Approved' LIMIT 1`,
      [cleanUtrNumber],
    );
    if (approvedDup.rows.length > 0) {
      const a = approvedDup.rows[0];
      return res.json({
        success: true,
        message:
          "UTR already approved — payment already credited on another order; no duplicate created.",
        created_new_transaction: false,
        matched_by: "already_approved",
        transaction: {
          id: a.id,
          transaction_id: a.transaction_id,
          amount: a.amount,
          utr_number: cleanUtrNumber,
          status: a.status,
        },
      });
    }

    const existingUtr = await pool.query(
      `SELECT id, transaction_id, amount, account_number, agent_id, status FROM transactions WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1)) LIMIT 1`,
      [cleanUtrNumber],
    );

    if (existingUtr.rows.length > 0) {
      const existing = existingUtr.rows[0];
      if (
        !amountsMatch(existing.amount, numericAmount) ||
        String(existing.account_number).trim() !== cleanAccountNumber ||
        Number(existing.agent_id) !== Number(agent.id)
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "UTR already exists but belongs to another transaction/account/agent",
            existing,
          });
      }
    }

    const matchedExisting = await pool.query(
      `UPDATE transactions SET status = 'Approved', approved_or_reject_date = CURRENT_TIMESTAMP
       WHERE TRIM(account_number) = TRIM($1) AND (LOWER(TRIM(utr_number)) = LOWER(TRIM($2)) OR LOWER(TRIM(disputed_utr)) = LOWER(TRIM($2))) AND ABS(amount - $3) < 1 AND agent_id = $4 AND account_id = $5 AND status IN ('Pending', 'UTR Submitted', 'Disputed')
       RETURNING *`,
      [
        cleanAccountNumber,
        cleanUtrNumber,
        numericAmount,
        agent.id,
        account.id,
      ],
    );

    if (matchedExisting.rows.length > 0) {
      const txn = matchedExisting.rows[0];
      fireWebhook(pool, txn);
      return res.json({
        success: true,
        message: "Transaction matched by UTR, approved and webhook triggered",
        created_new_transaction: false,
        matched_by: "utr",
        agent: {
          id: agent.id,
          username: agent.username,
          name: agent.name,
        },
        transaction: {
          id: txn.id,
          transaction_id: txn.transaction_id,
          amount: txn.amount,
          utr_number: txn.utr_number,
          account_number: txn.account_number,
          agent_id: txn.agent_id,
          account_id: txn.account_id,
          status: txn.status,
          approved_or_reject_date: txn.approved_or_reject_date,
        },
      });
    }

    // Agent bot's submission alone never auto-approves a merchant row that hasn't submitted
    // UTR yet. The earlier "match by exact UTR" branch handles the case where the merchant (or
    // customer in checkout) submitted this same UTR first. Otherwise save as Agent Verified
    // (status name kept for backward-compatible reporting) and wait for the merchant's submit-utr.

    const transactionId = crypto.randomBytes(12).toString("hex");
    const insertResult = await pool.query(
      `INSERT INTO transactions (transaction_id, amount, utr_number, payment_proof, bank_name, ifsc_code, account_number, account_holder_name, upi_id, account_id, merchant_id, agent_id, created_by_admin_id, max_payment_limit, max_available_limit, min_transaction_amount, webhook_url, unique_id, approved_or_reject_date, status, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NULL,'Agent Verified',$19) RETURNING *`,
      [
        transactionId,
        numericAmount,
        cleanUtrNumber,
        "",
        account.bank_name || "",
        account.ifsc_code || "",
        account.account_number || "",
        account.account_holder_name || "",
        account.upi_id || "",
        account.id,
        null,
        agent.id,
        agent.created_by_admin_id || account.created_by_admin_id || null,
        account.max_payment_limit || 0,
        account.max_available_limit || 0,
        account.min_transaction_amount || 0,
        "",
        `proof-${transactionId}`,
        account.client_id || null,
      ],
    );
    const txn = insertResult.rows[0];

    res.json({
      success: true,
      message:
        "No matching merchant transaction yet. Saved as Agent Verified proof, awaiting merchant submission.",
      created_new_transaction: true,
      agent: {
        id: agent.id,
        username: agent.username,
        name: agent.name,
      },
      transaction: {
        id: txn.id,
        transaction_id: txn.transaction_id,
        amount: txn.amount,
        utr_number: txn.utr_number,
        account_number: txn.account_number,
        agent_id: txn.agent_id,
        account_id: txn.account_id,
        status: txn.status,
        approved_or_reject_date: txn.approved_or_reject_date,
      },
    });
  } catch (error) {
    console.log("Agent submit UTR match/create error:", error);
    // Duplicate-UTR unique-index violation → clean 409 instead of a raw 500.
    if (error && (error.code === "23505" || error.statusCode === 409)) {
      return res.status(409).json({
        success: false,
        message:
          "This UTR is already recorded/approved on another transaction — not created again.",
      });
    }
    res
      .status(500)
      .json({
        success: false,
        message: "Could not match or create agent UTR",
      });
  }
});

app.post(
  "/api/payin/submit-utr",
  authenticateMerchantApiKey,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const merchant = req.merchantApiUser;
      const { transaction_id, utr_number } = req.body;

      if (!transaction_id || !utr_number) {
        client.release();
        return res
          .status(400)
          .json({
            success: false,
            message: "transaction_id and utr_number are required",
          });
      }

      const merchantId = Number(merchant.merchant_id);
      if (!merchantId) {
        client.release();
        return res
          .status(400)
          .json({
            success: false,
            message: "Merchant not found from API key",
          });
      }

      const transactionInput = String(transaction_id).trim();
      const utrInput = String(utr_number).trim();

      await client.query("BEGIN");

      const txnResult = await client.query(
        `SELECT * FROM transactions
       WHERE merchant_id = $1
         AND (id::text = $2 OR transaction_id::text = $2 OR merchant_order_id::text = $2)
       LIMIT 1`,
        [merchantId, transactionInput],
      );

      if (txnResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({
            success: false,
            message: "Transaction not found for this API key",
          });
      }

      const txn = txnResult.rows[0];

      if (txn.status === "Approved") {
        await client.query("ROLLBACK");
        if (
          String(txn.utr_number || "")
            .trim()
            .toLowerCase() === utrInput.toLowerCase()
        ) {
          return res.json({
            success: true,
            message: "Transaction already approved with this UTR",
            transaction_id: txn.id,
            merchant_order_id: txn.merchant_order_id,
            utr_number: txn.utr_number,
            status: txn.status,
          });
        }
        return res.status(409).json({
          success: false,
          message: "Transaction already approved with a different UTR",
          utr_number: txn.utr_number,
        });
      }

      // Match by amount + UTR only - UTR is unique system-wide so there's no ambiguity.
      // Amount is matched within <₹1 so a 1944 agent proof still matches a 1944.44 payment.
      const proofMatch = await client.query(
        `SELECT * FROM transactions
       WHERE status = 'Agent Verified'
         AND LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
         AND ABS(amount - $2) < 1
       LIMIT 1`,
        [utrInput, Number(txn.amount)],
      );

      if (proofMatch.rows.length > 0) {
        const proof = proofMatch.rows[0];
        await client.query(`DELETE FROM transactions WHERE id = $1`, [
          proof.id,
        ]);

        // Re-attribute the transaction to the bank account the money ACTUALLY
        // arrived in (the agent proof's account) — not the account it was
        // originally routed to — so bank-wise tracking credits the right bank.
        const updated = await client.query(
          `UPDATE transactions
         SET utr_number = $1,
             payment_proof = COALESCE(NULLIF($2, ''), payment_proof),
             status = 'Approved',
             utr_submitted_at = COALESCE(utr_submitted_at, NOW()),
             approved_or_reject_date = NOW(),
             account_id = $5,
             agent_id = COALESCE($6, agent_id),
             bank_name = $7,
             ifsc_code = $8,
             account_number = $9,
             account_holder_name = $10,
             upi_id = $11
         WHERE id = $3 AND merchant_id = $4
         RETURNING *`,
          [
            utrInput,
            proof.payment_proof || "",
            txn.id,
            merchantId,
            proof.account_id,
            proof.agent_id,
            proof.bank_name || "",
            proof.ifsc_code || "",
            proof.account_number || "",
            proof.account_holder_name || "",
            proof.upi_id || "",
          ],
        );

        await client.query("COMMIT");

        const approvedTxn = updated.rows[0];
        fireWebhook(pool, approvedTxn);

        return res.json({
          success: true,
          message: "Matched agent's proof. Transaction approved.",
          transaction_id: approvedTxn.id,
          merchant_order_id: approvedTxn.merchant_order_id,
          utr_number: approvedTxn.utr_number,
          status: approvedTxn.status,
        });
      }

      const utrCollision = await client.query(
        `SELECT id FROM transactions
       WHERE LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
         AND id <> $2
         AND COALESCE(TRIM(utr_number), '') <> ''
         AND status NOT IN ('Failed','Rejected','Expired','Agent Verified','Disputed')
       LIMIT 1`,
        [utrInput, txn.id],
      );
      if (utrCollision.rows.length > 0) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({
            success: false,
            message: "UTR number already exists. UTR cannot repeat.",
          });
      }

      const result = await client.query(
        `UPDATE transactions
       SET utr_number = $1,
           status = 'UTR Submitted',
           utr_submitted_at = NOW(),
           approved_or_reject_date = NULL
       WHERE id = $2 AND merchant_id = $3
       RETURNING *`,
        [utrInput, txn.id, merchantId],
      );

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "UTR submitted successfully",
        transaction_id: result.rows[0].id,
        merchant_order_id: result.rows[0].merchant_order_id,
        utr_number: result.rows[0].utr_number,
        status: result.rows[0].status,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("SUBMIT UTR ERROR", error);
      if (handleKnownValidationError(res, error)) return;
      return res.status(500).json({
        success: false,
        message: error.message || "Could not submit UTR",
      });
    } finally {
      client.release();
    }
  },
);

app.get(
  "/api/payin/status/:transactionId",
  authenticateMerchantApiKey,
  async (req, res) => {
    try {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("PAYIN STATUS API HIT");

      const merchant = req.merchantApiUser;
      const { transactionId } = req.params;

      console.log("AUTH USER:", merchant);
      console.log("PARAM transactionId:", transactionId);

      const txnInput = String(transactionId).trim();

      console.log("txnInput:", txnInput);

      const result = await pool.query(
        `SELECT id, transaction_id, merchant_order_id, amount,
              customer_name, customer_mobile, utr_number,
              status, approved_or_reject_date, created_at
       FROM transactions
       WHERE merchant_id = $1
         AND (
           id::text = $2
           OR transaction_id::text = $2
           OR merchant_order_id::text = $2
         )
       LIMIT 1`,
        [Number(merchant.merchant_id), txnInput],
      );

      console.log("STATUS QUERY RESULT:", result.rows);

      if (result.rows.length === 0) {
        console.log("TRANSACTION NOT FOUND");

        return res.status(404).json({
          success: false,
          message: "Transaction not found for this API key",
        });
      }

      console.log("STATUS FETCH SUCCESS");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      res.json({
        success: true,
        transaction: result.rows[0],
      });
    } catch (error) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("PAYIN STATUS ERROR");
      console.log(error);
      console.log("ERROR MESSAGE:", error.message);
      console.log("ERROR STACK:", error.stack);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      res.status(500).json({
        success: false,
        message: error.message || "Could not fetch status",
      });
    }
  },
);

// ─── HOSTED CHECKOUT FLOW ─────────────────────────────────────────────────────
// Merchant calls /api/payin/checkout/create to get a checkout_url on our
// site. The customer visits that page, sees the bank
// details and a 5-minute countdown, and submits the UTR directly. Three public
// endpoints (no API key — the random transaction_ref is the bearer) back the
// hosted page: GET /api/checkout/:ref, POST /api/checkout/:ref/submit-utr, and
// GET /api/checkout/:ref/status.

const CHECKOUT_BASE_URL = (
  process.env.CHECKOUT_BASE_URL || "http://localhost:5173"
).replace(/\/+$/, "");
const CHECKOUT_TTL_SECONDS = 15 * 60; // 15 minutes — customer must submit UTR within this window
const VERIFICATION_TTL_SECONDS = 15 * 60; // 15 minutes — after UTR submitted, auto-fail if no match

function buildCheckoutUrl(transactionRef) {
  return `${CHECKOUT_BASE_URL}/checkout/${transactionRef}`;
}

function remainingSeconds(expiresAt) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

function verificationRemainingSeconds(txn) {
  if (!txn || txn.status !== "UTR Submitted") return 0;
  return remainingSeconds(txn.verification_expires_at);
}

app.post(
  "/api/payin/checkout/create",
  authenticateMerchantApiKey,
  async (req, res) => {
    try {
      const maintenanceCheck = await checkMaintenanceBlocksPayins();
      if (maintenanceCheck.blocked)
        return res.status(503).json({ success: false, message: maintenanceCheck.message, maintenance: true });

      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("CHECKOUT CREATE API HIT");
      console.log("BODY:", JSON.stringify(req.body));
      console.log("MERCHANT_ID:", req.merchantApiUser?.merchant_id);

      const merchant = req.merchantApiUser;
      const {
        merchant_order_id,
        amount,
        customer_name,
        customer_mobile,
        webhook_url,
        redirect_url,
      } = req.body;
      const numericAmount = Number(amount);

      if (!merchant_order_id) {
        return res
          .status(400)
          .json({ success: false, message: "merchant_order_id is required" });
      }
      if (!numericAmount || numericAmount <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "Valid amount is required" });
      }
      if (!merchant.agent_id) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Merchant is not linked to an agent",
          });
      }

      const account = await findCandidateAgentAccount(pool, {
        amount: numericAmount,
        merchantId: Number(merchant.merchant_id),
        requireAgentRestriction: true,
      });

      if (!account) {
        return res.status(400).json({
          success: false,
          message: "No active agent bank account available for this amount",
        });
      }

      const transactionId = crypto.randomBytes(12).toString("hex");

      const client = await pool.connect();
      let result;
      try {
        await client.query("BEGIN");

        result = await client.query(
          `INSERT INTO transactions (
          transaction_id, merchant_order_id, amount, customer_name, customer_mobile,
          utr_number, payment_proof, bank_name, ifsc_code, account_number,
          account_holder_name, upi_id, account_id, merchant_id,
          agent_id, created_by_admin_id, max_payment_limit, max_available_limit,
          min_transaction_amount, webhook_url, redirect_url, unique_id, approved_or_reject_date, status,
  checkout_mode, expires_at, client_id
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10,
          $11,$12,$13,$14,
          $15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,
  $25, NOW() + ($26 || ' seconds')::interval, $27
        )
        RETURNING *`,
          [
            transactionId,
            merchant_order_id,
            numericAmount,
            customer_name || "",
            customer_mobile || "",
            "",
            "",
            account.bank_name || "",
            account.ifsc_code || "",
            account.account_number || "",
            account.account_holder_name || "",
            account.upi_id || "",
            account.id,
            merchant.merchant_id,
            // Stamp the agent whose account actually took the payin (multi-agent routing)
            account.agent_id || merchant.agent_id,
            merchant.created_by_admin_id ||
              account.agent_owner_id ||
              null,
            account.max_payment_limit || 0,
            account.max_available_limit || 0,
            account.min_transaction_amount || 0,
            webhook_url || "",
            redirect_url || "",
            merchant_order_id,
            null,
            "Pending",
            true,
            String(CHECKOUT_TTL_SECONDS),
            merchant.client_id || null,
          ],
        );

        if (isWalletGateEnabled()) {
          // Informational debit only — never blocks Pay-In creation. See
          // debitAgentWalletForPayin: it cannot return ok:false for
          // insufficient balance anymore, so there is no failure branch here.
          await debitAgentWalletForPayin(client, {
            agentId: account.agent_id,
            amount: numericAmount,
            transactionId: result.rows[0].id,
          });
        }

        await client.query("COMMIT");
      } catch (txErr) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      // max_available_limit is no longer independently decremented — the
      // agent wallet debited above is the single source of truth for
      // funded balance. The account's own daily cap is unaffected.

      const transaction = result.rows[0];

      console.log("CHECKOUT CREATE SUCCESS", {
        transaction_ref: transaction.transaction_id,
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      return res.json({
        success: true,
        transaction_id: transaction.id,
        transaction_ref: transaction.transaction_id,
        merchant_order_id: transaction.merchant_order_id,
        amount: transaction.amount,
        status: transaction.status,
        checkout_url: buildCheckoutUrl(transaction.transaction_id),
        expires_at: transaction.expires_at,
        expires_in_seconds: remainingSeconds(transaction.expires_at),
      });
    } catch (error) {
      console.log("CHECKOUT CREATE ERROR", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Could not create checkout",
      });
    }
  },
);

// Helper: load a checkout transaction by the public transaction_ref and run
// on-the-fly expiry so the customer sees state changes immediately rather than
// waiting for the 60s background sweep.
async function loadCheckoutTransactionByRef(ref) {
  const result = await pool.query(
    `SELECT * FROM transactions
     WHERE checkout_mode = true
       AND transaction_id = $1
     LIMIT 1`,
    [String(ref).trim()],
  );
  if (result.rows.length === 0) return null;
  let txn = result.rows[0];

  if (
    txn.status === "Pending" &&
    txn.expires_at &&
    new Date(txn.expires_at).getTime() <= Date.now()
  ) {
    const expired = await expireCheckoutTransaction(txn.id);
    if (expired) txn = expired;
  }

  if (
    txn.status === "UTR Submitted" &&
    txn.verification_expires_at &&
    new Date(txn.verification_expires_at).getTime() <= Date.now()
  ) {
    const failed = await failVerificationTransaction(txn.id);
    if (failed) txn = failed;
  }

  return txn;
}

app.get("/api/checkout/:ref", async (req, res) => {
  try {
    const txn = await loadCheckoutTransactionByRef(req.params.ref);
    if (!txn)
      return res
        .status(404)
        .json({ success: false, message: "Checkout not found" });

    // Hide the "Pay with" app buttons (showing only Scan-QR + Copy-UPI) when
    // either the client is in test_mode, or the merchant has opted into the
    // per-merchant hide_checkout_app_buttons toggle.
    let hideAppButtons = false;
    if (txn.client_id) {
      const clientRow = await pool.query(
        `SELECT test_mode_enabled FROM clients WHERE id = $1 LIMIT 1`,
        [Number(txn.client_id)],
      );
      hideAppButtons = clientRow.rows[0]?.test_mode_enabled === true;
    }
    if (!hideAppButtons && txn.merchant_id) {
      const mRow = await pool.query(
        `SELECT hide_checkout_app_buttons FROM merchants WHERE id = $1 LIMIT 1`,
        [Number(txn.merchant_id)],
      );
      hideAppButtons = mRow.rows[0]?.hide_checkout_app_buttons === true;
    }

    return res.json({
      success: true,
      transaction_ref: txn.transaction_id,
      merchant_order_id: txn.merchant_order_id,
      amount: txn.amount,
      customer_name: txn.customer_name || "",
      customer_mobile: txn.customer_mobile || "",
      status: txn.status,
      utr_number: txn.utr_number || "",
      disputed_utr: txn.disputed_utr || "",
      redirect_url: txn.redirect_url || "",
      bank_details: {
        bank_name: txn.bank_name,
        ifsc_code: txn.ifsc_code,
        account_number: txn.account_number,
        account_holder_name: txn.account_holder_name,
        upi_id: txn.upi_id,
      },
      hide_app_buttons: hideAppButtons,
      expires_at: txn.expires_at,
      remaining_seconds: remainingSeconds(txn.expires_at),
      verification_expires_at: txn.verification_expires_at,
      verification_remaining_seconds: verificationRemainingSeconds(txn),
    });
  } catch (error) {
    console.log("CHECKOUT GET ERROR", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Could not fetch checkout",
      });
  }
});

app.post("/api/checkout/:ref/submit-utr", async (req, res) => {
  try {
    const { utr_number } = req.body || {};
    if (!utr_number || !String(utr_number).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "utr_number is required" });
    }
    const utrInput = String(utr_number).trim();

    const txn = await loadCheckoutTransactionByRef(req.params.ref);
    if (!txn)
      return res
        .status(404)
        .json({ success: false, message: "Checkout not found" });

    if (txn.status === "Expired") {
      return res
        .status(410)
        .json({ success: false, message: "Checkout has expired" });
    }
    if (txn.status === "Failed") {
      return res.status(409).json({
        success: false,
        message:
          "Verification failed. If you have already paid, please submit a dispute with your correct UTR.",
        status: txn.status,
      });
    }
    if (txn.status !== "Pending" && txn.status !== "UTR Submitted") {
      return res.status(409).json({
        success: false,
        message: `Cannot submit UTR — transaction is already ${txn.status}`,
        status: txn.status,
      });
    }

    // Match by amount + UTR only - UTR is unique system-wide.
    // Amount is matched within <₹1 so a 1944 agent proof still matches a 1944.44 payment.
    const proofMatch = await pool.query(
      `SELECT * FROM transactions
       WHERE status = 'Agent Verified'
         AND LOWER(TRIM(utr_number)) = LOWER(TRIM($1))
         AND ABS(amount - $2) < 1
       LIMIT 1`,
      [utrInput, Number(txn.amount)],
    );

    if (proofMatch.rows.length > 0) {
      const proof = proofMatch.rows[0];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM transactions WHERE id = $1`, [
          proof.id,
        ]);
        // Re-attribute to the agent proof's actual receiving account so bank
        // tracking credits the bank the money really landed in.
        const approved = await client.query(
          `UPDATE transactions
           SET utr_number = $1,
               payment_proof = COALESCE(NULLIF($2, ''), payment_proof),
               status = 'Approved',
               utr_submitted_at = COALESCE(utr_submitted_at, NOW()),
               approved_or_reject_date = NOW(),
               account_id = $4,
               agent_id = $5,
               agent_id = COALESCE($6, agent_id),
               bank_name = $7,
               ifsc_code = $8,
               account_number = $9,
               account_holder_name = $10,
               upi_id = $11
           WHERE id = $3 AND checkout_mode = true
           RETURNING *`,
          [
            utrInput,
            proof.payment_proof || "",
            txn.id,
            proof.account_id,
            proof.agent_id,
            proof.agent_id,
            proof.bank_name || "",
            proof.ifsc_code || "",
            proof.account_number || "",
            proof.account_holder_name || "",
            proof.upi_id || "",
          ],
        );
        await client.query("COMMIT");

        const approvedTxn = approved.rows[0];
        fireWebhook(pool, approvedTxn);

        return res.json({
          success: true,
          message: "Matched agent's proof. Payment verified.",
          transaction_ref: approvedTxn.transaction_id,
          utr_number: approvedTxn.utr_number,
          status: approvedTxn.status,
          remaining_seconds: remainingSeconds(approvedTxn.expires_at),
          verification_remaining_seconds: 0,
        });
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }

    await assertUniqueUtr(utrInput, "transactions", txn.id);

    const result = await pool.query(
      `UPDATE transactions
       SET utr_number = $1,
           status = 'UTR Submitted',
           utr_submitted_at = NOW(),
           approved_or_reject_date = NULL,
           verification_expires_at = NOW() + ($3 || ' seconds')::interval
       WHERE id = $2
         AND checkout_mode = true
         AND status IN ('Pending', 'UTR Submitted')
       RETURNING *`,
      [utrInput, txn.id, String(VERIFICATION_TTL_SECONDS)],
    );

    if (result.rows.length === 0) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Transaction state changed, please refresh",
        });
    }

    const updated = result.rows[0];

    return res.json({
      success: true,
      message: "UTR submitted. Waiting for verification.",
      transaction_ref: updated.transaction_id,
      utr_number: updated.utr_number,
      status: updated.status,
      remaining_seconds: remainingSeconds(updated.expires_at),
      verification_remaining_seconds: verificationRemainingSeconds(updated),
    });
  } catch (error) {
    console.log("CHECKOUT SUBMIT UTR ERROR", error);
    if (handleKnownValidationError(res, error)) return;
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Could not submit UTR",
      });
  }
});

app.post("/api/checkout/:ref/dispute", async (req, res) => {
  try {
    const { utr_number } = req.body || {};
    if (!utr_number || !String(utr_number).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "utr_number is required" });
    }
    const utrInput = String(utr_number).trim();

    const txn = await loadCheckoutTransactionByRef(req.params.ref);
    if (!txn)
      return res
        .status(404)
        .json({ success: false, message: "Checkout not found" });

    if (txn.status !== "Failed") {
      return res.status(409).json({
        success: false,
        message: `Disputes can only be raised on failed transactions (current status: ${txn.status})`,
        status: txn.status,
      });
    }

    await assertUniqueUtr(utrInput, "transactions", txn.id);

    const result = await pool.query(
      `UPDATE transactions
       SET disputed_utr = $1,
           status = 'Disputed',
           approved_or_reject_date = NULL
       WHERE id = $2
         AND checkout_mode = true
         AND status = 'Failed'
       RETURNING *`,
      [utrInput, txn.id],
    );

    if (result.rows.length === 0) {
      return res
        .status(409)
        .json({
          success: false,
          message: "Transaction state changed, please refresh",
        });
    }

    const updated = result.rows[0];
    fireWebhook(pool, updated, "payin.disputed");

    // Fire-and-forget alert — claimDisputeAlert() guarantees at most one
    // email even if this endpoint is retried (the UPDATE above already
    // requires status='Failed', so a retry naturally 409s before reaching
    // here; the claim is a second, independent layer of protection).
    claimDisputeAlert("transactions", updated.id)
      .then((claimed) => {
        if (!claimed) return;
        return sendPayinDisputeAlert(updated.id, {
          raisedByLabel: "Customer (Hosted Checkout)",
          reason: `Customer submitted UTR ${utrInput} disputing a Failed transaction`,
        });
      })
      .catch((e) => console.error("[ALERTS] checkout dispute alert error:", e.message));

    return res.json({
      success: true,
      message: "Dispute submitted. An agent will review your payment.",
      transaction_ref: updated.transaction_id,
      disputed_utr: updated.disputed_utr,
      status: updated.status,
    });
  } catch (error) {
    console.log("CHECKOUT DISPUTE ERROR", error);
    if (handleKnownValidationError(res, error)) return;
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Could not submit dispute",
      });
  }
});

app.get("/api/checkout/:ref/status", async (req, res) => {
  try {
    const txn = await loadCheckoutTransactionByRef(req.params.ref);
    if (!txn)
      return res
        .status(404)
        .json({ success: false, message: "Checkout not found" });

    return res.json({
      success: true,
      transaction_ref: txn.transaction_id,
      status: txn.status,
      utr_number: txn.utr_number || "",
      disputed_utr: txn.disputed_utr || "",
      redirect_url: txn.redirect_url || "",
      remaining_seconds: remainingSeconds(txn.expires_at),
      verification_remaining_seconds: verificationRemainingSeconds(txn),
      approved_at:
        txn.status === "Approved" ? txn.approved_or_reject_date : null,
      expired_at: txn.status === "Expired" ? txn.approved_or_reject_date : null,
      failed_at: txn.status === "Failed" ? txn.approved_or_reject_date : null,
    });
  } catch (error) {
    console.log("CHECKOUT STATUS ERROR", error);
    return res
      .status(500)
      .json({
        success: false,
        message: error.message || "Could not fetch status",
      });
  }
});

// ─── TRACKING ─────────────────────────────────────────────────────────────────
function buildScopeWhere(alias, role, userId) {
  if (role === "admin")
    return { clause: `${alias}.created_by_admin_id = $1`, values: [userId] };
  if (role === "merchant")
    return { clause: `${alias}.merchant_id = $1`, values: [userId] };
  if (role === "agent")
    return { clause: `${alias}.agent_id = $1`, values: [userId] };
  if (role === "agent")
    return { clause: `${alias}.agent_id = $1`, values: [userId] };
  return { clause: "1=0", values: [] };
}

app.get("/api/tracking/login-activity", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    if (!role || !userId)
      return res.status(401).json({ message: "Unauthorized" });
    if (role !== "admin")
      return res
        .status(403)
        .json({ message: "Login activity is available for admin only" });

    const result = await pool.query(
      `SELECT * FROM login_activity
       WHERE (role='admin' AND user_id=$1)
          OR (role='agent' AND user_id IN (SELECT id FROM agents WHERE created_by_admin_id=$1))
          OR (role='merchant' AND user_id IN (SELECT id FROM merchants WHERE created_by_admin_id=$1))
          OR (role='merchant' AND user_id IN (SELECT id FROM merchants WHERE created_by_admin_id=$1))
          OR (role='agent' AND user_id IN (SELECT id FROM agents WHERE created_by_admin_id=$1))
       ORDER BY logged_in_at DESC LIMIT 500`,
      [userId],
    );
    res.json(result.rows);
  } catch (error) {
    console.log("Login activity fetch error:", error);
    res.status(500).json({ message: "Could not fetch login activity" });
  }
});

app.get("/api/tracking/balance", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    if (!role || !userId)
      return res.status(401).json({ message: "Unauthorized" });

    const payinScope = buildScopeWhere("t", role, userId);
    const settlementScope = buildScopeWhere("st", role, userId);

    const payinSummary = await pool.query(
      `SELECT
         COUNT(CASE WHEN status IN ('Approved','Success') THEN 1 END) AS total_transactions,
         COALESCE(SUM(CASE WHEN status IN ('Approved','Success') THEN amount ELSE 0 END),0) AS total_amount,
         COALESCE(SUM(CASE WHEN status IN ('Approved','Success') THEN amount ELSE 0 END),0) AS approved_amount,
         0 AS pending_amount,
         COUNT(CASE WHEN status IN ('Approved','Success') THEN 1 END) AS approved_count,
         0 AS pending_count
       FROM transactions t WHERE ${payinScope.clause}`,
      payinScope.values,
    );

    const settlementSummary = await pool.query(
      `SELECT
         COUNT(CASE WHEN transaction_status IN ('Approved','Success') THEN 1 END) AS total_transactions,
         COALESCE(SUM(CASE WHEN transaction_status IN ('Approved','Success') THEN amount ELSE 0 END),0) AS total_amount,
         COALESCE(SUM(CASE WHEN transaction_status IN ('Approved','Success') THEN amount ELSE 0 END),0) AS approved_amount,
         0 AS pending_amount,
         COUNT(CASE WHEN transaction_status IN ('Approved','Success') THEN 1 END) AS approved_count,
         0 AS pending_count
       FROM settlement_transactions st WHERE ${settlementScope.clause}`,
      settlementScope.values,
    );

    let accountWhere = "1=0";
    const accountValues = [];
    if (role === "admin") {
      accountWhere = "oa.created_by_admin_id=$1";
      accountValues.push(userId);
    } else if (role === "agent") {
      accountWhere = "oa.agent_id=$1";
      accountValues.push(userId);
    } else if (role === "merchant") {
      accountWhere = "oa.agent_id=(SELECT agent_id FROM merchants WHERE id=$1)";
      accountValues.push(userId);
    }

    // Bank limits are a DAILY DEPOSIT allowance. "Used today" = how much the account
    // RECEIVED today (today's IST approved payins, gross). It resets automatically at
    // IST midnight as the filter rolls to the new date. Available = limit - used_today.
    // Withdrawals are tracked separately (withdrawn_today, for cash reconciliation) and
    // do NOT reduce used — pulling cash out doesn't change how much was deposited today,
    // and a withdrawal of a prior day's money must not distort today's figure.
    const agentAccounts = await pool.query(
      `SELECT oa.id, oa.bank_name, oa.account_number, oa.account_holder_name, oa.max_payment_limit, oa.max_available_limit, oa.is_active,
              COALESCE(oa.withdrawn_total,0) AS withdrawn_total,
              COALESCE(wd.withdrawn_today,0) AS withdrawn_today,
              COALESCE(used.used_amount,0) AS used_amount,
              (COALESCE(oa.max_payment_limit,0) - COALESCE(used.used_amount,0)) AS available_amount,
              a.name AS agent_name
       FROM agent_accounts oa
       LEFT JOIN agents a ON oa.agent_id=a.id
       LEFT JOIN (
         SELECT account_id, COALESCE(SUM(amount),0) AS used_amount
         FROM transactions
         WHERE status IN ('Approved','Success') AND account_id IS NOT NULL
           AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
               = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         GROUP BY account_id
       ) used ON used.account_id = oa.id
       LEFT JOIN (
         SELECT account_id, COALESCE(SUM(amount),0) AS withdrawn_today
         FROM agent_account_withdrawals
         WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
               = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
         GROUP BY account_id
       ) wd ON wd.account_id = oa.id
       WHERE ${accountWhere} ORDER BY oa.id DESC LIMIT 500`,
      accountValues,
    );

    let settlementAccountWhere = "1=0";
    const settlementAccountValues = [];
    if (role === "admin") {
      settlementAccountWhere = "sa.created_by_admin_id=$1";
      settlementAccountValues.push(userId);
    } else if (role === "merchant") {
      settlementAccountWhere = "sa.merchant_id=$1";
      settlementAccountValues.push(userId);
    } else if (role === "agent") {
      settlementAccountWhere = "m.agent_id=$1";
      settlementAccountValues.push(userId);
    }

    const settlementAccounts = await pool.query(
      `SELECT sa.id, sa.bank_name, sa.account_number, sa.account_holder_name, sa.max_payment_limit,
              COALESCE(SUM(st.amount),0) AS used_amount,
              (COALESCE(sa.max_payment_limit,0) - COALESCE(SUM(st.amount),0)) AS available_amount,
              m.name AS merchant_name, a.name AS agent_name
       FROM settlement_accounts sa
       LEFT JOIN merchants m ON sa.merchant_id=m.id
       LEFT JOIN agents a ON m.agent_id=a.id
       LEFT JOIN settlement_transactions st ON st.settlement_account_id=sa.id AND st.transaction_status IN ('Approved','Success')
       WHERE ${settlementAccountWhere}
       GROUP BY sa.id, m.name, a.name ORDER BY sa.id DESC LIMIT 500`,
      settlementAccountValues,
    );

    const payinRow = payinSummary.rows[0] || {};
    const settlementRow = settlementSummary.rows[0] || {};
    const totalAmount = Number(payinRow.total_amount || 0);
    const totalUsed = Number(settlementRow.total_amount || 0);

    res.json({
      payin: payinRow,
      settlement: settlementRow,
      agentAccounts: agentAccounts.rows,
      settlementAccounts: settlementAccounts.rows,
      summary: {
        totalAmount,
        totalUsed,
        totalAvailable: totalAmount - totalUsed,
        totalTransactions: Number(payinRow.total_transactions || 0),
        totalAccounts:
          agentAccounts.rows.length + settlementAccounts.rows.length,
        approvedTransactions: Number(payinRow.approved_count || 0),
        pendingTransactions: Number(payinRow.pending_count || 0),
      },
    });
  } catch (error) {
    console.log("Balance tracking fetch error:", error);
    res.status(500).json({ message: "Could not fetch balance tracking" });
  }
});

// Per-day usage history for the requester's collection bank accounts. Returns the
// last N IST days, each day's net used per account (approved payins minus that day's
// withdrawals, floored at 0) plus a per-day total across all banks.
app.get("/api/tracking/balance-history", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    if (!role || !userId)
      return res.status(401).json({ message: "Unauthorized" });

    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 60);

    let accountWhere = "1=0";
    const accountValues = [];
    if (role === "admin") {
      accountWhere = "oa.created_by_admin_id=$1";
      accountValues.push(userId);
    } else if (role === "agent") {
      accountWhere = "oa.agent_id=$1";
      accountValues.push(userId);
    } else {
      return res.json({ accounts: [], days: [] });
    }

    const accountsResult = await pool.query(
      `SELECT oa.id, oa.bank_name, oa.account_number
       FROM agent_accounts oa
       LEFT JOIN agents o ON oa.agent_id = o.id
       WHERE ${accountWhere}
       ORDER BY oa.id DESC`,
      accountValues,
    );
    const accounts = accountsResult.rows;
    if (accounts.length === 0) return res.json({ accounts: [], days: [] });

    const accountIds = accounts.map((a) => a.id);

    const usage = await pool.query(
      `WITH payins AS (
         SELECT account_id,
                (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS d,
                COALESCE(SUM(amount), 0) AS amt
         FROM transactions
         WHERE status IN ('Approved','Success') AND account_id = ANY($1)
           AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
               > (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $2::int
         GROUP BY account_id, d
       ),
       wd AS (
         SELECT account_id,
                (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date AS d,
                COALESCE(SUM(amount), 0) AS amt
         FROM agent_account_withdrawals
         WHERE account_id = ANY($1)
           AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date
               > (NOW() AT TIME ZONE 'Asia/Kolkata')::date - $2::int
         GROUP BY account_id, d
       )
       SELECT COALESCE(p.account_id, w.account_id) AS account_id,
              to_char(COALESCE(p.d, w.d), 'YYYY-MM-DD') AS ist_date,
              COALESCE(p.amt, 0) AS gross_amount,
              COALESCE(w.amt, 0) AS withdrawn_amount
       FROM payins p
       FULL OUTER JOIN wd w ON p.account_id = w.account_id AND p.d = w.d`,
      [accountIds, days],
    );

    // Pivot: date -> per-account GROSS deposits, plus per-day gross/withdrawn/net totals.
    const byDate = {};
    for (const row of usage.rows) {
      const date = row.ist_date;
      if (!byDate[date]) byDate[date] = { perAccount: {}, withdrawn: 0 };
      byDate[date].perAccount[row.account_id] = Number(row.gross_amount || 0);
      byDate[date].withdrawn += Number(row.withdrawn_amount || 0);
    }

    const daysOut = Object.keys(byDate)
      .sort((a, b) => (a < b ? 1 : -1)) // newest first
      .map((date) => {
        const perAccount = {};
        let gross = 0;
        for (const acc of accounts) {
          const v = Number(byDate[date].perAccount[acc.id] || 0);
          perAccount[acc.id] = v;
          gross += v;
        }
        const withdrawn = Number(byDate[date].withdrawn || 0);
        return { date, perAccount, gross, withdrawn, net: Math.max(gross - withdrawn, 0) };
      });

    res.json({ accounts, days: daysOut });
  } catch (error) {
    console.log("Balance history fetch error:", error);
    res.status(500).json({ message: "Could not fetch balance history" });
  }
});

// Record a withdrawal from an agent bank account — frees that much of its limit.
app.post("/api/tracking/agent-account/:id/withdraw", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const accountId = Number(req.params.id);
    const amount = Number(req.body.amount);
    const remark = String(req.body.remark || "").trim();
    // Optional back-date (YYYY-MM-DD, IST). Stored at noon so the IST day is preserved.
    const date = String(req.body.date || "").trim();
    // Optional link to a previous tracking entry (reference only).
    const linkedRef = String(req.body.linked_ref || "").trim();
    const linkedLabel = String(req.body.linked_label || "").trim();

    if (!accountId) return res.status(400).json({ message: "Invalid account" });
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "Valid amount is required" });

    let scope = "1=0";
    const values = [accountId];
    if (role === "admin") {
      scope = "oa.created_by_admin_id = $2";
      values.push(userId);
    } else if (role === "agent") {
      scope = "oa.agent_id = $2";
      values.push(userId);
    } else {
      return res.status(403).json({ message: "Not allowed" });
    }

    const found = await pool.query(
      `SELECT oa.id FROM agent_accounts oa
       LEFT JOIN agents o ON oa.agent_id = o.id
       WHERE oa.id = $1 AND ${scope}`,
      values,
    );
    if (found.rows.length === 0)
      return res
        .status(404)
        .json({ message: "Account not found or not allowed" });

    await pool.query(
      `UPDATE agent_accounts
       SET withdrawn_total = COALESCE(withdrawn_total,0) + $1
       WHERE id = $2`,
      [amount, accountId],
    );

    await pool.query(
      `INSERT INTO agent_account_withdrawals (account_id, amount, remark, created_by_role, created_by_id, created_at, linked_ref, linked_label)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, CURRENT_TIMESTAMP), $7, $8)`,
      [accountId, amount, remark || null, role, userId, date ? date + " 12:00:00" : null, linkedRef || null, linkedLabel || null],
    );

    res.json({ success: true });
  } catch (error) {
    console.log("Agent account withdraw error:", error);
    res.status(500).json({ message: "Could not record withdrawal" });
  }
});

// Scope check helper: does this agent account belong to the requester?
async function findScopedAgentAccount(role, userId, accountId) {
  let scope = "1=0";
  const values = [accountId];
  if (role === "admin") {
    scope = "oa.created_by_admin_id = $2";
    values.push(userId);
  } else if (role === "agent") {
    scope = "oa.agent_id = $2";
    values.push(userId);
  } else {
    return null;
  }
  const found = await pool.query(
    `SELECT oa.id FROM agent_accounts oa
     LEFT JOIN agents o ON oa.agent_id = o.id
     WHERE oa.id = $1 AND ${scope}`,
    values,
  );
  return found.rows.length ? found.rows[0] : null;
}

// Withdrawal history (with remarks) for a single collection bank account.
app.get("/api/tracking/agent-account/:id/withdrawals", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const accountId = Number(req.params.id);
    if (!accountId) return res.status(400).json({ message: "Invalid account" });

    const account = await findScopedAgentAccount(
      auth.role,
      Number(auth.userId),
      accountId,
    );
    if (!account)
      return res.status(404).json({ message: "Account not found or not allowed" });

    const rows = await pool.query(
      `SELECT id, account_id, amount, remark, created_by_role, created_at, linked_ref, linked_label,
              to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date
       FROM agent_account_withdrawals
       WHERE account_id = $1
       ORDER BY id DESC`,
      [accountId],
    );
    res.json(rows.rows);
  } catch (error) {
    console.log("Agent account withdrawals fetch error:", error);
    res.status(500).json({ message: "Could not fetch withdrawals" });
  }
});

// Find a single withdrawal that belongs to the requester (via its account's scope).
async function findScopedWithdrawal(role, userId, wid) {
  let scope = "1=0";
  const values = [wid];
  if (role === "admin") { scope = "oa.created_by_admin_id = $2"; values.push(userId); }
  else if (role === "agent") { scope = "oa.agent_id = $2"; values.push(userId); }
  else return null;
  const r = await pool.query(
    `SELECT ow.id, ow.account_id, ow.amount
       FROM agent_account_withdrawals ow
       JOIN agent_accounts oa ON oa.id = ow.account_id
       LEFT JOIN agents o ON o.id = oa.agent_id
      WHERE ow.id = $1 AND ${scope}`,
    values,
  );
  return r.rows.length ? r.rows[0] : null;
}

// Remove a withdrawal's ledger entry + local marker so the SS ledger reflects a
// delete/edit. On edit the running sync then re-posts it with the new values.
async function clearWithdrawalLedger(wid) {
  const ref = `trkwd-${wid}`;
  if (ssEnabled()) {
    try { await ssRequest("DELETE", `/entries/${encodeURIComponent(ref)}`); }
    catch (e) { console.log("[LEDGER] clear withdrawal entry failed:", e.message); }
  }
  await pool.query(`DELETE FROM ledger_sync WHERE external_ref = $1`, [ref]);
}

// Edit a logged withdrawal (bank / amount / remark / date). Adjusts the bank
// total(s) and re-syncs the ledger entry. The withdrawal can be moved to a
// different collection bank (the "from") by passing account_id.
app.put("/api/tracking/withdrawal/:wid", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const wid = Number(req.params.wid);
    const amount = Number(req.body.amount);
    const remark = String(req.body.remark || "").trim();
    const date = String(req.body.date || "").trim();
    const linkedRef = String(req.body.linked_ref || "").trim();
    const linkedLabel = String(req.body.linked_label || "").trim();
    if (!wid) return res.status(400).json({ message: "Invalid withdrawal" });
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "Valid amount required" });
    const w = await findScopedWithdrawal(role, userId, wid);
    if (!w) return res.status(404).json({ message: "Withdrawal not found or not allowed" });
    // Optional move to a different bank. Default: keep the current account.
    const newAccountId = req.body.account_id ? Number(req.body.account_id) : w.account_id;
    if (newAccountId !== w.account_id) {
      const target = await findScopedAgentAccount(role, userId, newAccountId);
      if (!target) return res.status(404).json({ message: "Bank not found or not allowed" });
    }
    if (newAccountId === w.account_id) {
      const delta = amount - Number(w.amount);
      await pool.query(
        `UPDATE agent_accounts SET withdrawn_total = COALESCE(withdrawn_total,0) + $1 WHERE id = $2`,
        [delta, w.account_id],
      );
    } else {
      // Reverse the old amount off the old bank, apply the new amount on the new bank.
      await pool.query(
        `UPDATE agent_accounts SET withdrawn_total = COALESCE(withdrawn_total,0) - $1 WHERE id = $2`,
        [Number(w.amount), w.account_id],
      );
      await pool.query(
        `UPDATE agent_accounts SET withdrawn_total = COALESCE(withdrawn_total,0) + $1 WHERE id = $2`,
        [amount, newAccountId],
      );
    }
    await pool.query(
      `UPDATE agent_account_withdrawals
          SET account_id = $1, amount = $2, remark = $3,
              created_at = COALESCE($4::timestamp, created_at),
              linked_ref = $5, linked_label = $6
        WHERE id = $7`,
      [newAccountId, amount, remark || null, date ? date + " 12:00:00" : null, linkedRef || null, linkedLabel || null, wid],
    );
    await clearWithdrawalLedger(wid); // running sync re-posts with the new values
    res.json({ success: true });
  } catch (error) {
    console.log("Agent account withdrawal edit error:", error);
    res.status(500).json({ message: "Could not edit withdrawal" });
  }
});

// Delete a logged withdrawal. Reverses the bank total and removes the ledger entry.
app.delete("/api/tracking/withdrawal/:wid", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const wid = Number(req.params.wid);
    if (!wid) return res.status(400).json({ message: "Invalid withdrawal" });
    const w = await findScopedWithdrawal(auth.role, Number(auth.userId), wid);
    if (!w) return res.status(404).json({ message: "Withdrawal not found or not allowed" });
    await pool.query(
      `UPDATE agent_accounts SET withdrawn_total = COALESCE(withdrawn_total,0) - $1 WHERE id = $2`,
      [Number(w.amount), w.account_id],
    );
    await clearWithdrawalLedger(wid);
    await pool.query(`DELETE FROM agent_account_withdrawals WHERE id = $1`, [wid]);
    res.json({ success: true });
  } catch (error) {
    console.log("Agent account withdrawal delete error:", error);
    res.status(500).json({ message: "Could not delete withdrawal" });
  }
});

// Record a transfer between two of your OWN collection banks (Bank A → Bank B).
// The ledger reduces A and increases B, so a pass-through bank never goes negative.
app.post("/api/tracking/bank-transfer", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const fromId = Number(req.body.from_account_id);
    const toId = Number(req.body.to_account_id);
    // Either side can be a bank (account id) OR a typed/selected party name.
    const fromParty = String(req.body.from_party || "").trim();
    const toParty = String(req.body.to_party || "").trim();
    const amount = Number(req.body.amount);
    const remark = String(req.body.remark || "").trim();
    // Optional back-date (YYYY-MM-DD, IST). Stored at noon so the IST day is preserved.
    const date = String(req.body.date || "").trim();
    // Optional link to a previous tracking entry (reference only).
    const linkedRef = String(req.body.linked_ref || "").trim();
    const linkedLabel = String(req.body.linked_label || "").trim();

    if (!fromId && !fromParty) return res.status(400).json({ message: "Pick a From bank or party" });
    if (!toId && !toParty) return res.status(400).json({ message: "Pick a To bank or party" });
    if (fromId && toId && fromId === toId) return res.status(400).json({ message: "From and To bank must differ" });
    if (!amount || amount <= 0) return res.status(400).json({ message: "Valid amount required" });

    // Validate any bank side; a party side is taken as-is.
    if (!fromParty) {
      const from = await findScopedAgentAccount(role, userId, fromId);
      if (!from) return res.status(404).json({ message: "From bank not found or not allowed" });
    }
    if (!toParty) {
      const to = await findScopedAgentAccount(role, userId, toId);
      if (!to) return res.status(404).json({ message: "To bank not found or not allowed" });
    }

    await pool.query(
      `INSERT INTO bank_transfers (from_account_id, from_party_name, to_account_id, to_party_name, amount, remark, created_by_role, created_by_id, created_at, linked_ref, linked_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamp, CURRENT_TIMESTAMP), $10, $11)`,
      [fromParty ? null : fromId, fromParty || null, toParty ? null : toId, toParty || null, amount, remark || null, role, userId, date ? date + " 12:00:00" : null, linkedRef || null, linkedLabel || null],
    );
    res.json({ success: true });
  } catch (error) {
    console.log("Bank transfer error:", error);
    res.status(500).json({ message: "Could not record transfer" });
  }
});

// List the SS Accounting user-parties (merchants/agents/agents — names like
// "skyriss (@skyriss)") so the transfer form can offer them as "To party" options.
app.get("/api/tracking/ss-parties", async (req, res) => {
  try {
    if (!ssEnabled()) return res.json([]);
    const r = await ssRequest("GET", "/parties");
    const list = r.ok && Array.isArray(r.data) ? r.data : [];
    const parties = list
      .map((p) => p.partyname)
      .filter((n) => n && n.includes("(@"))
      .sort((a, b) => a.localeCompare(b));
    res.json(parties);
  } catch (e) {
    res.json([]);
  }
});

// Recent tracking entries (withdrawals + transfers) the requester owns, so the
// create/edit forms can optionally link a new entry to a previous one (A -> B -> C).
// Returns a unified list of { ref, label, amount, date } newest-first.
app.get("/api/tracking/recent-entries", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    let wScope = "1=0";
    let tScope = "1=0";
    if (role === "admin") {
      wScope = "oa.created_by_admin_id = $1";
      tScope = "(fa.created_by_admin_id = $1 OR ta.created_by_admin_id = $1)";
    } else if (role === "agent") {
      wScope = "oa.agent_id = $1";
      tScope = "(fa.agent_id = $1 OR ta.agent_id = $1)";
    } else {
      return res.status(403).json({ message: "Not allowed" });
    }

    const [w, t] = await Promise.all([
      pool.query(
        `SELECT 'trkwd-' || ow.id AS ref, ow.amount, ow.created_at,
                to_char(ow.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
                oa.bank_name, oa.account_number
           FROM agent_account_withdrawals ow
           JOIN agent_accounts oa ON oa.id = ow.account_id
          WHERE ${wScope}
          ORDER BY ow.id DESC LIMIT 50`,
        [userId],
      ),
      pool.query(
        `SELECT 'xfer-' || bt.id AS ref, bt.amount, bt.created_at,
                to_char(bt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
                COALESCE(fa.bank_name, bt.from_party_name) AS from_bank,
                COALESCE(ta.bank_name, bt.to_party_name) AS to_bank
           FROM bank_transfers bt
           LEFT JOIN agent_accounts fa ON fa.id = bt.from_account_id
           LEFT JOIN agent_accounts ta ON ta.id = bt.to_account_id
          WHERE ${tScope}
          ORDER BY bt.id DESC LIMIT 50`,
        [userId],
      ),
    ]);

    const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
    const entries = [
      ...w.rows.map((r) => ({
        ref: r.ref,
        amount: Number(r.amount),
        date: r.date,
        created_at: r.created_at,
        label: `Withdraw ${fmt(r.amount)} · ${r.bank_name || "Bank"} · ${r.date}`,
      })),
      ...t.rows.map((r) => ({
        ref: r.ref,
        amount: Number(r.amount),
        date: r.date,
        created_at: r.created_at,
        label: `Transfer ${fmt(r.amount)} · ${r.from_bank || "?"} → ${r.to_bank || "?"} · ${r.date}`,
      })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 50);

    res.json(entries);
  } catch (error) {
    console.log("Recent tracking entries fetch error:", error);
    res.status(500).json({ message: "Could not fetch recent entries" });
  }
});

// Transfer history (both directions) for a collection bank account.
app.get("/api/tracking/agent-account/:id/transfers", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const accountId = Number(req.params.id);
    if (!accountId) return res.status(400).json({ message: "Invalid account" });
    const account = await findScopedAgentAccount(auth.role, Number(auth.userId), accountId);
    if (!account)
      return res.status(404).json({ message: "Account not found or not allowed" });

    const rows = await pool.query(
      `SELECT bt.id, bt.amount, bt.remark, bt.created_at,
              to_char(bt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
              bt.from_account_id, bt.to_account_id, bt.from_party_name, bt.to_party_name,
              bt.linked_ref, bt.linked_label,
              CASE WHEN bt.from_account_id = $1 THEN 'out' ELSE 'in' END AS direction,
              COALESCE(fa.bank_name, bt.from_party_name) AS from_bank, fa.account_number AS from_acct,
              COALESCE(ta.bank_name, bt.to_party_name) AS to_bank, ta.account_number AS to_acct
         FROM bank_transfers bt
         LEFT JOIN agent_accounts fa ON fa.id = bt.from_account_id
         LEFT JOIN agent_accounts ta ON ta.id = bt.to_account_id
        WHERE bt.from_account_id = $1 OR bt.to_account_id = $1
        ORDER BY bt.id DESC`,
      [accountId],
    );
    res.json(rows.rows);
  } catch (error) {
    console.log("Bank transfers fetch error:", error);
    res.status(500).json({ message: "Could not fetch transfers" });
  }
});

// Find a bank transfer that belongs to the requester (either side must be theirs).
async function findScopedTransfer(role, userId, tid) {
  let scope = "1=0";
  const values = [tid];
  if (role === "admin") { scope = "(fa.created_by_admin_id = $2 OR ta.created_by_admin_id = $2)"; values.push(userId); }
  else if (role === "agent") { scope = "(fa.agent_id = $2 OR ta.agent_id = $2)"; values.push(userId); }
  else return null;
  const r = await pool.query(
    `SELECT bt.id, bt.amount FROM bank_transfers bt
       LEFT JOIN agent_accounts fa ON fa.id = bt.from_account_id
       LEFT JOIN agent_accounts ta ON ta.id = bt.to_account_id
      WHERE bt.id = $1 AND ${scope}`,
    values,
  );
  return r.rows.length ? r.rows[0] : null;
}

// Remove a transfer's ledger entry + marker so the SS ledger reflects a delete/edit.
async function clearTransferLedger(tid) {
  const ref = `xfer-${tid}`;
  if (ssEnabled()) {
    try { await ssRequest("DELETE", `/entries/${encodeURIComponent(ref)}`); }
    catch (e) { console.log("[LEDGER] clear transfer entry failed:", e.message); }
  }
  await pool.query(`DELETE FROM ledger_sync WHERE external_ref = $1`, [ref]);
}

// Edit an internal bank transfer (from / to / amount / remark / date). Either
// side can be a bank (account id) OR a typed/selected party. Re-syncs the ledger.
app.put("/api/tracking/bank-transfer/:tid", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);
    const tid = Number(req.params.tid);
    const fromId = Number(req.body.from_account_id);
    const toId = Number(req.body.to_account_id);
    const fromParty = String(req.body.from_party || "").trim();
    const toParty = String(req.body.to_party || "").trim();
    const amount = Number(req.body.amount);
    const remark = String(req.body.remark || "").trim();
    const date = String(req.body.date || "").trim();
    const linkedRef = String(req.body.linked_ref || "").trim();
    const linkedLabel = String(req.body.linked_label || "").trim();
    if (!tid) return res.status(400).json({ message: "Invalid transfer" });
    if (!fromId && !fromParty) return res.status(400).json({ message: "Pick a From bank or party" });
    if (!toId && !toParty) return res.status(400).json({ message: "Pick a To bank or party" });
    if (fromId && toId && fromId === toId) return res.status(400).json({ message: "From and To bank must differ" });
    if (!amount || amount <= 0) return res.status(400).json({ message: "Valid amount required" });
    const t = await findScopedTransfer(role, userId, tid);
    if (!t) return res.status(404).json({ message: "Transfer not found or not allowed" });
    // Validate any bank side belongs to the requester; a party side is taken as-is.
    if (!fromParty) {
      const from = await findScopedAgentAccount(role, userId, fromId);
      if (!from) return res.status(404).json({ message: "From bank not found or not allowed" });
    }
    if (!toParty) {
      const to = await findScopedAgentAccount(role, userId, toId);
      if (!to) return res.status(404).json({ message: "To bank not found or not allowed" });
    }
    await pool.query(
      `UPDATE bank_transfers
          SET from_account_id=$1, from_party_name=$2, to_account_id=$3, to_party_name=$4,
              amount=$5, remark=$6, created_at=COALESCE($7::timestamp, created_at),
              linked_ref=$8, linked_label=$9
        WHERE id=$10`,
      [
        fromParty ? null : fromId, fromParty || null,
        toParty ? null : toId, toParty || null,
        amount, remark || null, date ? date + " 12:00:00" : null,
        linkedRef || null, linkedLabel || null, tid,
      ],
    );
    await clearTransferLedger(tid); // running sync re-posts with the new values
    res.json({ success: true });
  } catch (error) {
    console.log("Bank transfer edit error:", error);
    res.status(500).json({ message: "Could not edit transfer" });
  }
});

// Delete an internal bank transfer. Removes the ledger entry (both banks adjust back).
app.delete("/api/tracking/bank-transfer/:tid", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const tid = Number(req.params.tid);
    if (!tid) return res.status(400).json({ message: "Invalid transfer" });
    const t = await findScopedTransfer(auth.role, Number(auth.userId), tid);
    if (!t) return res.status(404).json({ message: "Transfer not found or not allowed" });
    await clearTransferLedger(tid);
    await pool.query(`DELETE FROM bank_transfers WHERE id = $1`, [tid]);
    res.json({ success: true });
  } catch (error) {
    console.log("Bank transfer delete error:", error);
    res.status(500).json({ message: "Could not delete transfer" });
  }
});

// Toggle a collection bank account ON/OFF (is_active) — controls payin routing.
app.patch("/api/tracking/agent-account/:id/active", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const accountId = Number(req.params.id);
    const isActive = Boolean(req.body.is_active);
    if (!accountId) return res.status(400).json({ message: "Invalid account" });

    const account = await findScopedAgentAccount(
      auth.role,
      Number(auth.userId),
      accountId,
    );
    if (!account)
      return res.status(404).json({ message: "Account not found or not allowed" });

    await pool.query(
      `UPDATE agent_accounts SET is_active = $1 WHERE id = $2`,
      [isActive, accountId],
    );
    res.json({ success: true, is_active: isActive });
  } catch (error) {
    console.log("Agent account status toggle error:", error);
    res.status(500).json({ message: "Could not update status" });
  }
});

// ─── TICKETS ──────────────────────────────────────────────────────────────────
app.post("/api/tickets", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant" || !auth.merchantId)
      return res
        .status(403)
        .json({ message: "Only merchants can create tickets" });

    const { subject, issue } = req.body;
    if (!subject || !issue)
      return res
        .status(400)
        .json({ message: "Subject and issue are required" });

    const result = await pool.query(
      `INSERT INTO tickets (merchant_id, subject, issue, client_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [auth.merchantId, subject, issue, auth.clientId || null],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ message: "Could not create ticket" });
  }
});

app.get("/api/tickets", async (req, res) => {
  try {
    const auth = getAuthUser(req);

    if (auth.role === "admin") {
      const clientId_tk = getClientId(auth);
      let ticketQuery = `SELECT t.*, m.name AS merchant_name, m.username AS merchant_username
         FROM tickets t LEFT JOIN merchants m ON m.id = t.merchant_id`;
      const ticketValues = [];
      if (clientId_tk) {
        ticketQuery += ` WHERE t.client_id = $1`;
        ticketValues.push(clientId_tk);
      }
      ticketQuery += ` ORDER BY t.created_at DESC`;
      const result = await pool.query(ticketQuery, ticketValues);
      return res.json(result.rows);
    }

    if (auth.role === "merchant" && auth.merchantId) {
      const result = await pool.query(
        `SELECT t.*, m.name AS merchant_name, m.username AS merchant_username
         FROM tickets t LEFT JOIN merchants m ON m.id = t.merchant_id
         WHERE t.merchant_id = $1 ORDER BY t.created_at DESC`,
        [auth.merchantId],
      );
      return res.json(result.rows);
    }

    return res.status(403).json({ message: "Not allowed" });
  } catch (error) {
    console.error("Fetch tickets error:", error);
    res.status(500).json({ message: "Could not fetch tickets" });
  }
});

app.put("/api/tickets/:id/status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "admin")
      return res
        .status(403)
        .json({ message: "Only admin can update ticket status" });

    const { status, admin_note } = req.body;
    if (!["Open", "In Process", "Resolved"].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const result = await pool.query(
      `UPDATE tickets SET status = $1, admin_note = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [status, admin_note || "", req.params.id],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update ticket status error:", error);
    res.status(500).json({ message: "Could not update ticket" });
  }
});

// ─── STARTUP ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// ─── DAILY REPORT ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Build parametrized WHERE clauses for the daily report, honoring role scoping
// and (for admin only) an optional specific-entity filter.
function buildDailyReportFilters(auth, startDate, endDate, entityType, entityId) {
  const role = auth.role;
  const userId = Number(auth.userId);

  const payin = { clauses: [], values: [startDate, endDate] };
  const withdrawal = { clauses: [], values: [startDate, endDate] };
  const settlement = { clauses: [], values: [startDate, endDate] };
  const pAdd = (col, val) => {
    payin.values.push(val);
    payin.clauses.push(`${col} = $${payin.values.length}`);
  };
  const wAdd = (col, val) => {
    withdrawal.values.push(val);
    withdrawal.clauses.push(`${col} = $${withdrawal.values.length}`);
  };
  const sAdd = (col, val) => {
    settlement.values.push(val);
    settlement.clauses.push(`${col} = $${settlement.values.length}`);
  };
  const wAgentAssignment = (agentId) => {
    withdrawal.values.push(agentId);
    withdrawal.clauses.push(
      `merchant_id IN (SELECT merchant_id FROM withdrawal_merchant_agent_assignments WHERE agent_id = $${withdrawal.values.length})`,
    );
  };

  if (role === "merchant") {
    pAdd("merchant_id", userId);
    wAdd("merchant_id", userId);
    sAdd("merchant_id", userId);
  } else if (role === "agent") {
    pAdd("agent_id", userId);
    wAgentAssignment(userId);
    sAdd("agent_id", userId);
  } else if (role === "admin") {
    pAdd("created_by_admin_id", userId);
    sAdd("created_by_admin_id", userId);
    // withdrawals: admin sees all by default (no base clause)
    const eid = Number(entityId);
    if (entityType && eid) {
      if (entityType === "merchant") {
        pAdd("merchant_id", eid);
        wAdd("merchant_id", eid);
        sAdd("merchant_id", eid);
      } else if (entityType === "agent") {
        pAdd("agent_id", eid);
        wAdd("agent_id", eid);
        sAdd("agent_id", eid);
      } else if (entityType === "agent") {
        pAdd("agent_id", eid);
        wAgentAssignment(eid);
        sAdd("agent_id", eid);
      }
    }
  }

  return {
    payinWhere: payin.clauses.length ? "AND " + payin.clauses.join(" AND ") : "",
    payinValues: payin.values,
    withdrawalWhere: withdrawal.clauses.length
      ? "AND " + withdrawal.clauses.join(" AND ")
      : "",
    withdrawalValues: withdrawal.values,
    settlementWhere: settlement.clauses.length
      ? "AND " + settlement.clauses.join(" AND ")
      : "",
    settlementValues: settlement.values,
  };
}

// Fetch payin + withdrawal rows for the range/scope and build the per-day summary.
async function getDailyReportData(auth, startDate, endDate, entityType, entityId) {
  const {
    payinWhere,
    payinValues,
    withdrawalWhere,
    withdrawalValues,
    settlementWhere,
    settlementValues,
  } = buildDailyReportFilters(auth, startDate, endDate, entityType, entityId);

  const [payins, withdrawals, settlements, merchantRates, payoutRates] =
    await Promise.all([
      pool.query(
        // Bucket/filter by IST calendar date so totals match the Admin Dashboard
        // (which uses Asia/Kolkata). ist_date is a helper column, stripped before return.
        `SELECT transaction_id, merchant_order_id, amount, utr_number, status, bank_name, account_number,
              created_at, approved_or_reject_date, merchant_id,
              to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM-DD') AS ist_date
       FROM transactions
       WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       ${payinWhere}
       ORDER BY created_at DESC`,
        payinValues,
      ),
      pool.query(
        `SELECT transaction_id, amount, transaction_type, upi_id, account_name, account_number, ifsc_code,
              utr_number, status, notes, created_at, cleared_or_rejected_date, merchant_id,
              to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM-DD') AS ist_date
       FROM withdrawal_transactions
       WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       ${withdrawalWhere}
       ORDER BY created_at DESC`,
        withdrawalValues,
      ),
      pool.query(
        `SELECT amount, transaction_status, created_at,
              to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM-DD') AS ist_date
       FROM settlement_transactions
       WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       AND transaction_status = 'Approved'
       ${settlementWhere}`,
        settlementValues,
      ),
      pool.query(`SELECT id, commission_percent FROM merchants`),
      pool.query(
        `SELECT merchant_id, commission_percent FROM withdrawal_merchant_configs`,
      ),
    ]);

  // Merchant commission rates: payin from merchants, payout from withdrawal config.
  const payinRateMap = new Map(
    merchantRates.rows.map((r) => [r.id, Number(r.commission_percent || 0)]),
  );
  const payoutRateMap = new Map(
    payoutRates.rows.map((r) => [
      r.merchant_id,
      Number(r.commission_percent || 0),
    ]),
  );
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Your net earning on payouts after the provider (Gopay) cost:
  // 2.5% charged to the merchant − 1.2% paid to Gopay = 1.3% kept. Flat rate on payout volume.
  const PAYOUT_NET_RATE = 1.3;

  // Daily Summary: settled payin/payout totals, merchant commission on each, and balance.
  const dayMap = new Map();
  const ensureDay = (d) => {
    if (!dayMap.has(d)) {
      dayMap.set(d, {
        Date: d,
        "Total Payin": 0,
        "Total Payin Commission": 0,
        "Total Payout": 0,
        "Total Payout Commission": 0,
        "Net Profit": 0,
        "Settlement Amount": 0,
        "Remaining Balance": 0,
      });
    }
    return dayMap.get(d);
  };

  for (const t of payins.rows) {
    if (t.status !== "Approved") continue;
    const d = t.ist_date;
    const row = ensureDay(d);
    const amt = Number(t.amount || 0);
    const rate = payinRateMap.get(t.merchant_id) || 0;
    row["Total Payin"] += amt;
    row["Total Payin Commission"] += (amt * rate) / 100;
  }

  for (const w of withdrawals.rows) {
    if (w.status !== "cleared") continue;
    const d = w.ist_date;
    const row = ensureDay(d);
    const amt = Number(w.amount || 0);
    const rate = payoutRateMap.get(w.merchant_id) || 0;
    row["Total Payout"] += amt;
    row["Total Payout Commission"] += (amt * rate) / 100;
  }

  for (const s of settlements.rows) {
    const d = s.ist_date;
    const row = ensureDay(d);
    row["Settlement Amount"] += Number(s.amount || 0);
  }

  for (const row of dayMap.values()) {
    row["Remaining Balance"] =
      row["Total Payin"] -
      row["Total Payin Commission"] -
      row["Total Payout"] -
      row["Total Payout Commission"] -
      row["Settlement Amount"];
    // Net Profit = payin commission + payout net (payout volume × 1.3%).
    row["Net Profit"] =
      row["Total Payin Commission"] +
      (row["Total Payout"] * PAYOUT_NET_RATE) / 100;
    row["Total Payin"] = round2(row["Total Payin"]);
    row["Total Payin Commission"] = round2(row["Total Payin Commission"]);
    row["Total Payout"] = round2(row["Total Payout"]);
    row["Total Payout Commission"] = round2(row["Total Payout Commission"]);
    row["Net Profit"] = round2(row["Net Profit"]);
    row["Settlement Amount"] = round2(row["Settlement Amount"]);
    row["Remaining Balance"] = round2(row["Remaining Balance"]);
  }

  const summaryRows = Array.from(dayMap.values()).sort((a, b) =>
    a.Date < b.Date ? 1 : -1,
  );

  // Period total across the selected range (this is the MTD figure when the range
  // is the current month). Prepended as a "TOTAL" row so it shows in view/xlsx/PDF.
  if (summaryRows.length > 0) {
    const totalRow = {
      Date: "TOTAL",
      "Total Payin": 0,
      "Total Payin Commission": 0,
      "Total Payout": 0,
      "Total Payout Commission": 0,
      "Net Profit": 0,
      "Settlement Amount": 0,
      "Remaining Balance": 0,
    };
    for (const r of summaryRows) {
      totalRow["Total Payin"] += r["Total Payin"];
      totalRow["Total Payin Commission"] += r["Total Payin Commission"];
      totalRow["Total Payout"] += r["Total Payout"];
      totalRow["Total Payout Commission"] += r["Total Payout Commission"];
      totalRow["Net Profit"] += r["Net Profit"];
      totalRow["Settlement Amount"] += r["Settlement Amount"];
      totalRow["Remaining Balance"] += r["Remaining Balance"];
    }
    for (const k of Object.keys(totalRow)) {
      if (k !== "Date") totalRow[k] = round2(totalRow[k]);
    }
    summaryRows.unshift(totalRow);
  }

  // merchant_id + ist_date were fetched only for rate mapping / IST bucketing — keep them out of the tables.
  for (const r of payins.rows) { delete r.merchant_id; delete r.ist_date; }
  for (const r of withdrawals.rows) { delete r.merchant_id; delete r.ist_date; }

  return {
    summaryRows,
    payins: payins.rows,
    withdrawals: withdrawals.rows,
  };
}

// JSON endpoint powering the on-screen report view.
app.get("/api/daily-report/data", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!auth.role) return res.status(401).json({ message: "Unauthorized" });
    const startDate = req.query.start_date || "1970-01-01";
    const endDate = req.query.end_date || "2099-12-31";
    const entityType = auth.role === "admin" ? req.query.entity_type : null;
    const entityId = auth.role === "admin" ? req.query.entity_id : null;

    const data = await getDailyReportData(
      auth,
      startDate,
      endDate,
      entityType,
      entityId,
    );

    res.json({
      start_date: startDate,
      end_date: endDate,
      summary: data.summaryRows,
      payins: data.payins,
      withdrawals: data.withdrawals,
    });
  } catch (error) {
    console.log("Daily report data error:", error);
    res.status(500).json({ message: "Could not load report" });
  }
});

app.get("/api/daily-report/download", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const startDate = req.query.start_date || "1970-01-01";
    const endDate = req.query.end_date || "2099-12-31";
    const entityType = role === "admin" ? req.query.entity_type : null;
    const entityId = role === "admin" ? req.query.entity_id : null;

    if (!role) return res.status(401).json({ message: "Unauthorized" });

    // Optional column selection (frontend column picker). Comma-separated keys.
    const parseCols = (q) =>
      q ? String(q).split(",").map((c) => c.trim()).filter(Boolean) : null;
    const projectRows = (rows, cols) => {
      if (!cols || !cols.length) return rows;
      return rows.map((r) => {
        const o = {};
        for (const c of cols) if (c in r) o[c] = r[c];
        return o;
      });
    };
    const payinCols = parseCols(req.query.payin_cols);
    const wdCols = parseCols(req.query.wd_cols);

    const data = await getDailyReportData(
      auth,
      startDate,
      endDate,
      entityType,
      entityId,
    );
    const payins = { rows: projectRows(data.payins, payinCols) };
    const withdrawals = { rows: projectRows(data.withdrawals, wdCols) };

    const summaryRows = data.summaryRows;
    if (summaryRows.length === 0)
      summaryRows.push({
        Date: `${startDate} to ${endDate}`,
        Note: "No data in this range",
      });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "Daily Summary",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        payins.rows.length
          ? payins.rows
          : [{ Note: "No payin transactions in this range" }],
      ),
      "Payin Transactions",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        withdrawals.rows.length
          ? withdrawals.rows
          : [{ Note: "No withdrawal transactions in this range" }],
      ),
      "Withdrawal Transactions",
    );

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `daily-report-${role}-${startDate}-to-${endDate}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.log("Daily report error:", error);
    res.status(500).json({ message: "Could not generate report" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── WITHDRAWAL SUBSYSTEM ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

async function fireWithdrawalWebhook(txn) {
  if (!txn || !txn.webhook_url || !txn.webhook_url.trim()) return;
  const webhookUrl = txn.webhook_url.trim();
  const payload = {
    transactionId: txn.transaction_id,
    status: txn.status,
    amount: Number(txn.amount),
    utr_number: txn.utr_number || null,
  };

  console.log(`[WITHDRAWAL WEBHOOK] firing for txn ${txn.id} → ${webhookUrl}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await r.text();
    const logMsg = `status=${r.status} body=${body.substring(0, 500)}`;
    await pool
      .query(
        `UPDATE withdrawal_transactions SET webhook_sent = true, webhook_response = $1 WHERE id = $2`,
        [logMsg, txn.id],
      )
      .catch(() => {});
  } catch (err) {
    await pool
      .query(
        `UPDATE withdrawal_transactions SET webhook_sent = false, webhook_response = $1 WHERE id = $2`,
        [`error: ${err.message}`, txn.id],
      )
      .catch(() => {});
  }
}

// ─── Payout provider integration (a24h / FirstPay) ──────────────────────────
// TEMP-TEST-OVERRIDE: allows redirecting to a local mock during manual QA. Must
// be reverted before commit — see SSPAY_TEST_OVERRIDE marker.
const SSPAY_BASE_URL = process.env.SSPAY_TEST_OVERRIDE_URL || "https://wallet.sspay.online/api/v1";
// Dharti/Gopay tenant — same codebase & API as a24h, separate deployment + credentials.
const FIRSTPAY_BASE_URL = process.env.FIRSTPAY_BASE_URL || "https://real.firstpay.online/api/v1";
// Survey (Suivrepay) tenant — same codebase & API, separate deployment + credentials.
const SURVEY_BASE_URL = process.env.SURVEY_BASE_URL || "https://srv.firstpay.online/api/v1";

// Per-merchant selectable payout providers. Both speak the identical API
// (POST /public/payout, GET /public/payout/status/:id, GET /public/balance);
// only the base URL, the credential column and the webhook signature header differ.
const PAYOUT_PROVIDERS = {
  a24h: {
    label: "A24H",
    baseUrl: SSPAY_BASE_URL,
    keyField: "sspay_api_key",
    webhookPath: "sspay-webhook",
    sigHeaders: ["x-sspay-signature"],
  },
  firstpay: {
    label: "FirstPay (Gopay)",
    baseUrl: FIRSTPAY_BASE_URL,
    keyField: "firstpay_api_key",
    webhookPath: "firstpay-webhook",
    // Dharti sends X-FirstPay-Signature; accept the legacy header too just in case.
    sigHeaders: ["x-firstpay-signature", "x-sspay-signature"],
  },
  survey: {
    label: "Survey (Suivrepay)",
    baseUrl: SURVEY_BASE_URL,
    keyField: "survey_api_key",
    webhookPath: "survey-webhook",
    sigHeaders: ["x-firstpay-signature", "x-sspay-signature"],
  },
};

// Resolve a merchant config row → { name, def, apiKey }. Defaults to a24h so any
// row written before this feature keeps its existing live behaviour.
function resolvePayoutProvider(cfg) {
  const name = PAYOUT_PROVIDERS[cfg?.payout_provider] ? cfg.payout_provider : "a24h";
  const def = PAYOUT_PROVIDERS[name];
  return { name, def, apiKey: cfg?.[def.keyField] || null };
}

// IFSC prefix → human-readable bank name. SSPay routes by IFSC; this is the display label.
const IFSC_BANK_MAP = {
  HDFC: "HDFC Bank",
  ICIC: "ICICI Bank",
  SBIN: "State Bank of India",
  AXIS: "Axis Bank",
  UTIB: "Axis Bank",
  KKBK: "Kotak Mahindra Bank",
  YESB: "YES Bank",
  IDFB: "IDFC First Bank",
  IDIB: "Indian Bank",
  BARB: "Bank of Baroda",
  CNRB: "Canara Bank",
  PUNB: "Punjab National Bank",
  UBIN: "Union Bank of India",
  INDB: "IndusInd Bank",
  IBKL: "IDBI Bank",
  ESFB: "Equitas Small Finance Bank",
  AUBL: "AU Small Finance Bank",
  RATN: "RBL Bank",
  BKID: "Bank of India",
  CBIN: "Central Bank of India",
  CIUB: "City Union Bank",
  DCBL: "DCB Bank",
  DLXB: "Dhanlaxmi Bank",
  FDRL: "Federal Bank",
  IOBA: "Indian Overseas Bank",
  JAKA: "Jammu and Kashmir Bank",
  KARB: "Karnataka Bank",
  KVBL: "Karur Vysya Bank",
  MAHB: "Bank of Maharashtra",
  SCBL: "Standard Chartered Bank",
  SIBL: "South Indian Bank",
  TMBL: "Tamilnad Mercantile Bank",
  UCBA: "UCO Bank",
  PYTM: "Paytm Payments Bank",
  AIRP: "Airtel Payments Bank",
  FINO: "Fino Payments Bank",
  JIOP: "Jio Payments Bank",
  HSBC: "HSBC",
  CITI: "Citibank",
  DBSS: "DBS Bank",
  SURY: "Suryoday Small Finance Bank",
  UJVN: "Ujjivan Small Finance Bank",
  JSBP: "Jana Small Finance Bank",
  FINP: "Fincare Small Finance Bank",
};

function getBankNameFromIfsc(ifsc) {
  if (!ifsc) return "Bank";
  const prefix = String(ifsc).trim().toUpperCase().substring(0, 4);
  return IFSC_BANK_MAP[prefix] || `${prefix} Bank`;
}

async function getSspayPayoutStatus(apiKey, orderId, baseUrl = SSPAY_BASE_URL) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(`${baseUrl}/public/payout/status/${encodeURIComponent(orderId)}`, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const bodyText = await r.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: err.message } };
  }
}

// Fallback poller: catches the rare case where SSPay's webhook never arrives
// or fails signature verification. Runs every 90s, checks every pending
// withdrawal with an sspay_order_id, polls SSPay's status endpoint, and
// updates our row if SSPay reports a terminal state.
async function pollSspayPendingWithdrawals() {
  try {
    const pending = await pool.query(`
      SELECT w.id, w.sspay_order_id, w.amount, w.merchant_id,
             COALESCE(w.payout_provider, cfg.payout_provider, 'a24h') AS provider,
             cfg.sspay_api_key, cfg.firstpay_api_key, cfg.survey_api_key
      FROM withdrawal_transactions w
      JOIN withdrawal_merchant_configs cfg ON cfg.merchant_id = w.merchant_id
      WHERE w.status = 'pending'
        AND w.sspay_order_id IS NOT NULL
        AND w.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY w.id ASC
      LIMIT 50
    `);

    if (pending.rows.length === 0) return;
    console.log(`[SSPAY POLL] checking ${pending.rows.length} pending withdrawal(s)`);

    for (const row of pending.rows) {
      // Poll whichever provider actually handled this payout.
      const prov = resolvePayoutProvider({
        payout_provider: row.provider,
        sspay_api_key: row.sspay_api_key,
        firstpay_api_key: row.firstpay_api_key,
        survey_api_key: row.survey_api_key,
      });
      if (!prov.apiKey) continue;
      const res = await getSspayPayoutStatus(prov.apiKey, row.sspay_order_id, prov.def.baseUrl);
      if (!res.ok) {
        console.log(`[SSPAY POLL] status check failed for txn ${row.id} order=${row.sspay_order_id} provider=${prov.name} http=${res.status}`);
        continue;
      }
      const upstreamStatus = String(res.body?.status || "").toUpperCase();
      const upstreamUtr = res.body?.utr || null;

      if (upstreamStatus === "SUCCESS" && upstreamUtr) {
        const cleared = await pool.query(
          `UPDATE withdrawal_transactions
           SET status = 'cleared', utr_number = $1, sspay_status = 'SUCCESS',
               picked_at = COALESCE(picked_at, NOW()), cleared_or_rejected_date = NOW()
           WHERE id = $2 AND status = 'pending'
           RETURNING *`,
          [String(upstreamUtr), row.id]
        );
        if (cleared.rows.length > 0) fireWithdrawalWebhook(cleared.rows[0]);
        console.log(`[SSPAY POLL] txn ${row.id} → cleared (UTR ${upstreamUtr}) via fallback poll`);
      } else if (upstreamStatus === "REVERSED") {
        const reason = res.body?.failure_reason || res.body?.message || "Reversed by provider";
        const updated = await pool.query(
          `UPDATE withdrawal_transactions
           SET status = 'refunded', sspay_status = 'REVERSED', sspay_failure_reason = $1,
               cleared_or_rejected_date = NOW()
           WHERE id = $2 AND status = 'pending'
           RETURNING *`,
          [String(reason), row.id]
        );
        if (updated.rows.length > 0) fireWithdrawalWebhook(updated.rows[0]);
        console.log(`[SSPAY POLL] txn ${row.id} → refunded (REVERSED by provider)`);
      } else if (["FAILED", "EXPIRED"].includes(upstreamStatus)) {
        const reason = res.body?.failure_reason || upstreamStatus;
        const updated = await pool.query(
          `UPDATE withdrawal_transactions
           SET status = 'rejected', sspay_status = $1, sspay_failure_reason = $2,
               cleared_or_rejected_date = NOW()
           WHERE id = $3 AND status = 'pending'
           RETURNING *`,
          [upstreamStatus, String(reason), row.id]
        );
        if (updated.rows.length > 0) {
          fireWithdrawalWebhook(updated.rows[0]);
          console.log(`[SSPAY POLL] txn ${row.id} → rejected (${reason}) via fallback poll`);
        }
      } else {
        // Still PENDING/PROCESSING on their side — just record the status.
        await pool.query(
          `UPDATE withdrawal_transactions SET sspay_status = $1 WHERE id = $2 AND sspay_status IS DISTINCT FROM $1`,
          [upstreamStatus || null, row.id]
        );
      }
    }
  } catch (err) {
    console.log("[SSPAY POLL] error:", err.message);
  }
}

// ─── SS Accounting ledger sync ───────────────────────────────────────────────
// Pushes every RDpay user as a "party" and every money movement (approved payin,
// cleared withdrawal, tracking bank withdrawal) as an "entry" into the SS Accounting
// ledger. Runs on an interval and is fully idempotent (ledger_sync table + the API's
// own external_ref/party de-duplication), so the first runs also backfill all history
// and a failed push is simply retried next tick. Never blocks RDpay's own flow.
const LEDGER_PORTAL_PARTY = "MasterPay Portal";
const LEDGER_PAYIN_COMM_PARTY = "Payin Commission";
const LEDGER_PAYOUT_COMM_PARTY = "Payout Commission";
// Money taken out of the collection banks via the "bank withdraw" section (ATM, UPI
// payments, cash) — i.e. operating spend. Booked against the "Expense" party.
const LEDGER_CASHOUT_PARTY = "Expense";
// Merchant withdrawals (payouts) flow through the Survey/Suivre payout wallet, so book
// them against that party instead of the generic clearing portal.
const LEDGER_SURVEY_PARTY = "SUIVRE PAY (@SUIRVE PAY)";
const LEDGER_BATCH = 120; // rows per category per tick — drains the backfill over a few ticks

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// When SSACCT_ADMIN_ID is set, the ledger only mirrors that admin's users/transactions.
// Returns a SQL fragment like " AND t.created_by_admin_id = 5 " (id is coerced to an
// int, so it's safe to interpolate). Empty string = no scoping (all admins).
function ledgerAdminFilter(column) {
  const id = process.env.SSACCT_ADMIN_ID;
  return id ? ` AND ${column} = ${Number(id)} ` : "";
}
const ensuredParties = new Set(); // party names ensured this process lifetime

function partyName(name, username) {
  const n = String(name || "").trim() || "Unknown";
  const u = String(username || "").trim();
  return u ? `${n} (@${u})` : n;
}

// Owner short-tag from the account holder name: SK = Sagar Keshav, AD = Anurag Yadav.
function bankTag(holder) {
  const h = String(holder || "").toLowerCase();
  if (h.includes("sagar")) return "SK";
  if (h.includes("anurag")) return "AD";
  return "";
}

// A bank/collection-account party, e.g. "Equitas Small Finance Bank (200003188477) — AD".
// The SK/AD tag (from the holder) lets the ledger show whose account each bank is.
// Returns null if we don't have enough to identify the bank (caller falls back to Portal).
function bankPartyName(bankName, accountNumber, holder) {
  const b = String(bankName || "").trim();
  const a = String(accountNumber || "").trim();
  if (!b && !a) return null;
  const base = a ? `${b || "Bank"} (${a})` : b;
  const tag = bankTag(holder);
  return tag ? `${base} — ${tag}` : base;
}

async function ensurePartyCached(name) {
  if (!name || ensuredParties.has(name)) return true;
  const r = await ensureParty(name);
  if (r.ok) {
    ensuredParties.add(name);
    return true;
  }
  console.log(`[LEDGER] ensureParty failed for "${name}": ${r.error || r.status}`);
  return false;
}

async function markSynced(externalRef, kind) {
  await pool.query(
    `INSERT INTO ledger_sync (external_ref, kind) VALUES ($1, $2) ON CONFLICT (external_ref) DO NOTHING`,
    [externalRef, kind],
  );
}

// Create a party for every user (even those with no transactions yet).
async function syncLedgerParties() {
  const sources = [
    { kind: "merchant", table: "merchants" },
    { kind: "agent", table: "agents" },
    { kind: "agent", table: "agents" },
    { kind: "merchant", table: "merchants" },
  ];
  for (const src of sources) {
    const rows = await pool.query(
      `SELECT u.id, u.name, u.username
         FROM ${src.table} u
        WHERE NOT EXISTS (
          SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'party:${src.kind}:' || u.id
        )
        ${ledgerAdminFilter("u.created_by_admin_id")}
        ORDER BY u.id
        LIMIT ${LEDGER_BATCH}`,
    );
    for (const u of rows.rows) {
      const name = partyName(u.name, u.username);
      if (await ensurePartyCached(name)) {
        await markSynced(`party:${src.kind}:${u.id}`, `party:${src.kind}`);
      }
    }
  }
}

// Approved payins → the receiving bank's asset grows (bank DEBIT) and we owe the merchant
// their collection (merchant CREDIT). Standard accounting: Bank → Merchant.
async function syncLedgerPayins() {
  const rows = await pool.query(
    `SELECT t.id, t.amount, t.utr_number, t.bank_name, t.account_number, t.account_holder_name,
            to_char(COALESCE(t.approved_or_reject_date, t.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
            m.name AS m_name, m.username AS m_username
       FROM transactions t
       JOIN merchants m ON m.id = t.merchant_id
      WHERE t.status = 'Approved'
        AND t.amount > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'payin-' || t.id)
        ${ledgerAdminFilter("t.created_by_admin_id")}
      ORDER BY t.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    const party = partyName(r.m_name, r.m_username);
    const bank = bankPartyName(r.bank_name, r.account_number, r.account_holder_name) || LEDGER_PORTAL_PARTY;
    if (!(await ensurePartyCached(party))) continue;
    if (!(await ensurePartyCached(bank))) continue;
    const res = await postEntry({
      from_party: party, // merchant — DEBIT (collection brought in)
      to_party: bank, // bank — CREDIT (money in; matches the bank statement)
      amount: Number(r.amount),
      date: r.d,
      remark: `Payin${r.utr_number ? ` UTR ${r.utr_number}` : ""}`,
      external_ref: `payin-${r.id}`,
    });
    if (res.ok) await markSynced(`payin-${r.id}`, "payin");
  }
}

// Cleared withdrawals → the merchant's payout is funded from the Survey wallet: what we owe
// the merchant goes down (merchant DEBIT) and the Survey asset goes down (Survey CREDIT).
async function syncLedgerWithdrawals() {
  const rows = await pool.query(
    `SELECT w.id, w.amount, w.utr_number,
            to_char(COALESCE(w.cleared_or_rejected_date, w.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
            m.name AS m_name, m.username AS m_username
       FROM withdrawal_transactions w
       JOIN merchants m ON m.id = w.merchant_id
      WHERE w.status = 'cleared'
        AND w.amount > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'wd-' || w.id)
        ${ledgerAdminFilter("m.created_by_admin_id")}
      ORDER BY w.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    const party = partyName(r.m_name, r.m_username);
    if (!(await ensurePartyCached(party))) continue;
    if (!(await ensurePartyCached(LEDGER_SURVEY_PARTY))) continue;
    const res = await postEntry({
      from_party: LEDGER_SURVEY_PARTY, // Survey — DEBIT (money out; matches statement)
      to_party: party, // merchant — CREDIT
      amount: Number(r.amount),
      date: r.d,
      remark: `Withdrawal${r.utr_number ? ` UTR ${r.utr_number}` : ""}`,
      external_ref: `wd-${r.id}`,
    });
    if (res.ok) await markSynced(`wd-${r.id}`, "withdrawal");
  }
}

// Approved settlements → the platform pays the merchant their collected money, which
// pays down what we owe them → debit the merchant (Merchant → Portal).
async function syncLedgerSettlements() {
  const rows = await pool.query(
    `SELECT st.id, st.amount, st.utr_number,
            to_char(COALESCE(st.approved_or_reject_date, st.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
            m.name AS m_name, m.username AS m_username
       FROM settlement_transactions st
       JOIN merchants m ON m.id = st.merchant_id
      WHERE st.transaction_status = 'Approved'
        AND st.amount > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'settle-' || st.id)
        ${ledgerAdminFilter("m.created_by_admin_id")}
      ORDER BY st.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    const party = partyName(r.m_name, r.m_username);
    if (!(await ensurePartyCached(party))) continue;
    const res = await postEntry({
      from_party: party,
      to_party: LEDGER_PORTAL_PARTY,
      amount: Number(r.amount),
      date: r.d,
      remark: `Settlement${r.utr_number ? ` UTR ${r.utr_number}` : ""}`,
      external_ref: `settle-${r.id}`,
    });
    if (res.ok) await markSynced(`settle-${r.id}`, "settlement");
  }
}

// Per approved payin, the merchant's payin commission (amount × merchant %) →
// Merchant → "Payin Commission" account. Skips merchants on 0%.
async function syncLedgerPayinCommission() {
  const rows = await pool.query(
    `SELECT t.id, t.amount, m.name AS m_name, m.username AS m_username,
            COALESCE(m.commission_percent, 0) AS pct,
            to_char(COALESCE(t.approved_or_reject_date, t.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d
       FROM transactions t
       JOIN merchants m ON m.id = t.merchant_id
      WHERE t.status = 'Approved'
        AND t.amount > 0
        AND COALESCE(m.commission_percent, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'paycomm-' || t.id)
        ${ledgerAdminFilter("t.created_by_admin_id")}
      ORDER BY t.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    const commission = round2((Number(r.amount) * Number(r.pct)) / 100);
    if (commission <= 0) {
      await markSynced(`paycomm-${r.id}`, "payin-commission"); // nothing to post
      continue;
    }
    const party = partyName(r.m_name, r.m_username);
    if (!(await ensurePartyCached(party))) continue;
    if (!(await ensurePartyCached(LEDGER_PAYIN_COMM_PARTY))) continue;
    const res = await postEntry({
      from_party: LEDGER_PAYIN_COMM_PARTY, // commission account — DEBIT
      to_party: party, // merchant — CREDIT (their owed reduces by our fee)
      amount: commission,
      date: r.d,
      remark: `Payin commission ${r.pct}% on payin-${r.id}`,
      external_ref: `paycomm-${r.id}`,
    });
    if (res.ok) await markSynced(`paycomm-${r.id}`, "payin-commission");
  }
}

// Per cleared payout, the payout commission (amount × withdrawal-config %) →
// Merchant → "Payout Commission" account. Skips configs on 0%.
async function syncLedgerPayoutCommission() {
  const rows = await pool.query(
    `SELECT w.id, w.amount, m.name AS m_name, m.username AS m_username,
            COALESCE(wmc.commission_percent, 0) AS pct,
            to_char(COALESCE(w.cleared_or_rejected_date, w.created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d
       FROM withdrawal_transactions w
       JOIN merchants m ON m.id = w.merchant_id
       LEFT JOIN withdrawal_merchant_configs wmc ON wmc.merchant_id = w.merchant_id
      WHERE w.status = 'cleared'
        AND w.amount > 0
        AND COALESCE(wmc.commission_percent, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'wdcomm-' || w.id)
        ${ledgerAdminFilter("m.created_by_admin_id")}
      ORDER BY w.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    const commission = round2((Number(r.amount) * Number(r.pct)) / 100);
    if (commission <= 0) {
      await markSynced(`wdcomm-${r.id}`, "payout-commission");
      continue;
    }
    const party = partyName(r.m_name, r.m_username);
    if (!(await ensurePartyCached(party))) continue;
    if (!(await ensurePartyCached(LEDGER_PAYOUT_COMM_PARTY))) continue;
    const res = await postEntry({
      from_party: LEDGER_PAYOUT_COMM_PARTY, // commission account — DEBIT
      to_party: party, // merchant — CREDIT (their owed reduces by our fee)
      amount: commission,
      date: r.d,
      remark: `Payout commission ${r.pct}% on wd-${r.id}`,
      external_ref: `wdcomm-${r.id}`,
    });
    if (res.ok) await markSynced(`wdcomm-${r.id}`, "payout-commission");
  }
}

// Tracking bank withdrawals (agent pulls cash out of a collection account) →
// the cash holding grows (Cash Out DEBIT) and the bank's asset goes down (bank CREDIT).
async function syncLedgerTrackingWithdrawals() {
  const rows = await pool.query(
    `SELECT ow.id, ow.amount, ow.remark,
            to_char(ow.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
            oa.bank_name, oa.account_number, oa.account_holder_name, o.name AS op_name, o.username AS op_username
       FROM agent_account_withdrawals ow
       JOIN agent_accounts oa ON oa.id = ow.account_id
       LEFT JOIN agents o ON o.id = oa.agent_id
      WHERE ow.amount > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'trkwd-' || ow.id)
        ${ledgerAdminFilter("o.created_by_admin_id")}
      ORDER BY ow.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    const bank = bankPartyName(r.bank_name, r.account_number, r.account_holder_name) || LEDGER_PORTAL_PARTY;
    if (!(await ensurePartyCached(bank))) continue;
    if (!(await ensurePartyCached(LEDGER_CASHOUT_PARTY))) continue;
    const res = await postEntry({
      from_party: bank, // bank — DEBIT (money out; matches the bank statement)
      to_party: LEDGER_CASHOUT_PARTY, // held as cash — CREDIT
      amount: Number(r.amount),
      date: r.d,
      remark: `Bank withdrawal${r.remark ? ` · ${r.remark}` : ""}`,
      external_ref: `trkwd-${r.id}`,
    });
    if (res.ok) await markSynced(`trkwd-${r.id}`, "tracking-withdrawal");
  }
}

// Internal bank-to-bank transfers (passbook style, matching the SS app's per-account
// closing = Credit − Debit): the SOURCE bank is DEBITED (money out) and the DESTINATION
// is CREDITED (money in). In the SS model from_party is debited, so source=from_party,
// dest=to_party.
async function syncLedgerBankTransfers() {
  const rows = await pool.query(
    `SELECT bt.id, bt.amount, bt.remark, bt.to_party_name AS tp, bt.from_party_name AS fp,
            to_char(bt.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
            fa.bank_name AS fb, fa.account_number AS fn, fa.account_holder_name AS fh,
            ta.bank_name AS tb, ta.account_number AS tn, ta.account_holder_name AS th
       FROM bank_transfers bt
       LEFT JOIN agent_accounts fa ON fa.id = bt.from_account_id
       LEFT JOIN agent_accounts ta ON ta.id = bt.to_account_id
      WHERE bt.amount > 0
        AND NOT EXISTS (SELECT 1 FROM ledger_sync ls WHERE ls.external_ref = 'xfer-' || bt.id)
        ${ledgerAdminFilter("COALESCE(fa.created_by_admin_id, ta.created_by_admin_id)")}
      ORDER BY bt.id
      LIMIT ${LEDGER_BATCH}`,
  );
  for (const r of rows.rows) {
    // Either side is a typed/selected party or a bank.
    const fromBank = r.fp ? r.fp.trim() : bankPartyName(r.fb, r.fn, r.fh);
    const fromLabel = r.fp ? r.fp.trim() : r.fb;
    const toBank = r.tp ? r.tp.trim() : bankPartyName(r.tb, r.tn, r.th);
    const toLabel = r.tp ? r.tp.trim() : r.tb;
    if (!fromBank || !toBank) continue;
    if (!(await ensurePartyCached(fromBank))) continue;
    if (!(await ensurePartyCached(toBank))) continue;
    const res = await postEntry({
      from_party: fromBank, // source — DEBITED (money out; matches statement)
      to_party: toBank, // destination — CREDITED (money in)
      amount: Number(r.amount),
      date: r.d,
      remark: `Transfer ${fromLabel} → ${toLabel}${r.remark ? ` · ${r.remark}` : ""}`,
      external_ref: `xfer-${r.id}`,
    });
    if (res.ok) await markSynced(`xfer-${r.id}`, "bank-transfer");
  }
}

let ledgerSyncRunning = false;
// On masterpay, RDpay auto-posts payins, payin commission, payouts (merchant
// withdrawals) and payout commission — plus the user parties they reference.
// Settlements and the balance-tracking withdrawals/transfers are NOT auto-posted;
// those are added manually in the MasterPay portal. Set LEDGER_FULL_SYNC=true to
// also auto-post settlements and balance-tracking entries.
const ledgerFullSync = () =>
  String(process.env.LEDGER_FULL_SYNC || "").toLowerCase() === "true";

async function syncLedger() {
  if (!ssEnabled() || ledgerSyncRunning) return;
  ledgerSyncRunning = true;
  try {
    await ensurePartyCached(LEDGER_PORTAL_PARTY);
    await syncLedgerParties();
    await syncLedgerPayins();
    await syncLedgerPayinCommission();
    await syncLedgerWithdrawals(); // merchant payouts
    await syncLedgerPayoutCommission();
    if (ledgerFullSync()) {
      await syncLedgerSettlements();
      await syncLedgerTrackingWithdrawals();
      await syncLedgerBankTransfers();
    }
  } catch (err) {
    console.log("[LEDGER] sync error:", err.message);
  } finally {
    ledgerSyncRunning = false;
  }
}

// Auto-sync can be turned off without disabling the rest of the SS Accounting
// integration by setting LEDGER_SYNC_ENABLED=false. The interval is also
// configurable (default 60s) to keep it off the hot path on small boxes.
function startLedgerSyncJob() {
  if (ssEnabled() && process.env.LEDGER_SYNC_ENABLED !== "false") {
    const ledgerIntervalMs =
      Number(process.env.LEDGER_SYNC_INTERVAL_MS) || 60 * 1000;
    setInterval(syncLedger, ledgerIntervalMs);
    setTimeout(syncLedger, 8 * 1000); // first run shortly after boot
    console.log(`[LEDGER] SS Accounting auto-sync enabled (${ledgerIntervalMs}ms)`);
  } else {
    console.log("[LEDGER] SS Accounting auto-sync disabled");
  }
}

async function getSspayBalance(apiKey, baseUrl = SSPAY_BASE_URL) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(`${baseUrl}/public/balance`, {
      method: "GET",
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const bodyText = await r.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: bodyText };
    }
    if (!r.ok)
      return {
        ok: false,
        status: r.status,
        body,
        error: body?.message || `http_${r.status}`,
      };
    return {
      ok: true,
      // Numeric balance for pre-check math (sandbox null → 0, same as before).
      balance: Number(body?.balance || 0),
      // Raw balance preserves null so the UI can show "sandbox — no real balance".
      balanceRaw: body?.balance == null ? null : Number(body.balance),
      mode: body?.mode || null,
      walletId: body?.wallet_id || null,
      currency: body?.currency || "INR",
      min: Number(body?.limits?.min_amount || 0),
      max: Number(body?.limits?.max_amount || 0),
      raw: body,
    };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function callSspayPayout({
  apiKey,
  amount,
  accountName,
  accountNumber,
  ifsc,
  bankName,
  clientReferenceId,
  webhookUrl,
  baseUrl = SSPAY_BASE_URL,
}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const r = await fetch(`${baseUrl}/public/payout`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        currency: "INR",
        beneficiary: {
          // The provider validates these as strings. Account numbers that are
          // all-digits arrive as JSON numbers from some merchants — coerce every
          // beneficiary field to a string so they never get rejected (http_422).
          name: String(accountName ?? ""),
          account_number: String(accountNumber ?? ""),
          ifsc: String(ifsc ?? ""),
          bank_name: String(bankName || "Bank"),
        },
        client_reference_id: String(clientReferenceId ?? ""),
        ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const bodyText = await r.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: bodyText };
    }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: err.message } };
  }
}

// Build a human-useful failure reason from a failed SSPay payout response.
// Prefer SSPay's own error/message; otherwise fall back to the HTTP status PLUS
// whatever the body actually contained, so we never lose the real reason behind
// a bare "http_400".
function sspayFailureReason(sspay) {
  const direct = sspay?.body?.error || sspay?.body?.message;
  if (direct) return String(direct);
  let bodyDetail = "";
  try {
    bodyDetail =
      sspay?.body?.raw != null
        ? String(sspay.body.raw)
        : sspay?.body
          ? JSON.stringify(sspay.body)
          : "";
  } catch {
    bodyDetail = "";
  }
  bodyDetail = bodyDetail.slice(0, 300);
  return `http_${sspay?.status ?? 0}${bodyDetail ? `: ${bodyDetail}` : ""}`;
}

// Reproduce Python's json.dumps(obj, sort_keys=True) output: keys sorted, and the
// default ", " / ": " separators (JS's JSON.stringify emits compact "," / ":").
// Note: Python renders floats as 1000.0 where JS renders 1000 — for such payloads
// this won't match, and the 90s status poller is the safety net.
function pythonJsonDumpsSorted(value) {
  const enc = (v) => {
    if (v === null) return "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(enc).join(", ")}]`;
    if (typeof v === "object") {
      const keys = Object.keys(v).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}: ${enc(v[k])}`).join(", ")}}`;
    }
    return "null";
  };
  return enc(value);
}

function verifySspaySignature({ rawBody, parsedBody, signatureHeader, apiKey }) {
  if (!signatureHeader || !apiKey) return false;
  const expectedHeader = String(signatureHeader).trim();

  // Strategy 1: HMAC over the raw incoming body bytes (most reliable since
  // it matches exactly what SSPay's sender HMAC'd before transmission).
  let sigRaw = "";
  if (rawBody) {
    try {
      sigRaw = crypto.createHmac("sha256", apiKey).update(rawBody).digest("hex");
      if (sigRaw === expectedHeader) return true;
    } catch { /* fall through */ }
  }

  // Strategy 2: HMAC over JSON.stringify(body, sortedKeys) — matches SSPay's
  // docs verify example. Some senders compute over the canonical re-stringified
  // form, so try this as a fallback.
  let sigCanonical = "";
  if (parsedBody && typeof parsedBody === "object") {
    try {
      const sortedKeys = Object.keys(parsedBody).sort();
      const normalized = JSON.stringify(parsedBody, sortedKeys);
      sigCanonical = crypto.createHmac("sha256", apiKey).update(normalized).digest("hex");
      if (sigCanonical === expectedHeader) return true;
    } catch { /* fall through */ }
  }

  // Strategy 3: HMAC over Python's json.dumps(payload, sort_keys=True) form —
  // sorted keys with ", " / ": " separators. The FirstPay/Dharti sender signs this
  // exact string, which differs from JS's compact JSON.stringify above.
  if (parsedBody && typeof parsedBody === "object") {
    try {
      const pyJson = pythonJsonDumpsSorted(parsedBody);
      const sigPy = crypto.createHmac("sha256", apiKey).update(pyJson).digest("hex");
      if (sigPy === expectedHeader) return true;
    } catch { /* fall through */ }
  }

  console.log("[SSPAY WEBHOOK] sig mismatch debug:", {
    received: expectedHeader,
    computed_raw: sigRaw,
    computed_canonical: sigCanonical,
    raw_body_len: rawBody?.length,
    raw_body_preview: rawBody?.substring(0, 200),
    api_key_prefix: String(apiKey).substring(0, 20),
  });
  return false;
}

async function authenticateMerchantWithdrawalApiKey(req, res, next) {
  try {
    const apiKey = req.headers["api-key"] || req.headers["x-api-key"];
    if (!apiKey)
      return res
        .status(401)
        .json({
          message: "api-key header required",
          code: 401,
          data: {},
          error: true,
        });

    const result = await pool.query(
      `SELECT wmc.merchant_id, wmc.max_payment_limit, wmc.max_available_limit, wmc.commission_percent, wmc.is_active AS config_active,
              wmc.sspay_api_key, wmc.sspay_enabled, wmc.payout_provider, wmc.firstpay_api_key, wmc.survey_api_key,
              m.name AS merchant_name, m.agent_id, m.is_active AS merchant_active
       FROM withdrawal_merchant_configs wmc
       JOIN merchants m ON m.id = wmc.merchant_id
       WHERE wmc.api_key = $1 LIMIT 1`,
      [apiKey],
    );
    if (result.rows.length === 0)
      return res
        .status(401)
        .json({
          message: "Merchant does not exist",
          code: 400,
          data: {},
          error: true,
        });

    const cfg = result.rows[0];
    if (!cfg.config_active || !cfg.merchant_active)
      return res
        .status(403)
        .json({
          message: "Merchant inactive",
          code: 403,
          data: {},
          error: true,
        });

    req.withdrawalMerchant = cfg;
    next();
  } catch (error) {
    console.log("Withdrawal API auth error:", error);
    res
      .status(500)
      .json({ message: "API auth failed", code: 500, data: {}, error: true });
  }
}

// ── Public API ────────────────────────────────────────────────────────────
app.post(
  "/api/withdrawal/payout-create",
  authenticateMerchantWithdrawalApiKey,
  async (req, res) => {
    try {
      const merchant = req.withdrawalMerchant;
      const {
        amount,
        transaction_type,
        upi_id,
        account_name,
        account_number,
        ifsc_code,
        webhookUrl,
      } = req.body || {};

      const numericAmount = Number(amount);
      if (!numericAmount || numericAmount <= 0)
        return res
          .status(400)
          .json({
            message: "Valid amount required",
            code: 400,
            data: {},
            error: true,
          });
      if (transaction_type !== "upi" && transaction_type !== "account")
        return res
          .status(400)
          .json({
            message: "transaction_type must be 'upi' or 'account'",
            code: 400,
            data: {},
            error: true,
          });

      if (transaction_type === "upi" && (!upi_id || !String(upi_id).trim())) {
        return res
          .status(400)
          .json({
            message: "upi_id required for upi transaction_type",
            code: 400,
            data: {},
            error: true,
          });
      }
      if (transaction_type === "account") {
        if (!account_number || !account_name || !ifsc_code) {
          return res
            .status(400)
            .json({
              message:
                "account_name, account_number, ifsc_code required for account transaction_type",
              code: 400,
              data: {},
              error: true,
            });
        }
      }

      if (
        Number(merchant.max_payment_limit) > 0 &&
        numericAmount > Number(merchant.max_payment_limit)
      ) {
        return res
          .status(400)
          .json({
            message: "Amount exceeds max_payment_limit",
            code: 400,
            data: {},
            error: true,
          });
      }

      // Provider pre-check: balance + per-transaction limits, before we create our row.
      // Only for bank-account type with auto-payout enabled and a key for the
      // merchant's selected provider (a24h by default, or FirstPay).
      const provider = resolvePayoutProvider(merchant);
      const willUseSspay =
        transaction_type === "account" &&
        merchant.sspay_enabled &&
        provider.apiKey;

      if (!willUseSspay) {
        const reason =
          transaction_type !== "account"
            ? `type=${transaction_type} (not account)`
            : !merchant.sspay_enabled
              ? "sspay_enabled=false"
              : !provider.apiKey
                ? `no api key for provider=${provider.name}`
                : "unknown";
        console.log(
          `[PAYOUT] skip for merchant ${merchant.merchant_id} — ${reason}`,
        );
      }
      if (willUseSspay) {
        const bal = await getSspayBalance(provider.apiKey, provider.def.baseUrl);
        if (!bal.ok) {
          return res.status(502).json({
            message: `SSPay balance check failed: ${bal.error || "unknown"}`,
            code: 502,
            data: {},
            error: true,
          });
        }
        if (bal.balance < numericAmount) {
          return res.status(400).json({
            message: `Insufficient SSPay wallet balance. Available: ${bal.balance}, required: ${numericAmount}`,
            code: 400,
            data: { balance: bal.balance, required: numericAmount },
            error: true,
          });
        }
        if (bal.min > 0 && numericAmount < bal.min) {
          return res.status(400).json({
            message: `Amount below SSPay minimum (${bal.min})`,
            code: 400,
            data: {},
            error: true,
          });
        }
        if (bal.max > 0 && numericAmount > bal.max) {
          return res.status(400).json({
            message: `Amount above SSPay maximum (${bal.max})`,
            code: 400,
            data: {},
            error: true,
          });
        }
      }
      // NOTE: client-facing messages above intentionally keep their existing wording
      // so merchants integrating against them see no change when the provider is switched.

      const txnId = crypto.randomBytes(12).toString("hex");
      const result = await pool.query(
        `INSERT INTO withdrawal_transactions (transaction_id, merchant_id, amount, transaction_type, upi_id, account_name, account_number, ifsc_code, webhook_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending') RETURNING *`,
        [
          txnId,
          merchant.merchant_id,
          numericAmount,
          transaction_type,
          upi_id || "",
          account_name || "",
          account_number || "",
          ifsc_code || "",
          webhookUrl || "",
        ],
      );

      const created = result.rows[0];

      if (willUseSspay) {
        const publicBase = (
          process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`
        ).replace(/\/+$/, "");
        // Each provider gets its own callback path so we know which key to verify with.
        const ourWebhookUrl = `${publicBase}/api/withdrawal/${provider.def.webhookPath}/${merchant.merchant_id}`;

        console.log(
          `[PAYOUT:${provider.name}] firing payout for txn ${created.id} amount=${numericAmount} merchant=${merchant.merchant_id} ifsc=${ifsc_code}`,
        );

        const sspay = await callSspayPayout({
          apiKey: provider.apiKey,
          baseUrl: provider.def.baseUrl,
          amount: numericAmount,
          accountName: account_name,
          accountNumber: account_number,
          ifsc: ifsc_code,
          bankName: getBankNameFromIfsc(ifsc_code),
          clientReferenceId: txnId,
          webhookUrl: ourWebhookUrl,
        });

        console.log(
          `[PAYOUT:${provider.name}] response for txn ${created.id} ok=${sspay.ok} http=${sspay.status} status=${sspay.body?.status} order_id=${sspay.body?.order_id}`,
        );

        if (sspay.ok) {
          const orderId = sspay.body?.order_id || null;
          const upstreamStatus = String(sspay.body?.status || "").toUpperCase();
          const upstreamUtr = sspay.body?.utr || null;
          await pool.query(
            `UPDATE withdrawal_transactions SET sspay_order_id = $1, sspay_status = $2, payout_provider = $4 WHERE id = $3`,
            [orderId, upstreamStatus, created.id, provider.name],
          );

          if (upstreamStatus === "SUCCESS" && upstreamUtr) {
            // Instant SUCCESS (sandbox or fast settle) — clear directly and fire the
            // webhook; no manual merchant approval step.
            const cleared = await pool.query(
              `UPDATE withdrawal_transactions
             SET status = 'cleared', utr_number = $1, picked_at = COALESCE(picked_at, NOW()),
                 cleared_or_rejected_date = NOW()
             WHERE id = $2 RETURNING *`,
              [String(upstreamUtr), created.id],
            );
            if (cleared.rows.length > 0) fireWithdrawalWebhook(cleared.rows[0]);
            return res.json({
              message: "Transaction Create Successfully",
              code: 200,
              data: {
                transaction_id: created.transaction_id,
                status: "cleared",
                utr_number: upstreamUtr,
              },
            });
          } else if (upstreamStatus === "REVERSED") {
            const failureReason =
              sspay.body?.failure_reason ||
              sspay.body?.message ||
              "Reversed by provider";
            const refunded = await pool.query(
              `UPDATE withdrawal_transactions
             SET status = 'refunded', cleared_or_rejected_date = NOW(), sspay_status = 'REVERSED', sspay_failure_reason = $1
             WHERE id = $2 RETURNING *`,
              [String(failureReason), created.id],
            );
            fireWithdrawalWebhook(refunded.rows[0]);
            return res.status(400).json({
              message: `SSPay reversed payout: ${failureReason}`,
              code: 400,
              data: {
                transaction_id: created.transaction_id,
                status: "refunded",
                failure_reason: failureReason,
              },
              error: true,
            });
          } else if (["FAILED", "EXPIRED"].includes(upstreamStatus)) {
            const failureReason =
              sspay.body?.failure_reason ||
              sspay.body?.message ||
              upstreamStatus;
            const rejected = await pool.query(
              `UPDATE withdrawal_transactions
             SET status = 'rejected', cleared_or_rejected_date = NOW(), sspay_failure_reason = $1
             WHERE id = $2 RETURNING *`,
              [String(failureReason), created.id],
            );
            fireWithdrawalWebhook(rejected.rows[0]);
            return res.status(400).json({
              message: `SSPay rejected payout: ${failureReason}`,
              code: 400,
              data: {
                transaction_id: created.transaction_id,
                status: "rejected",
                failure_reason: failureReason,
              },
              error: true,
            });
          }
          // Otherwise (PENDING/PROCESSING) - return success with current state; webhook will update later.
          return res.json({
            message: "Transaction Create Successfully",
            code: 200,
            data: {
              transaction_id: created.transaction_id,
              status: "pending",
              sspay_status: upstreamStatus,
            },
          });
        } else {
          // SSPay call failed (4xx/5xx or network). Treat as a terminal rejection so the merchant
          // gets a clear signal instead of a silently-stuck pending row.
          const reason = sspayFailureReason(sspay);
          const rejected = await pool.query(
            `UPDATE withdrawal_transactions
           SET status = 'rejected', cleared_or_rejected_date = NOW(), sspay_failure_reason = $1
           WHERE id = $2 RETURNING *`,
            [String(reason), created.id],
          );
          fireWithdrawalWebhook(rejected.rows[0]);
          console.log(
            `[SSPAY] call failed for txn ${created.id} status=${sspay.status} body=`,
            sspay.body,
          );
          return res.status(502).json({
            message: `SSPay request failed: ${reason}`,
            code: 502,
            data: {
              transaction_id: created.transaction_id,
              status: "rejected",
              failure_reason: reason,
            },
            error: true,
          });
        }
      }

      return res.json({
        message: "Transaction Create Successfully",
        code: 200,
        data: { transaction_id: created.transaction_id, status: "pending" },
      });
    } catch (error) {
      console.log("Withdrawal payout-create error:", error);
      res
        .status(500)
        .json({
          message: "Could not create transaction",
          code: 500,
          data: {},
          error: true,
        });
    }
  },
);

// Provider webhook receiver — one URL per merchant, per provider:
//   a24h     → https://<our-domain>/api/withdrawal/sspay-webhook/<merchant_id>
//   FirstPay → https://<our-domain>/api/withdrawal/firstpay-webhook/<merchant_id>
// Both providers run the same codebase, so the body/status handling below is shared;
// only the credential column and the signature header differ per provider.
const makeProviderWebhookHandler = (providerName) => async (req, res) => {
  try {
    const { merchant_id } = req.params;
    const def = PAYOUT_PROVIDERS[providerName];
    const signature = def.sigHeaders
      .map((h) => req.headers[h])
      .find((v) => v);
    const body = req.body || {};

    const cfg = await pool.query(
      `SELECT sspay_api_key, firstpay_api_key, survey_api_key FROM withdrawal_merchant_configs WHERE merchant_id = $1 LIMIT 1`,
      [merchant_id],
    );
    const apiKey = cfg.rows[0]?.[def.keyField];
    if (cfg.rows.length === 0 || !apiKey) {
      return res
        .status(404)
        .json({ message: "Merchant config not found or SSPay not configured" });
    }

    if (
      !verifySspaySignature({
        rawBody: req.rawBody,
        parsedBody: body,
        signatureHeader: signature,
        apiKey,
      })
    ) {
      // Not fatal: the 90s fallback poller re-checks the provider's status endpoint
      // (authenticated with our key) and settles the payout regardless.
      console.log(
        `[${providerName.toUpperCase()} WEBHOOK] signature mismatch for merchant ${merchant_id}`,
      );
      return res.status(401).json({ message: "Invalid signature" });
    }

    const {
      event,
      order_id,
      status: upstreamStatus,
      utr,
      amount,
      failure_reason,
    } = body;
    if (!order_id)
      return res.status(400).json({ message: "order_id required" });

    const txnLookup = await pool.query(
      `SELECT * FROM withdrawal_transactions WHERE sspay_order_id = $1 AND merchant_id = $2 LIMIT 1`,
      [order_id, merchant_id],
    );
    if (txnLookup.rows.length === 0) {
      console.log(
        `[SSPAY WEBHOOK] order_id ${order_id} not found for merchant ${merchant_id}`,
      );
      return res
        .status(404)
        .json({ message: "Transaction not found for this order_id" });
    }
    const txn = txnLookup.rows[0];

    const normalized = String(event || upstreamStatus || "").toLowerCase();
    let updated;

    if (
      normalized.includes("success") ||
      String(upstreamStatus).toUpperCase() === "SUCCESS"
    ) {
      // SSPay confirmed payout — clear directly and fire the webhook, no merchant approval.
      updated = await pool.query(
        `UPDATE withdrawal_transactions
         SET status = 'cleared', utr_number = $1, picked_at = COALESCE(picked_at, NOW()),
             cleared_or_rejected_date = NOW(), sspay_status = 'SUCCESS'
         WHERE id = $2 AND status IN ('pending', 'picked', 'utr_submitted')
         RETURNING *`,
        [String(utr || ""), txn.id],
      );
      if (updated.rows.length > 0) fireWithdrawalWebhook(updated.rows[0]);
    } else if (normalized.includes("revers") || normalized.includes("refund")) {
      // Reversal/refund — distinct from a plain failure, including when it
      // arrives *after* we'd already marked the payout cleared (Success). Not
      // gated on current status: a reversal can and does land after a SUCCESS.
      const reason =
        failure_reason || event || upstreamStatus || "Reversed by provider";
      updated = await pool.query(
        `UPDATE withdrawal_transactions
         SET status = 'refunded', cleared_or_rejected_date = NOW(),
             sspay_status = $1, sspay_failure_reason = $2
         WHERE id = $3
         RETURNING *`,
        [String(upstreamStatus || event).toUpperCase(), String(reason), txn.id],
      );
      if (updated.rows.length > 0) fireWithdrawalWebhook(updated.rows[0]);
    } else if (normalized.includes("fail") || normalized.includes("expir")) {
      const reason =
        failure_reason || event || upstreamStatus || "SSPay failure";
      updated = await pool.query(
        `UPDATE withdrawal_transactions
         SET status = 'rejected', cleared_or_rejected_date = NOW(),
             sspay_status = $1, sspay_failure_reason = $2
         WHERE id = $3
         RETURNING *`,
        [String(upstreamStatus || event).toUpperCase(), String(reason), txn.id],
      );
      if (updated.rows.length > 0) fireWithdrawalWebhook(updated.rows[0]);
    } else {
      // Non-terminal status update (e.g. PROCESSING) - just record it.
      await pool.query(
        `UPDATE withdrawal_transactions SET sspay_status = $1 WHERE id = $2`,
        [String(upstreamStatus || event).toUpperCase(), txn.id],
      );
    }

    res.json({ received: true });
  } catch (error) {
    console.log("SSPay webhook error:", error);
    res.status(500).json({ message: "Webhook processing failed" });
  }
};

// a24h keeps its original path/behaviour untouched; FirstPay & Survey get their own.
app.post("/api/withdrawal/sspay-webhook/:merchant_id", makeProviderWebhookHandler("a24h"));
app.post("/api/withdrawal/firstpay-webhook/:merchant_id", makeProviderWebhookHandler("firstpay"));
app.post("/api/withdrawal/survey-webhook/:merchant_id", makeProviderWebhookHandler("survey"));

app.get(
  "/api/withdrawal/transactions/status",
  authenticateMerchantWithdrawalApiKey,
  async (req, res) => {
    try {
      const merchant = req.withdrawalMerchant;
      const { transactionId } = req.query;
      if (!transactionId)
        return res
          .status(400)
          .json({
            message: "transactionId required",
            code: 400,
            data: {},
            error: true,
          });

      const result = await pool.query(
        `SELECT transaction_id, amount, status, utr_number, transaction_type, upi_id, account_name, account_number, ifsc_code, created_at, cleared_or_rejected_date
       FROM withdrawal_transactions WHERE transaction_id = $1 AND merchant_id = $2 LIMIT 1`,
        [transactionId, merchant.merchant_id],
      );

      if (result.rows.length === 0)
        return res
          .status(404)
          .json({
            message: "Transaction does not exist",
            code: 400,
            data: {},
            error: true,
          });

      res.json({ message: "ok", code: 200, data: result.rows[0] });
    } catch (error) {
      console.log("Withdrawal status check error:", error);
      res
        .status(500)
        .json({
          message: "Could not fetch status",
          code: 500,
          data: {},
          error: true,
        });
    }
  },
);

// ── Admin/UI: merchant configs ────────────────────────────────────────────
app.get("/api/withdrawal/configs", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    let query = `
  SELECT wmc.*, m.name AS merchant_name, m.username AS merchant_username,
    (SELECT array_agg(agent_id)
     FROM withdrawal_merchant_agent_assignments
     WHERE merchant_id = wmc.merchant_id) AS assigned_agent_ids
  FROM withdrawal_merchant_configs wmc
  JOIN merchants m ON m.id = wmc.merchant_id
`;

const values = [];

if (auth.role === "admin") {
  query += ` WHERE m.created_by_admin_id = $1`;
  values.push(Number(auth.userId));
}

query += ` ORDER BY wmc.id DESC`;

const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.log("Withdrawal configs list error:", error);
    res.status(500).json({ message: "Could not fetch configs" });
  }
});

app.post("/api/withdrawal/configs", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const {
      merchant_id,
      max_payment_limit,
      max_available_limit,
      commission_percent,
      is_active,
      agent_ids,
      sspay_api_key,
      sspay_enabled,
      payout_provider,
      firstpay_api_key,
      survey_api_key,
    } = req.body || {};
    if (!merchant_id)
      return res.status(400).json({ message: "merchant_id required" });

    // Unknown/absent provider falls back to a24h — the original live behaviour.
    const providerName = PAYOUT_PROVIDERS[payout_provider] ? payout_provider : "a24h";

    const apiKey = crypto.randomBytes(32).toString("hex");
    const upsert = await pool.query(
      `INSERT INTO withdrawal_merchant_configs (merchant_id, max_payment_limit, max_available_limit, commission_percent, api_key, is_active, sspay_api_key, sspay_enabled, payout_provider, firstpay_api_key, survey_api_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (merchant_id) DO UPDATE SET
         max_payment_limit = EXCLUDED.max_payment_limit,
         max_available_limit = EXCLUDED.max_available_limit,
         commission_percent = EXCLUDED.commission_percent,
         is_active = EXCLUDED.is_active,
         sspay_api_key = EXCLUDED.sspay_api_key,
         sspay_enabled = EXCLUDED.sspay_enabled,
         payout_provider = EXCLUDED.payout_provider,
         firstpay_api_key = EXCLUDED.firstpay_api_key,
         survey_api_key = EXCLUDED.survey_api_key,
         updated_at = NOW()
       RETURNING *`,
      [
        merchant_id,
        max_payment_limit || 0,
        max_available_limit || 0,
        commission_percent || 0,
        apiKey,
        is_active !== false,
        sspay_api_key || null,
        !!sspay_enabled,
        providerName,
        firstpay_api_key || null,
        survey_api_key || null,
      ],
    );

    if (Array.isArray(agent_ids)) {
      await pool.query(
        `DELETE FROM withdrawal_merchant_agent_assignments WHERE merchant_id = $1`,
        [merchant_id],
      );
      for (const aId of agent_ids) {
        if (aId)
          await pool.query(
            `INSERT INTO withdrawal_merchant_agent_assignments (merchant_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [merchant_id, Number(aId)],
          );
      }
    }

    res.json(upsert.rows[0]);
  } catch (error) {
    console.log("Withdrawal config upsert error:", error);
    res.status(500).json({ message: "Could not save config" });
  }
});

app.put("/api/withdrawal/configs/:merchant_id", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { merchant_id } = req.params;
    const {
      max_payment_limit,
      max_available_limit,
      commission_percent,
      is_active,
      agent_ids,
      regenerate_api_key,
      sspay_api_key,
      sspay_enabled,
      payout_provider,
      firstpay_api_key,
      survey_api_key,
    } = req.body || {};

    const providerName = PAYOUT_PROVIDERS[payout_provider] ? payout_provider : "a24h";

    let result;
    if (regenerate_api_key) {
      const newKey = crypto.randomBytes(32).toString("hex");
      result = await pool.query(
        `UPDATE withdrawal_merchant_configs SET max_payment_limit=$1, max_available_limit=$2, commission_percent=$3, is_active=$4, api_key=$5, sspay_api_key=$6, sspay_enabled=$7, payout_provider=$8, firstpay_api_key=$9, survey_api_key=$10, updated_at=NOW()
         WHERE merchant_id=$11 RETURNING *`,
        [
          max_payment_limit || 0,
          max_available_limit || 0,
          commission_percent || 0,
          is_active !== false,
          newKey,
          sspay_api_key || null,
          !!sspay_enabled,
          providerName,
          firstpay_api_key || null,
          survey_api_key || null,
          merchant_id,
        ],
      );
    } else {
      result = await pool.query(
        `UPDATE withdrawal_merchant_configs SET max_payment_limit=$1, max_available_limit=$2, commission_percent=$3, is_active=$4, sspay_api_key=$5, sspay_enabled=$6, payout_provider=$7, firstpay_api_key=$8, survey_api_key=$9, updated_at=NOW()
         WHERE merchant_id=$10 RETURNING *`,
        [
          max_payment_limit || 0,
          max_available_limit || 0,
          commission_percent || 0,
          is_active !== false,
          sspay_api_key || null,
          !!sspay_enabled,
          providerName,
          firstpay_api_key || null,
          survey_api_key || null,
          merchant_id,
        ],
      );
    }

    if (Array.isArray(agent_ids)) {
      await pool.query(
        `DELETE FROM withdrawal_merchant_agent_assignments WHERE merchant_id = $1`,
        [merchant_id],
      );
      for (const aId of agent_ids) {
        if (aId)
          await pool.query(
            `INSERT INTO withdrawal_merchant_agent_assignments (merchant_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [merchant_id, Number(aId)],
          );
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.log("Withdrawal config update error:", error);
    res.status(500).json({ message: "Could not update config" });
  }
});

// Live SSPay sub-wallet balance for a merchant's configured payout wallet.
// Backs the "Check balance" button on the Withdrawal Configs page so admins can
// see how much is available to pay out. Calls SSPay with the merchant's stored
// key server-side and never returns the key itself.
app.get("/api/withdrawal/configs/:merchant_id/sspay-balance", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { merchant_id } = req.params;
    const cfgRes = await pool.query(
      `SELECT wmc.sspay_api_key, wmc.firstpay_api_key, wmc.survey_api_key, wmc.payout_provider, wmc.sspay_enabled, m.created_by_admin_id
       FROM withdrawal_merchant_configs wmc
       JOIN merchants m ON m.id = wmc.merchant_id
       WHERE wmc.merchant_id = $1 LIMIT 1`,
      [merchant_id],
    );
    const cfg = cfgRes.rows[0];
    if (!cfg) return res.status(404).json({ message: "Config not found" });
    // Admins can only query merchants they own; super-admins see all.
    if (
      auth.role === "admin" &&
      Number(cfg.created_by_admin_id) !== Number(auth.userId)
    )
      return res.status(403).json({ message: "Forbidden" });
    // Query the wallet of the merchant's SELECTED provider (a24h / firstpay / survey).
    const prov = resolvePayoutProvider(cfg);
    if (!prov.apiKey)
      return res
        .status(400)
        .json({ message: `No API key configured for provider '${prov.name}'` });

    const bal = await getSspayBalance(prov.apiKey, prov.def.baseUrl);
    if (!bal.ok)
      return res.status(502).json({
        message: `Balance check failed (${prov.def.label}): ${bal.error || "unknown"}`,
      });

    res.json({
      provider: prov.name,
      provider_label: prov.def.label,
      mode: bal.mode,
      balance: bal.balanceRaw, // null in sandbox (no real money tracked)
      currency: bal.currency,
      min: bal.min,
      max: bal.max,
      sspay_enabled: !!cfg.sspay_enabled,
    });
  } catch (error) {
    console.log("SSPay balance fetch error:", error);
    res.status(500).json({ message: "Could not fetch SSPay balance" });
  }
});

// Cached live balances for ALL of an admin's SSPay-enabled merchants. Backs the
// dashboard wallet box and the admin low-balance alert. Cached ~45s per merchant so
// repeated admin polling doesn't hammer SSPay (and respects its IP whitelist / limits).
const sspayBalanceCache = new Map(); // merchant_id -> { at, data }
const SSPAY_BAL_TTL_MS = 45 * 1000;

app.get("/api/withdrawal/sspay-balances", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    // Any merchant with a key for its selected provider (a24h / firstpay / survey).
    let q = `
      SELECT wmc.merchant_id, wmc.sspay_api_key, wmc.firstpay_api_key, wmc.survey_api_key,
             wmc.payout_provider, wmc.sspay_enabled, m.name AS merchant_name
      FROM withdrawal_merchant_configs wmc
      JOIN merchants m ON m.id = wmc.merchant_id
      WHERE COALESCE(wmc.sspay_api_key, wmc.firstpay_api_key, wmc.survey_api_key) IS NOT NULL
    `;
    const values = [];
    if (auth.role === "admin") {
      q += ` AND m.created_by_admin_id = $1`;
      values.push(Number(auth.userId));
    }
    q += ` ORDER BY m.name ASC`;
    const cfgs = await pool.query(q, values);

    const out = [];
    for (const c of cfgs.rows) {
      const prov = resolvePayoutProvider(c);
      if (!prov.apiKey) continue; // selected provider has no key — skip
      const cached = sspayBalanceCache.get(c.merchant_id);
      let data;
      if (cached && Date.now() - cached.at < SSPAY_BAL_TTL_MS) {
        data = cached.data;
      } else {
        const r = await getSspayBalance(prov.apiKey, prov.def.baseUrl);
        data = r.ok
          ? {
              ok: true,
              balance: r.balanceRaw, // null in sandbox
              mode: r.mode,
              currency: r.currency,
              min: r.min,
              max: r.max,
            }
          : { ok: false, error: r.error || "balance check failed" };
        sspayBalanceCache.set(c.merchant_id, { at: Date.now(), data });
      }
      out.push({
        merchant_id: c.merchant_id,
        merchant_name: c.merchant_name,
        provider: prov.name,
        provider_label: prov.def.label,
        sspay_enabled: !!c.sspay_enabled,
        ...data,
      });
    }
    res.json(out);
  } catch (error) {
    console.log("SSPay balances fetch error:", error);
    res.status(500).json({ message: "Could not fetch SSPay balances" });
  }
});

// The logged-in merchant's own SSPay wallet balance — shown on the withdrawal-create
// screen so they know how much is left to pay out. Scoped to their own merchant_id;
// never exposes the api key. Returns { enabled:false } when no SSPay key is configured.
app.get("/api/withdrawal/my-sspay-balance", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant")
      return res.status(403).json({ message: "Forbidden" });
    const merchantId = Number(auth.userId);

    const cfgRes = await pool.query(
      `SELECT sspay_api_key, firstpay_api_key, survey_api_key, payout_provider, sspay_enabled FROM withdrawal_merchant_configs WHERE merchant_id = $1 LIMIT 1`,
      [merchantId],
    );
    const cfg = cfgRes.rows[0];
    const prov = resolvePayoutProvider(cfg);
    if (!cfg || !prov.apiKey)
      return res.json({ enabled: false });

    const cached = sspayBalanceCache.get(merchantId);
    let data;
    if (cached && Date.now() - cached.at < SSPAY_BAL_TTL_MS) {
      data = cached.data;
    } else {
      const r = await getSspayBalance(prov.apiKey, prov.def.baseUrl);
      data = r.ok
        ? { ok: true, balance: r.balanceRaw, mode: r.mode, currency: r.currency, min: r.min, max: r.max }
        : { ok: false, error: r.error || "balance check failed" };
      sspayBalanceCache.set(merchantId, { at: Date.now(), data });
    }
    res.json({ enabled: !!cfg.sspay_enabled, ...data });
  } catch (error) {
    console.log("My SSPay balance fetch error:", error);
    res.status(500).json({ message: "Could not fetch SSPay balance" });
  }
});

// Manually trigger the SS Accounting ledger sync and report what's been pushed so far.
app.post("/api/ledger/sync", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });
    if (!ssEnabled())
      return res.status(400).json({ message: "SS Accounting not configured (set SSACCT_USERNAME / SSACCT_PASSWORD)" });
    syncLedger(); // fire-and-forget; safe to call repeatedly
    const counts = await pool.query(
      `SELECT kind, COUNT(*)::int AS count FROM ledger_sync GROUP BY kind ORDER BY kind`,
    );
    res.json({ message: "Ledger sync triggered", pushed_so_far: counts.rows });
  } catch (error) {
    console.log("Ledger sync trigger error:", error);
    res.status(500).json({ message: "Could not trigger ledger sync" });
  }
});

// ── Admin/UI: transactions ────────────────────────────────────────────────
app.get("/api/withdrawal/transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    // assigned_agent_name = the agent assigned to this merchant via
    // withdrawal_merchant_agent_assignments. Used to attribute SSPay-paid
    // rows (which never get an agent_id) to whoever owns the merchant.
    let query = `
      SELECT w.*, m.name AS merchant_name, a.name AS agent_name,
             (SELECT ag.name FROM withdrawal_merchant_agent_assignments wmaa
                JOIN agents ag ON ag.id = wmaa.agent_id
                WHERE wmaa.merchant_id = w.merchant_id LIMIT 1) AS assigned_agent_name
      FROM withdrawal_transactions w
      LEFT JOIN merchants m ON m.id = w.merchant_id
      LEFT JOIN agents a ON a.id = w.agent_id
    `;
    const values = [];

    if (role === "merchant") {
      query += ` WHERE w.merchant_id = $1`;
      values.push(userId);
    } else if (role === "agent") {
      query += ` WHERE w.merchant_id IN (SELECT merchant_id FROM withdrawal_merchant_agent_assignments WHERE agent_id = $1)`;
      values.push(userId);
    } else if (role === "admin") {
      // Admins only see withdrawals for merchants they created (same scoping
      // as the configs list - matches the dev's existing pattern there).
      query += ` WHERE m.created_by_admin_id = $1`;
      values.push(userId);
    } else if (role === "super-admin") {
      // Super-admin sees everything
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }

    // Additive optional filters for the Super Admin control-center breakdown
    // drawers — omitted params add no clause, so every existing caller's
    // behavior is unaffected. Every branch above adds exactly one "WHERE ..."
    // except super-admin (zero), so track whether one exists yet to know
    // whether the next clause needs "WHERE" or "AND".
    let hasWhere = role !== "super-admin";
    const addClause = (fragment) => {
      query += hasWhere ? ` AND ${fragment}` : ` WHERE ${fragment}`;
      hasWhere = true;
    };
    const { status, startDate, endDate, merchant_id } = req.query;
    if (status) { addClause(`w.status = $${values.length + 1}`); values.push(status); }
    if (merchant_id) { addClause(`w.merchant_id = $${values.length + 1}`); values.push(Number(merchant_id)); }
    const dateFragment = buildIstDateFilter(values, startDate, endDate, "w.created_at");
    if (dateFragment) addClause(dateFragment.replace(/^ AND /, ""));

    query += ` ORDER BY w.id DESC`;

    const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10) || 1) : null;
    const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50)) : null;
    if (page && limit) {
      query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, (page - 1) * limit);
    }

    const result = await pool.query(query, values);

    // Derive a readable bank name from the IFSC so agents/admins have the full
    // destination details to actually make the payout. (Bank transfers only — UPI
    // rows have no IFSC.)
    const rows = result.rows.map((r) => ({
      ...r,
      bank_name:
        r.transaction_type === "upi" || !r.ifsc_code
          ? null
          : getBankNameFromIfsc(r.ifsc_code),
    }));

    // Merchants should not see who internally handled their withdrawal
    // (agent name, agent name, SSPay order id, etc.). Strip those.
    if (role === "merchant") {
      const sanitized = rows.map((r) => {
        const {
          agent_name, assigned_agent_name,
          sspay_order_id, sspay_status, sspay_failure_reason,
          agent_id,
          ...visible
        } = r;
        return visible;
      });
      return res.json(sanitized);
    }

    res.json(rows);
  } catch (error) {
    console.log("Withdrawal transactions list error:", error);
    res.status(500).json({ message: "Could not fetch transactions" });
  }
});

app.post("/api/withdrawal/transactions", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    const role = auth.role;
    const userId = Number(auth.userId);

    const {
      merchant_id,
      amount,
      transaction_type,
      upi_id,
      account_name,
      account_number,
      ifsc_code,
      webhook_url,
      notes,
    } = req.body || {};
    const numericAmount = Number(amount);

    const finalMerchantId = role === "merchant" ? userId : Number(merchant_id);
    if (!finalMerchantId)
      return res.status(400).json({ message: "merchant_id required" });
    if (!numericAmount || numericAmount <= 0)
      return res.status(400).json({ message: "Valid amount required" });
    if (transaction_type !== "upi" && transaction_type !== "account")
      return res
        .status(400)
        .json({ message: "transaction_type must be 'upi' or 'account'" });
    if (transaction_type === "upi" && !upi_id)
      return res.status(400).json({ message: "upi_id required" });
    if (
      transaction_type === "account" &&
      (!account_number || !account_name || !ifsc_code)
    )
      return res
        .status(400)
        .json({ message: "account_name, account_number, ifsc_code required" });

    // Load merchant's payout config so the UI-created withdrawal goes through the same
    // auto-payout path (and selected provider) as the public api-key endpoint.
    const cfgResult = await pool.query(
      `SELECT sspay_api_key, firstpay_api_key, survey_api_key, payout_provider, sspay_enabled
       FROM withdrawal_merchant_configs WHERE merchant_id = $1 LIMIT 1`,
      [finalMerchantId]
    );
    const cfg = cfgResult.rows[0] || {};
    const provider = resolvePayoutProvider(cfg);
    const willUseSspay = transaction_type === "account" && cfg.sspay_enabled && provider.apiKey;

    if (!willUseSspay) {
      const reason = transaction_type !== "account"
        ? `type=${transaction_type} (not account)`
        : !cfg.sspay_enabled
          ? "sspay_enabled=false"
          : !provider.apiKey
            ? `no api key for provider=${provider.name}`
            : "no config";
      console.log(`[PAYOUT] (UI) skip for merchant ${finalMerchantId} — ${reason}`);
    }

    // Pre-check provider balance + per-transaction limits before creating the row
    if (willUseSspay) {
      const bal = await getSspayBalance(provider.apiKey, provider.def.baseUrl);
      if (!bal.ok) {
        return res.status(502).json({ message: `SSPay balance check failed: ${bal.error || "unknown"}` });
      }
      if (bal.balance < numericAmount) {
        return res.status(400).json({
          message: `Insufficient SSPay wallet balance. Available: ₹${bal.balance}, required: ₹${numericAmount}`,
        });
      }
      if (bal.min > 0 && numericAmount < bal.min) {
        return res.status(400).json({
          message: `Amount below SSPay minimum (₹${bal.min}). Minimum withdrawal: ₹${bal.min}`,
        });
      }
      if (bal.max > 0 && numericAmount > bal.max) {
        return res.status(400).json({
          message: `Amount above SSPay maximum (₹${bal.max}). Maximum per transaction: ₹${bal.max}`,
        });
      }
    }

    const txnId = crypto.randomBytes(12).toString("hex");
    const result = await pool.query(
      `INSERT INTO withdrawal_transactions (transaction_id, merchant_id, amount, transaction_type, upi_id, account_name, account_number, ifsc_code, webhook_url, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING *`,
      [
        txnId,
        finalMerchantId,
        numericAmount,
        transaction_type,
        upi_id || "",
        account_name || "",
        account_number || "",
        ifsc_code || "",
        webhook_url || "",
        notes || "",
      ],
    );

    const created = result.rows[0];

    if (willUseSspay) {
      const publicBase = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
      const ourWebhookUrl = `${publicBase}/api/withdrawal/${provider.def.webhookPath}/${finalMerchantId}`;

      console.log(`[PAYOUT:${provider.name}] (UI) firing payout for txn ${created.id} amount=${numericAmount} merchant=${finalMerchantId} ifsc=${ifsc_code}`);

      const sspay = await callSspayPayout({
        apiKey: provider.apiKey,
        baseUrl: provider.def.baseUrl,
        amount: numericAmount,
        accountName: account_name,
        accountNumber: account_number,
        ifsc: ifsc_code,
        bankName: getBankNameFromIfsc(ifsc_code),
        clientReferenceId: txnId,
        webhookUrl: ourWebhookUrl,
      });

      console.log(`[PAYOUT:${provider.name}] (UI) response for txn ${created.id} ok=${sspay.ok} http=${sspay.status} status=${sspay.body?.status} order_id=${sspay.body?.order_id}`);
      if (!sspay.ok) {
        console.log(`[PAYOUT:${provider.name}] (UI) failure body for txn ${created.id}:`, JSON.stringify(sspay.body));
      }

      if (sspay.ok) {
        const orderId = sspay.body?.order_id || null;
        const upstreamStatus = String(sspay.body?.status || "").toUpperCase();
        const upstreamUtr = sspay.body?.utr || null;
        await pool.query(
          `UPDATE withdrawal_transactions SET sspay_order_id = $1, sspay_status = $2, payout_provider = $4 WHERE id = $3`,
          [orderId, upstreamStatus, created.id, provider.name]
        );

        if (upstreamStatus === "SUCCESS" && upstreamUtr) {
          // Clear directly and fire the webhook — no manual merchant approval.
          const updated = await pool.query(
            `UPDATE withdrawal_transactions SET status = 'cleared', utr_number = $1, picked_at = COALESCE(picked_at, NOW()), cleared_or_rejected_date = NOW() WHERE id = $2 RETURNING *`,
            [String(upstreamUtr), created.id]
          );
          if (updated.rows.length > 0) fireWithdrawalWebhook(updated.rows[0]);
          return res.json(updated.rows[0]);
        } else if (upstreamStatus === "REVERSED") {
          const reason = sspay.body?.failure_reason || sspay.body?.message || "Reversed by provider";
          const refunded = await pool.query(
            `UPDATE withdrawal_transactions SET status = 'refunded', cleared_or_rejected_date = NOW(), sspay_status = 'REVERSED', sspay_failure_reason = $1 WHERE id = $2 RETURNING *`,
            [String(reason), created.id]
          );
          fireWithdrawalWebhook(refunded.rows[0]);
          return res.json(refunded.rows[0]);
        } else if (["FAILED", "EXPIRED"].includes(upstreamStatus)) {
          const reason = sspay.body?.failure_reason || sspay.body?.message || upstreamStatus;
          const rejected = await pool.query(
            `UPDATE withdrawal_transactions SET status = 'rejected', cleared_or_rejected_date = NOW(), sspay_failure_reason = $1 WHERE id = $2 RETURNING *`,
            [String(reason), created.id]
          );
          fireWithdrawalWebhook(rejected.rows[0]);
          return res.json(rejected.rows[0]);
        }
        // PENDING/PROCESSING — webhook will update later
        return res.json({ ...created, sspay_order_id: orderId, sspay_status: upstreamStatus });
      } else {
        const reason = sspayFailureReason(sspay);
        const rejected = await pool.query(
          `UPDATE withdrawal_transactions SET status = 'rejected', cleared_or_rejected_date = NOW(), sspay_failure_reason = $1 WHERE id = $2 RETURNING *`,
          [String(reason), created.id]
        );
        fireWithdrawalWebhook(rejected.rows[0]);
        return res.status(502).json({ message: `SSPay request failed: ${reason}`, transaction: rejected.rows[0] });
      }
    }

    res.json(created);
  } catch (error) {
    console.log("Withdrawal create error:", error);
    res.status(500).json({ message: "Could not create withdrawal" });
  }
});

app.post("/api/withdrawal/transactions/:id/pick", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Only agents can pick" });
    const agentId = Number(auth.userId);
    const { id } = req.params;

    const allowed = await pool.query(
      `SELECT 1 FROM withdrawal_transactions w
       JOIN withdrawal_merchant_agent_assignments wmaa ON wmaa.merchant_id = w.merchant_id
       WHERE w.id = $1 AND wmaa.agent_id = $2 LIMIT 1`,
      [id, agentId],
    );
    if (allowed.rows.length === 0)
      return res
        .status(403)
        .json({ message: "This withdrawal is not assigned to your agent" });

    const result = await pool.query(
      `UPDATE withdrawal_transactions
       SET agent_id = $1, status = 'picked', picked_at = NOW()
       WHERE id = $2 AND status = 'pending' AND agent_id IS NULL AND sspay_order_id IS NULL
       RETURNING *`,
      [agentId, id],
    );

    if (result.rows.length === 0)
      return res
        .status(409)
        .json({
          message: "Already picked, not pending, or being processed by SSPay",
        });
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Withdrawal pick error:", error);
    res.status(500).json({ message: "Could not pick withdrawal" });
  }
});

app.post("/api/withdrawal/transactions/:id/submit-utr", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent")
      return res.status(403).json({ message: "Only agents can submit UTR" });
    const agentId = Number(auth.userId);
    const { id } = req.params;
    const { utr_number, notes } = req.body || {};
    if (!utr_number || !String(utr_number).trim())
      return res.status(400).json({ message: "utr_number required" });

    // Submitting the UTR clears the withdrawal directly from our side — no separate
    // merchant approval step. Mark it cleared and fire the webhook immediately
    // (same payload the merchant-approve path used to send).
    const result = await pool.query(
      `UPDATE withdrawal_transactions
       SET utr_number = $1, status = 'cleared', cleared_or_rejected_date = NOW(),
           notes = COALESCE(NULLIF($2, ''), notes)
       WHERE id = $3 AND agent_id = $4 AND status = 'picked'
       RETURNING *`,
      [String(utr_number).trim(), notes || "", id, agentId],
    );

    if (result.rows.length === 0)
      return res
        .status(409)
        .json({ message: "Not your picked transaction or wrong status" });
    fireWithdrawalWebhook(result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Withdrawal submit-utr error:", error);
    res.status(500).json({ message: "Could not submit UTR" });
  }
});

app.post("/api/withdrawal/transactions/:id/approve", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });
    const userId = Number(auth.userId);
    const { id } = req.params;

    let result;
    if (auth.role === "merchant") {
      result = await pool.query(
        `UPDATE withdrawal_transactions SET status = 'cleared', cleared_or_rejected_date = NOW()
         WHERE id = $1 AND merchant_id = $2 AND status = 'utr_submitted'
         RETURNING *`,
        [id, userId],
      );
    } else {
      result = await pool.query(
        `UPDATE withdrawal_transactions SET status = 'cleared', cleared_or_rejected_date = NOW()
         WHERE id = $1 AND status = 'utr_submitted'
         RETURNING *`,
        [id],
      );
    }

    if (result.rows.length === 0)
      return res
        .status(409)
        .json({ message: "Wrong state or not your transaction" });
    fireWithdrawalWebhook(result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Withdrawal approve error:", error);
    res.status(500).json({ message: "Could not approve" });
  }
});

app.post("/api/withdrawal/transactions/:id/reject", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });
    const userId = Number(auth.userId);
    const { id } = req.params;
    const { notes } = req.body || {};

    let result;
    if (auth.role === "merchant") {
      result = await pool.query(
        `UPDATE withdrawal_transactions SET status = 'rejected', cleared_or_rejected_date = NOW(), notes = COALESCE(NULLIF($1, ''), notes)
         WHERE id = $2 AND merchant_id = $3 AND status IN ('utr_submitted', 'picked', 'pending')
         RETURNING *`,
        [notes || "", id, userId],
      );
    } else {
      result = await pool.query(
        `UPDATE withdrawal_transactions SET status = 'rejected', cleared_or_rejected_date = NOW(), notes = COALESCE(NULLIF($1, ''), notes)
         WHERE id = $2 AND status IN ('utr_submitted', 'picked', 'pending')
         RETURNING *`,
        [notes || "", id],
      );
    }

    if (result.rows.length === 0)
      return res
        .status(409)
        .json({ message: "Wrong state or not your transaction" });
    fireWithdrawalWebhook(result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.log("Withdrawal reject error:", error);
    res.status(500).json({ message: "Could not reject" });
  }
});

// Manually re-check a withdrawal's status with the payment provider (SSPay) and
// update our record accordingly. This is the only way a reversal/refund that
// happens *after* we've already marked a withdrawal "cleared" (Success) gets
// picked up — the background poller and incoming webhook only ever touch
// non-terminal rows, so without this a provider-side reversal on an
// already-cleared withdrawal would otherwise never be reflected here.
// Admin/Merchant/Super-Admin only, and triggered exclusively by an explicit
// click — no automatic polling is wired to this endpoint.
app.post("/api/withdrawal/transactions/:id/check-status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    const lookup = await pool.query(
      `SELECT w.*, cfg.sspay_api_key, cfg.firstpay_api_key, cfg.survey_api_key, cfg.payout_provider AS cfg_provider,
              m.created_by_admin_id AS merchant_admin_id
       FROM withdrawal_transactions w
       LEFT JOIN withdrawal_merchant_configs cfg ON cfg.merchant_id = w.merchant_id
       LEFT JOIN merchants m ON m.id = w.merchant_id
       WHERE w.id = $1 LIMIT 1`,
      [id],
    );
    if (lookup.rows.length === 0)
      return res.status(404).json({ message: "Withdrawal not found" });
    const w = lookup.rows[0];

    if (auth.role === "merchant" && Number(w.merchant_id) !== Number(auth.userId))
      return res.status(403).json({ message: "Forbidden" });
    if (auth.role === "admin" && Number(w.merchant_admin_id) !== Number(auth.userId))
      return res.status(403).json({ message: "Forbidden" });

    // 'rejected'/'refunded' are terminal negative outcomes at the provider —
    // nothing further to learn there. 'cleared' (Success) is deliberately
    // NOT short-circuited: a provider-side reversal can silently invalidate
    // an already-cleared payout, which is exactly what this endpoint exists
    // to catch — every click must hit SSPay regardless of current status.
    if (["rejected", "refunded"].includes(w.status)) {
      console.log(`[CHECK-STATUS] txn=${id} already terminal (${w.status}) — skipping SSPay call`);
      return res.json({ message: `Already ${w.status}`, transaction: w });
    }

    // Check against whichever provider actually handled this payout.
    const prov = resolvePayoutProvider({
      payout_provider: w.payout_provider || w.cfg_provider,
      sspay_api_key: w.sspay_api_key,
      firstpay_api_key: w.firstpay_api_key,
      survey_api_key: w.survey_api_key,
    });
    if (!w.sspay_order_id || !prov.apiKey)
      return res.status(400).json({
        message:
          "No provider order on this withdrawal — nothing to auto-check. Approve it via the agent UTR flow.",
        transaction: w,
      });

    console.log(`[CHECK-STATUS] txn=${id} local_status=${w.status} provider=${prov.name} order_id=${w.sspay_order_id} — calling provider`);
    const sres = await getSspayPayoutStatus(prov.apiKey, w.sspay_order_id, prov.def.baseUrl);
    console.log(`[CHECK-STATUS] txn=${id} sspay_order_id=${w.sspay_order_id} raw_response=${JSON.stringify(sres.body)} http=${sres.status}`);
    if (!sres.ok)
      return res
        .status(502)
        .json({ message: `SSPay status check failed (http_${sres.status})`, transaction: w });

    const rawStatus = sres.body?.status || sres.body?.event || "";
    const normalized = String(rawStatus).toLowerCase();
    const upstreamStatus = String(rawStatus).toUpperCase();
    const upstreamUtr = sres.body?.utr || null;

    if (normalized.includes("success")) {
      const wasAlreadyCleared = w.status === "cleared";
      // Clear even if SSPay didn't return a UTR (that's exactly the case the poll misses).
      const cleared = await pool.query(
        `UPDATE withdrawal_transactions
         SET status = 'cleared', sspay_status = 'SUCCESS',
             utr_number = COALESCE(NULLIF($1, ''), utr_number),
             picked_at = COALESCE(picked_at, NOW()), cleared_or_rejected_date = NOW()
         WHERE id = $2 RETURNING *`,
        [String(upstreamUtr || ""), id],
      );
      console.log(`[CHECK-STATUS] txn=${id} mapped_status=cleared db_update_rows=${cleared.rowCount} was_already_cleared=${wasAlreadyCleared}`);
      // Only notify the merchant's webhook on an actual status transition —
      // re-confirming an already-cleared payout shouldn't re-fire it.
      if (!wasAlreadyCleared) fireWithdrawalWebhook(cleared.rows[0]);
      return res.json({ message: "Payout confirmed as cleared.", transaction: cleared.rows[0] });
    }

    // Reversal/refund — distinct from a plain failure, including when it
    // arrives after we'd already marked the payout cleared (Success).
    if (normalized.includes("revers") || normalized.includes("refund")) {
      const reason =
        sres.body?.failure_reason || sres.body?.message || "Reversed by provider";
      const refunded = await pool.query(
        `UPDATE withdrawal_transactions
         SET status = 'refunded', sspay_status = $1, sspay_failure_reason = $2,
             cleared_or_rejected_date = NOW()
         WHERE id = $3 RETURNING *`,
        [upstreamStatus, String(reason), id],
      );
      console.log(`[CHECK-STATUS] txn=${id} mapped_status=refunded sspay_status=${upstreamStatus} db_update_rows=${refunded.rowCount}`);
      fireWithdrawalWebhook(refunded.rows[0]);
      return res.json({
        message: "Payout reversed by provider — amount credited back to your outstanding balance.",
        transaction: refunded.rows[0],
      });
    }

    if (normalized.includes("fail") || normalized.includes("expir")) {
      const reason =
        sres.body?.failure_reason || sres.body?.message || upstreamStatus;
      const rejected = await pool.query(
        `UPDATE withdrawal_transactions
         SET status = 'rejected', sspay_status = $1, sspay_failure_reason = $2,
             cleared_or_rejected_date = NOW()
         WHERE id = $3 RETURNING *`,
        [upstreamStatus, String(reason), id],
      );
      console.log(`[CHECK-STATUS] txn=${id} mapped_status=rejected sspay_status=${upstreamStatus} db_update_rows=${rejected.rowCount}`);
      fireWithdrawalWebhook(rejected.rows[0]);
      return res.json({
        message: `Payout ${upstreamStatus.toLowerCase()}.`,
        transaction: rejected.rows[0],
      });
    }

    // Still processing at SSPay — record the latest status, no status transition,
    // so no merchant webhook is fired.
    const stillProcessing = await pool.query(
      `UPDATE withdrawal_transactions SET sspay_status = $1 WHERE id = $2 RETURNING *`,
      [upstreamStatus || null, id],
    );
    console.log(`[CHECK-STATUS] txn=${id} mapped_status=unchanged(${w.status}) sspay_status=${upstreamStatus || null} db_update_rows=${stillProcessing.rowCount}`);
    return res.json({
      message: `Still ${upstreamStatus || "processing"} at SSPay — try again shortly.`,
      transaction: stillProcessing.rows[0] || { ...w, sspay_status: upstreamStatus },
    });
  } catch (error) {
    console.log("Withdrawal check-status error:", error);
    res.status(500).json({ message: "Could not check status" });
  }
});

// Merchant raises a dispute on a cleared withdrawal.
// Sets merchant_dispute_reason / merchant_disputed_at on the withdrawal AND creates a support
// ticket so the admin sees it in the Merchant Tickets page with all withdrawal details.
app.post("/api/withdrawal/transactions/:id/dispute", async (req, res) => {
  const client = await pool.connect();
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant")
      return res.status(403).json({ message: "Forbidden" });
    const merchantId = Number(auth.userId);
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!reason?.trim())
      return res.status(400).json({ message: "Dispute reason is required" });

    const lookup = await client.query(
      `SELECT * FROM withdrawal_transactions WHERE id = $1 AND merchant_id = $2 LIMIT 1`,
      [id, merchantId],
    );
    if (lookup.rows.length === 0)
      return res.status(404).json({ message: "Withdrawal not found" });
    const w = lookup.rows[0];
    if (w.status !== "cleared")
      return res.status(400).json({ message: "Disputes can only be raised on cleared withdrawals" });
    if (w.merchant_disputed_at)
      return res.status(400).json({ message: "A dispute has already been raised for this withdrawal" });

    const amountFmt = `₹${Number(w.amount).toLocaleString("en-IN")}`;
    const dateFmt = w.created_at ? new Date(w.created_at).toLocaleString("en-GB") : "—";
    const utrFmt = w.utr_number || "N/A";
    const refFmt = w.transaction_id || String(w.id);

    const ticketSubject = `Withdrawal Dispute — Ref: ${refFmt} | ${amountFmt} | UTR: ${utrFmt}`;
    const ticketIssue = `${reason.trim()}\n\n--- Withdrawal Details ---\nTransaction Ref: ${refFmt}\nAmount: ${amountFmt}\nUTR / Reference: ${utrFmt}\nStatus: Cleared\nDate: ${dateFmt}`;

    await client.query("BEGIN");
    const updW = await client.query(
      `UPDATE withdrawal_transactions
       SET merchant_dispute_reason = $1, merchant_disputed_at = NOW()
       WHERE id = $2 AND merchant_id = $3 RETURNING *`,
      [reason.trim(), id, merchantId],
    );
    const ticket = await client.query(
      `INSERT INTO tickets (merchant_id, subject, issue, client_id, withdrawal_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [merchantId, ticketSubject, ticketIssue, auth.clientId || null, Number(id)],
    );
    await client.query("COMMIT");

    // Fire-and-forget alert — the merchant_disputed_at guard above already
    // makes this route naturally idempotent (a retry 400s before reaching
    // the UPDATE), and claimDisputeAlert() adds a second, independent layer.
    claimDisputeAlert("withdrawal_transactions", Number(id))
      .then((claimed) => {
        if (!claimed) return;
        return sendWithdrawalDisputeAlert(Number(id), {
          raisedByLabel: "Merchant",
          reason: reason.trim(),
        });
      })
      .catch((e) => console.error("[ALERTS] withdrawal dispute alert error:", e.message));

    res.json({
      message: "Dispute raised successfully",
      ticket_id: ticket.rows[0].id,
      ticket: ticket.rows[0],
      transaction: updW.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("Withdrawal dispute error:", error);
    res.status(500).json({ message: "Could not raise dispute" });
  } finally {
    client.release();
  }
});

// Merchant raises a dispute on a PayIn transaction.
// Creates a support ticket so the admin sees it in Merchant Tickets with full PayIn details.
app.post("/api/transactions/:id/merchant-dispute", async (req, res) => {
  const client = await pool.connect();
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant")
      return res.status(403).json({ message: "Forbidden" });
    const merchantId = Number(auth.userId);
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!reason?.trim())
      return res.status(400).json({ message: "Dispute reason is required" });

    const lookup = await client.query(
      `SELECT t.*, sm.name AS merchant_name
       FROM transactions t
       LEFT JOIN merchants sm ON sm.id = t.merchant_id
       WHERE t.id = $1 AND t.merchant_id = $2 LIMIT 1`,
      [id, merchantId],
    );
    if (lookup.rows.length === 0)
      return res.status(404).json({ message: "Transaction not found" });
    const txn = lookup.rows[0];

    const amountFmt = `₹${Number(txn.amount).toLocaleString("en-IN")}`;
    const dateFmt = txn.created_at ? new Date(txn.created_at).toLocaleString("en-GB") : "—";
    const utrFmt = txn.utr_number || "N/A";
    const refFmt = txn.transaction_id || String(txn.id);
    const statusFmt = txn.status || "Pending";
    const merchantFmt = txn.merchant_name || "—";

    const ticketSubject = `PayIn Dispute — Ref: ${refFmt} | ${amountFmt} | Status: ${statusFmt} | UTR: ${utrFmt}`;
    const ticketIssue = `${reason.trim()}\n\n--- PayIn Transaction Details ---\nTransaction Ref: ${refFmt}\nAmount: ${amountFmt}\nStatus: ${statusFmt}\nUTR / Reference: ${utrFmt}\nMerchant: ${merchantFmt}\nDate: ${dateFmt}`;

    await client.query("BEGIN");
    const updT = await client.query(
      `UPDATE transactions SET merchant_dispute_reason = $1, merchant_disputed_at = NOW()
       WHERE id = $2 AND merchant_id = $3 RETURNING *`,
      [reason.trim(), id, merchantId],
    );
    const ticket = await client.query(
      `INSERT INTO tickets (merchant_id, subject, issue, client_id, payin_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [merchantId, ticketSubject, ticketIssue, auth.clientId || null, Number(id)],
    );
    await client.query("COMMIT");

    // Fire-and-forget alert. Unlike the two routes above, this endpoint has
    // no existing guard against being called more than once for the same
    // transaction (each call creates a fresh ticket, unchanged pre-existing
    // behavior) — claimDisputeAlert() is what keeps the EMAIL side to at
    // most one send per transaction regardless of how many times a merchant
    // (re-)raises a dispute or a client retries the request.
    claimDisputeAlert("transactions", Number(id))
      .then((claimed) => {
        if (!claimed) return;
        return sendPayinDisputeAlert(Number(id), {
          raisedByLabel: "Merchant",
          reason: reason.trim(),
        });
      })
      .catch((e) => console.error("[ALERTS] merchant dispute alert error:", e.message));

    res.json({
      message: "Dispute raised successfully",
      ticket_id: ticket.rows[0].id,
      ticket: ticket.rows[0],
      transaction: updT.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.log("PayIn dispute error:", error);
    res.status(500).json({ message: "Could not raise dispute" });
  } finally {
    client.release();
  }
});

// Admin: list all disputed withdrawals
app.get("/api/withdrawal/disputes", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["admin", "super-admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });
    const result = await pool.query(
      `SELECT w.*, m.name AS merchant_name
       FROM withdrawal_transactions w
       LEFT JOIN merchants m ON m.id = w.merchant_id
       WHERE w.merchant_disputed_at IS NOT NULL
       ORDER BY w.merchant_disputed_at DESC`,
    );
    res.json(result.rows);
  } catch (error) {
    console.log("Withdrawal disputes list error:", error);
    res.status(500).json({ message: "Could not fetch disputes" });
  }
});

// ============================================================
// TEST MODE — per-client sandboxed testing environment
// ─────────────────────────────────────────────────────────────
// Enabled per client via clients.test_mode_enabled = true.
// The test merchant per client is flagged via merchants.is_test_merchant = true.
// Works for MasterPay, MasterPay, and any future client.
// Detection is 100% DB-driven — no hardcoded domains or usernames.
// ============================================================

// True when the client has test_mode_enabled AND the merchant is flagged as is_test_merchant.
// null clientId = MasterPay / platform (always test-mode eligible; only is_test_merchant gate applies).
async function isTestModeMerchant(merchantId, clientId) {
  if (!merchantId) return false;
  const cid = clientId != null ? Number(clientId) : null;
  if (cid === null) {
    // Platform merchants (client_id IS NULL) — no clients row to check; is_test_merchant is the only gate.
    const r = await pool.query(
      `SELECT id FROM merchants WHERE id = $1 AND client_id IS NULL AND is_test_merchant = true LIMIT 1`,
      [Number(merchantId)],
    );
    return r.rows.length > 0;
  }
  const r = await pool.query(
    `SELECT m.id FROM merchants m
     JOIN clients c ON c.id = m.client_id
     WHERE m.id = $1 AND m.client_id = $2
       AND m.is_test_merchant = true
       AND c.test_mode_enabled = true
       AND c.status = 'Active'
     LIMIT 1`,
    [Number(merchantId), cid],
  );
  return r.rows.length > 0;
}

// True when the admin's client has test_mode_enabled.
// null clientId = MasterPay / platform admin — automatically eligible (platform is always test-mode enabled).
async function isTestModeAdmin(clientId) {
  if (clientId === null || clientId === undefined || clientId === "") return true;
  const r = await pool.query(
    `SELECT id FROM clients WHERE id = $1 AND test_mode_enabled = true AND status = 'Active' LIMIT 1`,
    [Number(clientId)],
  );
  return r.rows.length > 0;
}

// True when the agent is active and belongs to a test-mode-enabled client.
// null clientId = MasterPay / platform path — skips the clients JOIN.
async function isTestModeAgent(agentId, clientId) {
  if (!agentId) return false;
  const cid = clientId != null ? Number(clientId) : null;
  if (cid === null) {
    const r = await pool.query(
      `SELECT id FROM agents WHERE id = $1 AND client_id IS NULL AND is_active = true LIMIT 1`,
      [Number(agentId)],
    );
    return r.rows.length > 0;
  }
  const r = await pool.query(
    `SELECT a.id FROM agents a
     JOIN clients c ON c.id = a.client_id
     WHERE a.id = $1 AND a.client_id = $2
       AND a.is_active = true
       AND c.test_mode_enabled = true
       AND c.status = 'Active'
     LIMIT 1`,
    [Number(agentId), cid],
  );
  return r.rows.length > 0;
}

// Fires a POST webhook to the test withdrawal's webhook_url.
// Updates test_mode_withdrawals (not withdrawal_transactions).
async function fireTestModeWebhook(testTxn) {
  if (!testTxn?.webhook_url?.trim()) return;
  const url = testTxn.webhook_url.trim();
  const payload = {
    transactionId: testTxn.transaction_id,
    status: testTxn.status,
    amount: Number(testTxn.amount),
    utr_number: testTxn.utr_number || null,
  };
  console.log(`[TEST MODE WEBHOOK] firing for txn ${testTxn.id} → ${url}`);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = await r.text();
    await pool.query(
      `UPDATE test_mode_withdrawals SET webhook_sent = true, webhook_response = $1 WHERE id = $2`,
      [`status=${r.status} body=${body.substring(0, 500)}`, testTxn.id],
    ).catch(() => {});
  } catch (err) {
    await pool.query(
      `UPDATE test_mode_withdrawals SET webhook_sent = false, webhook_response = $1 WHERE id = $2`,
      [`error: ${err.message}`, testTxn.id],
    ).catch(() => {});
  }
}

// ── Eligibility check (merchant or admin) ─────────────────────
app.get("/api/masterpay-test/status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!auth.role) return res.status(401).json({ enabled: false });

    if (auth.role === "merchant") {
      const ok = await isTestModeMerchant(auth.userId, auth.clientId);
      if (!ok) return res.json({ enabled: false });
      const bal = await pool.query(
        `SELECT balance FROM test_mode_balance WHERE merchant_id = $1 LIMIT 1`,
        [Number(auth.userId)],
      );
      return res.json({ enabled: true, role: "merchant", balance: Number(bal.rows[0]?.balance || 0) });
    }

    // merchant: enabled only if parent merchant is the test merchant on a test-enabled client
    if (auth.role === "merchant") {
      const ok = await isTestModeMerchant(auth.userId, auth.clientId);
      return res.json({ enabled: ok, role: "merchant" });
    }

    if (auth.role === "admin") {
      const ok = await isTestModeAdmin(auth.clientId);
      return res.json({ enabled: ok, role: "admin" });
    }

    if (auth.role === "agent") {
      const ok = await isTestModeAgent(auth.userId, auth.clientId);
      return res.json({ enabled: ok, role: "agent" });
    }

    return res.json({ enabled: false });
  } catch (err) {
    console.log("[TEST MODE] status error:", err);
    res.status(500).json({ enabled: false });
  }
});

// ── Get test balance (test merchant) ─────────────────────────
app.get("/api/masterpay-test/balance", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const r = await pool.query(
      `SELECT balance FROM test_mode_balance WHERE merchant_id = $1 LIMIT 1`,
      [Number(auth.userId)],
    );
    res.json({ balance: Number(r.rows[0]?.balance || 0) });
  } catch (err) {
    console.log("[TEST MODE] balance error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Add test balance (admin of test-mode-enabled client only) ────
app.post("/api/masterpay-test/balance/add", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeAdmin(auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const numAmount = Number(req.body?.amount);
    if (!numAmount || numAmount <= 0)
      return res.status(400).json({ message: "Valid positive amount required" });

    // Find the designated test merchant for this client (null clientId = MasterPay platform)
    const cid = auth.clientId != null ? Number(auth.clientId) : null;
    const mRes = await pool.query(
      `SELECT id FROM merchants WHERE is_test_merchant = true AND client_id IS NOT DISTINCT FROM $1 LIMIT 1`,
      [cid],
    );
    if (!mRes.rows.length)
      return res.status(404).json({ message: "No test merchant configured for this client" });
    const merchantId = mRes.rows[0].id;

    await pool.query(
      `INSERT INTO test_mode_balance (merchant_id, client_id, balance, updated_at, updated_by_role, updated_by_id)
       VALUES ($1, $2, $3, NOW(), $4, $5)
       ON CONFLICT (merchant_id) DO UPDATE
         SET balance = test_mode_balance.balance + $3,
             updated_at = NOW(), updated_by_role = $4, updated_by_id = $5`,
      [merchantId, cid, numAmount, auth.role, Number(auth.userId)],
    );
    const after = await pool.query(
      `SELECT balance FROM test_mode_balance WHERE merchant_id = $1`,
      [merchantId],
    );
    res.json({ message: "Test balance added", new_balance: Number(after.rows[0].balance) });
  } catch (err) {
    console.log("[TEST MODE] add balance error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Create test withdrawal (test merchant) ────────────────────
app.post("/api/masterpay-test/withdrawal/create", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const {
      amount, transaction_type, upi_id,
      account_name, account_number, ifsc_code,
      webhook_url, notes,
    } = req.body || {};
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) return res.status(400).json({ message: "Valid amount required" });
    if (!["upi", "account"].includes(transaction_type))
      return res.status(400).json({ message: "transaction_type must be 'upi' or 'account'" });
    if (transaction_type === "upi" && !String(upi_id || "").trim())
      return res.status(400).json({ message: "upi_id required" });
    if (transaction_type === "account" && (!account_name || !account_number || !ifsc_code))
      return res.status(400).json({ message: "account_name, account_number, ifsc_code required" });

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const balRes = await pool.query(
      `SELECT balance FROM test_mode_balance WHERE merchant_id = $1 LIMIT 1`,
      [Number(auth.userId)],
    );
    const currentBalance = Number(balRes.rows[0]?.balance || 0);
    if (currentBalance < numAmount)
      return res.status(400).json({
        message: `Insufficient test balance. Available: ₹${currentBalance}, required: ₹${numAmount}`,
      });

    await pool.query("BEGIN");
    try {
      await pool.query(
        `UPDATE test_mode_balance SET balance = balance - $1, updated_at = NOW() WHERE merchant_id = $2`,
        [numAmount, Number(auth.userId)],
      );
      const txnId = crypto.randomBytes(12).toString("hex");
      const r = await pool.query(
        `INSERT INTO test_mode_withdrawals
         (transaction_id, merchant_id, client_id, amount, transaction_type,
          upi_id, account_name, account_number, ifsc_code, webhook_url, notes, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING *`,
        [
          txnId, Number(auth.userId), mpClientId, numAmount, transaction_type,
          upi_id || "", account_name || "", account_number || "", ifsc_code || "",
          webhook_url || "", notes || "",
        ],
      );
      await pool.query("COMMIT");
      const created = r.rows[0];
      res.json({
        message: "Test withdrawal created",
        code: 200,
        data: { transaction_id: created.transaction_id, status: "pending" },
      });
    } catch (inner) {
      await pool.query("ROLLBACK");
      throw inner;
    }
  } catch (err) {
    console.log("[TEST MODE] create withdrawal error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── List test withdrawals (merchant: own; admin: all for client) ──
app.get("/api/masterpay-test/withdrawals", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    if (auth.role === "merchant") {
      if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
        return res.status(403).json({ message: "Not authorized for test mode" });
      const r = await pool.query(
        `SELECT * FROM test_mode_withdrawals WHERE merchant_id = $1 ORDER BY id DESC`,
        [Number(auth.userId)],
      );
      return res.json(r.rows);
    }

    // admin path
    if (!(await isTestModeAdmin(auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });
    const cid = auth.clientId != null ? Number(auth.clientId) : null;
    const r = await pool.query(
      `SELECT w.*, m.name AS merchant_name, m.username AS merchant_username
       FROM test_mode_withdrawals w
       JOIN merchants m ON m.id = w.merchant_id
       WHERE w.client_id IS NOT DISTINCT FROM $1
       ORDER BY w.id DESC`,
      [cid],
    );
    res.json(r.rows);
  } catch (err) {
    console.log("[TEST MODE] list withdrawals error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Single withdrawal status ───────────────────────────────────
app.get("/api/masterpay-test/withdrawal/status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { transactionId } = req.query;
    if (!transactionId) return res.status(400).json({ message: "transactionId required" });

    if (auth.role === "merchant") {
      if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
        return res.status(403).json({ message: "Not authorized" });
      const r = await pool.query(
        `SELECT * FROM test_mode_withdrawals WHERE transaction_id = $1 AND merchant_id = $2 LIMIT 1`,
        [transactionId, Number(auth.userId)],
      );
      if (!r.rows.length) return res.status(404).json({ message: "Not found" });
      return res.json({ code: 200, data: r.rows[0] });
    }

    if (!(await isTestModeAdmin(auth.clientId)))
      return res.status(403).json({ message: "Not authorized" });
    const r = await pool.query(
      `SELECT * FROM test_mode_withdrawals WHERE transaction_id = $1 AND client_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [transactionId, auth.clientId != null ? Number(auth.clientId) : null],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json({ code: 200, data: r.rows[0] });
  } catch (err) {
    console.log("[TEST MODE] withdrawal status error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Manual success (admin of test-mode-enabled client) ────────
app.post("/api/masterpay-test/withdrawal/manual-success", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeAdmin(auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id, utr_number } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });
    const utr = String(utr_number || "").trim() || `TMTEST${Date.now()}`;

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const r = await pool.query(
      `UPDATE test_mode_withdrawals
       SET status = 'cleared', utr_number = $1, cleared_or_rejected_date = NOW(),
           actioned_by_role = $2, actioned_by_id = $3
       WHERE transaction_id = $4 AND client_id IS NOT DISTINCT FROM $5 AND status = 'pending'
       RETURNING *`,
      [utr, auth.role, Number(auth.userId), transaction_id, mpClientId],
    );
    if (!r.rows.length)
      return res.status(404).json({ message: "Not found or already processed" });

    fireTestModeWebhook(r.rows[0]).catch(() => {});
    res.json({ message: "Marked as manual success", transaction_id, utr_number: utr, status: "cleared" });
  } catch (err) {
    console.log("[TEST MODE] manual-success error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Manual reject (admin of test-mode-enabled client) ─────────
app.post("/api/masterpay-test/withdrawal/manual-reject", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeAdmin(auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const r = await pool.query(
      `UPDATE test_mode_withdrawals
       SET status = 'rejected', cleared_or_rejected_date = NOW(),
           actioned_by_role = $1, actioned_by_id = $2
       WHERE transaction_id = $3 AND client_id IS NOT DISTINCT FROM $4 AND status = 'pending'
       RETURNING *`,
      [auth.role, Number(auth.userId), transaction_id, mpClientId],
    );
    if (!r.rows.length)
      return res.status(404).json({ message: "Not found or already processed" });

    // Refund the deducted test balance on rejection
    await pool.query(
      `UPDATE test_mode_balance SET balance = balance + $1, updated_at = NOW() WHERE merchant_id = $2`,
      [Number(r.rows[0].amount), r.rows[0].merchant_id],
    );
    fireTestModeWebhook(r.rows[0]).catch(() => {});
    res.json({ message: "Marked as rejected", transaction_id, status: "rejected" });
  } catch (err) {
    console.log("[TEST MODE] manual-reject error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});
// ── TEST MODE — PayIn endpoints ────────────────────────────────
// Production TTL constants (mirrors CHECKOUT_TTL_SECONDS / VERIFICATION_TTL_SECONDS)
const TEST_MODE_PAYIN_CHECKOUT_TTL     = 15 * 60; // 15 min — merchant must submit UTR
const TEST_MODE_PAYIN_VERIFICATION_TTL = 15 * 60; // 15 min — admin must approve after UTR submitted

// Static mock bank details returned as "checkout" for every test PayIn.
// Mirrors the agent_accounts bank details shape from production.
const TEST_MODE_PAYIN_ACCOUNT = {
  bank_name:           "Test Mode Bank",
  account_number:      "000000123456",
  account_holder_name: "Test Account",
  ifsc_code:           "TESTMODE0001",
  upi_id:              "testmode@upi",
};

// Returns remaining seconds until a timestamp; 0 if past or null.
function testModeRemainingSeconds(ts) {
  if (!ts) return 0;
  return Math.max(0, Math.floor((new Date(ts).getTime() - Date.now()) / 1000));
}

// Fires a PayIn webhook matching the EXACT production fireWebhook payload shape.
// Supports all four production events: payin.approved / payin.expired /
// payin.failed / payin.disputed. Updates test_mode_payins only.
async function fireTestModePayinWebhook(testPayin, eventName) {
  if (!testPayin?.webhook_url?.trim()) return;
  const url = testPayin.webhook_url.trim();
  const statusByEvent = {
    "payin.approved":  "Approved",
    "payin.expired":   "Expired",
    "payin.failed":    "Failed",
    "payin.disputed":  "Disputed",
  };
  const eventStatus = statusByEvent[eventName] || "Approved";
  const eventTime   = testPayin.approved_or_reject_date
    ? new Date(testPayin.approved_or_reject_date).toISOString()
    : new Date().toISOString();
  // Mirrors production fireWebhook exactly — bank details use mock account values
  const payload = {
    event:               eventName,
    transaction_id:      testPayin.id,
    transaction_ref:     testPayin.transaction_id,
    merchant_order_id:   testPayin.merchant_order_id || null,
    unique_id:           testPayin.unique_id || null,
    amount:              Number(testPayin.amount),
    utr_number:          testPayin.utr_number || null,
    disputed_utr:        testPayin.disputed_utr || null,
    status:              eventStatus,
    approved_at:         eventName === "payin.approved"  ? eventTime : null,
    expired_at:          eventName === "payin.expired"   ? eventTime : null,
    failed_at:           eventName === "payin.failed"    ? eventTime : null,
    disputed_at:         eventName === "payin.disputed"  ? eventTime : null,
    bank_name:           TEST_MODE_PAYIN_ACCOUNT.bank_name,
    account_number:      TEST_MODE_PAYIN_ACCOUNT.account_number,
    account_holder_name: TEST_MODE_PAYIN_ACCOUNT.account_holder_name,
    ifsc_code:           TEST_MODE_PAYIN_ACCOUNT.ifsc_code,
    upi_id:              TEST_MODE_PAYIN_ACCOUNT.upi_id,
  };
  console.log(`[TEST MODE PAYIN WEBHOOK] firing ${eventName} for id=${testPayin.id} → ${url}`);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const body = await r.text();
    await pool.query(
      `UPDATE test_mode_payins SET webhook_sent = true, webhook_response = $1 WHERE id = $2`,
      [`status=${r.status} body=${body.substring(0, 500)}`, testPayin.id],
    ).catch(() => {});
  } catch (err) {
    await pool.query(
      `UPDATE test_mode_payins SET webhook_sent = false, webhook_response = $1 WHERE id = $2`,
      [`error: ${err.message}`, testPayin.id],
    ).catch(() => {});
  }
}

// ── Create test PayIn (merchant of test merchant) ───────────────
// Mirrors POST /api/payin/checkout/create (production: merchant with API key creates PayIn).
// Stores both merchant_id (creator) and merchant_id (parent, for merchant's view-only access).
app.post("/api/masterpay-test/payin/create", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant")
      return res.status(403).json({ message: "Forbidden — only merchants of the test merchant can create test PayIns" });
    if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { amount, merchant_order_id, customer_name, customer_mobile,
            webhook_url, redirect_url, unique_id, description } = req.body || {};
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0)
      return res.status(400).json({ message: "Valid amount required" });

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const txnId = crypto.randomBytes(12).toString("hex");
    const r = await pool.query(
      `INSERT INTO test_mode_payins
         (transaction_id, merchant_id, client_id, amount, merchant_order_id,
          customer_name, customer_mobile, webhook_url, redirect_url,
          unique_id, description, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pending',
               NOW() + ($12 || ' seconds')::INTERVAL)
       RETURNING *`,
      [txnId, Number(auth.userId), mpClientId, numAmount,
       merchant_order_id || "", customer_name || "", customer_mobile || "",
       webhook_url || "", redirect_url || "", unique_id || "", description || "",
       String(TEST_MODE_PAYIN_CHECKOUT_TTL)],
    );
    const created = r.rows[0];
    // Return production-matching checkout/create response shape
    res.json({
      success: true,
      transaction_id:    created.id,
      transaction_ref:   created.transaction_id,
      merchant_order_id: created.merchant_order_id || null,
      amount:            numAmount,
      status:            "Pending",
      expires_at:        created.expires_at,
      expires_in_seconds: testModeRemainingSeconds(created.expires_at),
      bank_details:      TEST_MODE_PAYIN_ACCOUNT,
    });
  } catch (err) {
    console.log("[TEST MODE] create payin error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Submit test UTR (merchant of test merchant) ─────────────────
// Mirrors POST /api/checkout/:ref/submit-utr — in production the customer/merchant submits UTR.
app.post("/api/masterpay-test/payin/submit-utr", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id, utr_number, payment_proof } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });
    const cleanUtr = String(utr_number || "").trim();
    if (!cleanUtr) return res.status(400).json({ message: "utr_number required" });

    // Fetch row — scoped to this merchant_id
    const existing = await pool.query(
      `SELECT * FROM test_mode_payins WHERE transaction_id = $1 AND merchant_id = $2 LIMIT 1`,
      [transaction_id, Number(auth.userId)],
    );
    if (!existing.rows.length) return res.status(404).json({ message: "Transaction not found" });
    const txn = existing.rows[0];
    if (txn.status === "Expired")
      return res.status(410).json({ message: "Transaction has expired" });
    if (txn.status === "Approved")
      return res.status(409).json({ message: "Transaction already approved" });
    if (txn.status === "Failed" || txn.status === "Disputed" || txn.status === "Rejected")
      return res.status(409).json({ message: `Transaction is already ${txn.status}` });
    // Allow re-submission on 'UTR Submitted' (same as production checkout)
    if (!["Pending", "UTR Submitted"].includes(txn.status))
      return res.status(409).json({ message: `Cannot submit UTR in status: ${txn.status}` });

    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'UTR Submitted',
           utr_number = $1,
           payment_proof = $2,
           utr_submitted_at = NOW(),
           verification_expires_at = NOW() + ($3 || ' seconds')::INTERVAL
       WHERE transaction_id = $4 AND merchant_id = $5
       RETURNING *`,
      [cleanUtr, payment_proof || "", String(TEST_MODE_PAYIN_VERIFICATION_TTL),
       transaction_id, Number(auth.userId)],
    );
    const updated = r.rows[0];
    // Return production-matching submit-utr response shape
    res.json({
      success: true,
      message: "UTR submitted. Waiting for agent to verify.",
      transaction_ref: updated.transaction_id,
      utr_number: cleanUtr,
      status: "UTR Submitted",
      remaining_seconds: testModeRemainingSeconds(updated.expires_at),
      verification_remaining_seconds: testModeRemainingSeconds(updated.verification_expires_at),
    });
  } catch (err) {
    console.log("[TEST MODE] submit-utr error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── List test PayIns ──────────────────────────────────────────────────────────
//   merchant: own payins only (by merchant_id — the creator)
//   agent:    all for client (to action)
//   admin:    all for client (read-only view)
app.get("/api/masterpay-test/payins", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin", "agent"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    // Merchant: full access to their own test PayIns
    if (auth.role === "merchant") {
      if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
        return res.status(403).json({ message: "Not authorized for test mode" });
      const r = await pool.query(
        `SELECT * FROM test_mode_payins WHERE merchant_id = $1 ORDER BY id DESC`,
        [Number(auth.userId)],
      );
      return res.json(r.rows);
    }

    // Agent: full access to action PayIns
    if (auth.role === "agent") {
      if (!(await isTestModeAgent(auth.userId, auth.clientId)))
        return res.status(403).json({ message: "Not authorized for test mode" });
      const r = await pool.query(
        `SELECT p.*, m.name AS merchant_name, m.username AS merchant_username
         FROM test_mode_payins p
         JOIN merchants m ON m.id = p.merchant_id
         WHERE p.client_id IS NOT DISTINCT FROM $1
         ORDER BY p.id DESC`,
        [auth.clientId != null ? Number(auth.clientId) : null],
      );
      return res.json(r.rows);
    }

    // Admin: read-only view of all PayIns for the client
    if (!(await isTestModeAdmin(auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });
    const r = await pool.query(
      `SELECT p.*, m.name AS merchant_name, m.username AS merchant_username
       FROM test_mode_payins p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.client_id IS NOT DISTINCT FROM $1
       ORDER BY p.id DESC`,
      [auth.clientId != null ? Number(auth.clientId) : null],
    );
    res.json(r.rows);
  } catch (err) {
    console.log("[TEST MODE] list payins error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Single test PayIn status (mirrors GET /api/checkout/:ref/status shape) ───
app.get("/api/masterpay-test/payin/status", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!["merchant", "admin", "agent"].includes(auth.role))
      return res.status(403).json({ message: "Forbidden" });

    const { transactionId } = req.query;
    if (!transactionId) return res.status(400).json({ message: "transactionId required" });

    let row;
    if (auth.role === "merchant") {
      // Merchant: full access, can look up any PayIn under their merchant_id
      if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
        return res.status(403).json({ message: "Not authorized" });
      const r = await pool.query(
        `SELECT * FROM test_mode_payins WHERE transaction_id = $1 AND merchant_id = $2 LIMIT 1`,
        [transactionId, Number(auth.userId)],
      );
      if (!r.rows.length) return res.status(404).json({ message: "Not found" });
      row = r.rows[0];
    } else {
      // Admin or agent: look up by client_id
      const isOp = auth.role === "agent"
        ? await isTestModeAgent(auth.userId, auth.clientId)
        : await isTestModeAdmin(auth.clientId);
      if (!isOp) return res.status(403).json({ message: "Not authorized" });
      const r = await pool.query(
        `SELECT * FROM test_mode_payins WHERE transaction_id = $1 AND client_id IS NOT DISTINCT FROM $2 LIMIT 1`,
        [transactionId, auth.clientId != null ? Number(auth.clientId) : null],
      );
      if (!r.rows.length) return res.status(404).json({ message: "Not found" });
      row = r.rows[0];
    }

    // Return production-matching status response shape
    const settledAt = row.approved_or_reject_date ? new Date(row.approved_or_reject_date).toISOString() : null;
    res.json({
      success: true,
      transaction_ref:  row.transaction_id,
      status:           row.status,
      utr_number:       row.utr_number || null,
      disputed_utr:     row.disputed_utr || null,
      redirect_url:     row.redirect_url || null,
      remaining_seconds:              testModeRemainingSeconds(row.expires_at),
      verification_remaining_seconds: testModeRemainingSeconds(row.verification_expires_at),
      approved_at:  row.status === "Approved"  ? settledAt : null,
      expired_at:   row.status === "Expired"   ? settledAt : null,
      failed_at:    row.status === "Failed"    ? settledAt : null,
      disputed_at:  row.status === "Disputed"  ? settledAt : null,
    });
  } catch (err) {
    console.log("[TEST MODE] payin status error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Approve test PayIn (agent — simulates agent UTR match → Approved) ──
app.post("/api/masterpay-test/payin/approve", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent") return res.status(403).json({ message: "Forbidden — only test agents can approve PayIns" });
    if (!(await isTestModeAgent(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id, utr_number } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'Approved',
           utr_number = COALESCE(NULLIF($1,''), utr_number, $5),
           approved_or_reject_date = NOW(),
           actioned_by_role = $2, actioned_by_id = $3
       WHERE transaction_id = $4 AND client_id IS NOT DISTINCT FROM $6
         AND status IN ('Pending','UTR Submitted')
       RETURNING *`,
      [String(utr_number || "").trim(), auth.role, Number(auth.userId),
       transaction_id, `MPTEST${Date.now()}`, mpClientId],
    );
    if (!r.rows.length)
      return res.status(404).json({ message: "Not found or already processed" });

    fireTestModePayinWebhook(r.rows[0], "payin.approved").catch(() => {});
    res.json({ message: "Test PayIn approved", transaction_id, status: "Approved" });
  } catch (err) {
    console.log("[TEST MODE] payin approve error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Expire test PayIn (agent — simulates checkout TTL elapsed while Pending) ─
app.post("/api/masterpay-test/payin/expire", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent") return res.status(403).json({ message: "Forbidden — only test agents can expire PayIns" });
    if (!(await isTestModeAgent(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'Expired', approved_or_reject_date = NOW(),
           actioned_by_role = $1, actioned_by_id = $2
       WHERE transaction_id = $3 AND client_id IS NOT DISTINCT FROM $4 AND status = 'Pending'
       RETURNING *`,
      [auth.role, Number(auth.userId), transaction_id, mpClientId],
    );
    if (!r.rows.length)
      return res.status(404).json({ message: "Not found or not in Pending status" });

    fireTestModePayinWebhook(r.rows[0], "payin.expired").catch(() => {});
    res.json({ message: "Test PayIn expired", transaction_id, status: "Expired" });
  } catch (err) {
    console.log("[TEST MODE] payin expire error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Fail test PayIn (agent — simulates verification TTL elapsed after UTR submitted) ─
app.post("/api/masterpay-test/payin/fail", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "agent") return res.status(403).json({ message: "Forbidden — only test agents can fail PayIns" });
    if (!(await isTestModeAgent(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });

    const mpClientId = auth.clientId != null ? Number(auth.clientId) : null;
    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'Failed', approved_or_reject_date = NOW(),
           actioned_by_role = $1, actioned_by_id = $2
       WHERE transaction_id = $3 AND client_id IS NOT DISTINCT FROM $4 AND status = 'UTR Submitted'
       RETURNING *`,
      [auth.role, Number(auth.userId), transaction_id, mpClientId],
    );
    if (!r.rows.length)
      return res.status(404).json({ message: "Not found or not in UTR Submitted status" });

    fireTestModePayinWebhook(r.rows[0], "payin.failed").catch(() => {});
    res.json({ message: "Test PayIn marked as failed", transaction_id, status: "Failed" });
  } catch (err) {
    console.log("[TEST MODE] payin fail error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Dispute test PayIn (merchant — simulates customer/merchant dispute on Failed) ──────
app.post("/api/masterpay-test/payin/dispute", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant") return res.status(403).json({ message: "Forbidden" });
    if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const { transaction_id, disputed_utr } = req.body || {};
    if (!transaction_id) return res.status(400).json({ message: "transaction_id required" });
    const cleanUtr = String(disputed_utr || "").trim();
    if (!cleanUtr) return res.status(400).json({ message: "disputed_utr required" });

    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'Disputed', disputed_utr = $1, approved_or_reject_date = NOW()
       WHERE transaction_id = $2 AND merchant_id = $3 AND status = 'Failed'
       RETURNING *`,
      [cleanUtr, transaction_id, Number(auth.userId)],
    );
    if (!r.rows.length)
      return res.status(404).json({ message: "Not found or not in Failed status" });

    fireTestModePayinWebhook(r.rows[0], "payin.disputed").catch(() => {});
    res.json({ message: "Test PayIn disputed", transaction_id, status: "Disputed" });
  } catch (err) {
    console.log("[TEST MODE] payin dispute error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Get or generate dedicated MP Test API key (JWT-authenticated) ────────────
// merchant: returns/generates their own key.
// merchant: returns all merchant keys under their merchant_id (view-only).
app.get("/api/masterpay-test/api-key", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant")
      return res.status(403).json({ message: "Forbidden" });

    if (auth.role === "merchant") {
      if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
        return res.status(403).json({ message: "Not authorized for test mode" });

      let row = await pool.query(
        `SELECT api_key FROM test_mode_api_keys WHERE merchant_id = $1 LIMIT 1`,
        [Number(auth.userId)],
      );
      if (!row.rows.length) {
        // Auto-generate on first access
        const newKey = "mptest_" + crypto.randomBytes(24).toString("hex");
        row = await pool.query(
          `INSERT INTO test_mode_api_keys (merchant_id, api_key)
           VALUES ($1, $2)
           ON CONFLICT (merchant_id) DO UPDATE SET api_key = test_mode_api_keys.api_key
           RETURNING api_key`,
          [Number(auth.userId), newKey],
        );
      }
      return res.json({ api_key: row.rows[0].api_key });
    }

  } catch (err) {
    console.log("[TEST MODE] api-key GET error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Regenerate dedicated MP Test API key ──────────────────────────────────────
app.post("/api/masterpay-test/api-key/regenerate", async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (auth.role !== "merchant")
      return res.status(403).json({ message: "Only merchants can regenerate their MP Test API key" });
    if (!(await isTestModeMerchant(auth.userId, auth.clientId)))
      return res.status(403).json({ message: "Not authorized for test mode" });

    const newKey = "mptest_" + crypto.randomBytes(24).toString("hex");
    await pool.query(
      `INSERT INTO test_mode_api_keys (merchant_id, api_key)
       VALUES ($1, $2)
       ON CONFLICT (merchant_id) DO UPDATE SET api_key = $2, created_at = NOW()`,
      [Number(auth.userId), newKey],
    );
    return res.json({ api_key: newKey });
  } catch (err) {
    console.log("[TEST MODE] api-key regenerate error:", err);
    res.status(500).json({ message: "Internal error" });
  }
});

// ── Create test PayIn via dedicated MP Test API key ──────────────────────────
// External API endpoint — mirrors POST /api/payin/checkout/create but routes to
// test_mode_payins. Production key (x-api-key on /api/payin/checkout/create)
// continues to use the real transactions table and is completely unaffected.
app.post("/api/test/payin/checkout/create", authenticateTestApiKey, async (req, res) => {
  try {
    const sm = req.testApiUser;
    const {
      amount, merchant_order_id = "", customer_name = "", customer_mobile = "",
      webhook_url = "", redirect_url = "", unique_id = "", description = "",
    } = req.body || {};
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0)
      return res.status(400).json({ success: false, message: "Valid amount required" });

    const mpClientId = Number(req.testApiUser.client_id);
    const txnId = crypto.randomBytes(12).toString("hex");
    const r = await pool.query(
      `INSERT INTO test_mode_payins
         (transaction_id, merchant_id, client_id, amount, merchant_order_id,
          customer_name, customer_mobile, webhook_url, redirect_url,
          unique_id, description, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Pending',
               NOW() + ($12 || ' seconds')::INTERVAL)
       RETURNING *`,
      [txnId, sm.merchant_id, mpClientId, numAmount,
       merchant_order_id, customer_name, customer_mobile,
       webhook_url, redirect_url, unique_id, description,
       String(TEST_MODE_PAYIN_CHECKOUT_TTL)],
    );
    const created = r.rows[0];
    res.json({
      success:           true,
      transaction_id:    created.id,
      transaction_ref:   created.transaction_id,
      merchant_order_id: created.merchant_order_id || null,
      amount:            numAmount,
      status:            "Pending",
      checkout_url:      buildTestCheckoutUrl(created.transaction_id),
      expires_at:        created.expires_at,
      expires_in_seconds: testModeRemainingSeconds(created.expires_at),
      bank_details:      TEST_MODE_PAYIN_ACCOUNT,
    });
  } catch (err) {
    console.log("[TEST MODE] external payin create error:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
});

// ── Create test Withdrawal via dedicated MP Test API key ─────────────────────
// External API endpoint — creates in test_mode_withdrawals only.
// Production withdrawal endpoints are completely unaffected.
app.post("/api/test/withdrawal/create", authenticateTestApiKey, async (req, res) => {
  try {
    const sm = req.testApiUser;
    const {
      amount,
      transaction_type = "upi",
      upi_id = "",
      account_name = "",
      account_number = "",
      ifsc_code = "",
      webhook_url = "",
      notes = "",
    } = req.body || {};
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0)
      return res.status(400).json({ success: false, message: "Valid amount required" });
    if (!["upi", "bank"].includes(transaction_type))
      return res.status(400).json({ success: false, message: "transaction_type must be 'upi' or 'bank'" });

    const mpClientId = Number(req.testApiUser.client_id);
    const txnId = crypto.randomBytes(12).toString("hex");
    const r = await pool.query(
      `INSERT INTO test_mode_withdrawals
         (transaction_id, merchant_id, client_id, amount, transaction_type,
          upi_id, account_name, account_number, ifsc_code, webhook_url, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
       RETURNING *`,
      [txnId, sm.merchant_id, mpClientId, numAmount, transaction_type,
       upi_id, account_name, account_number, ifsc_code, webhook_url, notes],
    );
    const created = r.rows[0];
    res.json({
      success:         true,
      transaction_id:  created.id,
      transaction_ref: created.transaction_id,
      amount:          numAmount,
      status:          "pending",
      created_at:      created.created_at,
    });
  } catch (err) {
    console.log("[TEST MODE] external withdrawal create error:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
});

// ── Submit UTR for test PayIn via dedicated MP Test API key ─────────────────
// Mirrors POST /api/masterpay-test/payin/submit-utr but uses test key auth.
// Body: { transaction_ref, utr_number, payment_proof? }
app.post("/api/test/payin/submit-utr", authenticateTestApiKey, async (req, res) => {
  try {
    const sm = req.testApiUser;
    const { transaction_ref, utr_number, payment_proof } = req.body || {};
    if (!transaction_ref)
      return res.status(400).json({ success: false, message: "transaction_ref required" });
    const cleanUtr = String(utr_number || "").trim();
    if (!cleanUtr)
      return res.status(400).json({ success: false, message: "utr_number required" });

    const existing = await pool.query(
      `SELECT * FROM test_mode_payins
       WHERE transaction_id = $1 AND merchant_id = $2 LIMIT 1`,
      [transaction_ref, sm.merchant_id],
    );
    if (!existing.rows.length)
      return res.status(404).json({ success: false, message: "Transaction not found" });

    const txn = existing.rows[0];
    if (txn.status === "Expired")
      return res.status(410).json({ success: false, message: "Transaction has expired" });
    if (txn.status === "Approved")
      return res.status(409).json({ success: false, message: "Transaction already approved" });
    if (!["Pending", "UTR Submitted"].includes(txn.status))
      return res.status(409).json({ success: false, message: `Cannot submit UTR in status: ${txn.status}` });

    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'UTR Submitted',
           utr_number = $1,
           payment_proof = $2,
           utr_submitted_at = NOW(),
           verification_expires_at = NOW() + ($3 || ' seconds')::INTERVAL
       WHERE transaction_id = $4 AND merchant_id = $5
       RETURNING *`,
      [cleanUtr, payment_proof || "", String(TEST_MODE_PAYIN_VERIFICATION_TTL),
       transaction_ref, sm.merchant_id],
    );
    const updated = r.rows[0];
    res.json({
      success:                         true,
      message:                         "UTR submitted. Waiting for agent to verify.",
      transaction_ref:                 updated.transaction_id,
      utr_number:                      cleanUtr,
      status:                          "UTR Submitted",
      remaining_seconds:               testModeRemainingSeconds(updated.expires_at),
      verification_remaining_seconds:  testModeRemainingSeconds(updated.verification_expires_at),
    });
  } catch (err) {
    console.log("[TEST MODE] external submit-utr error:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
});

// ── Get test PayIn status via dedicated MP Test API key ──────────────────────
// Mirrors GET /api/masterpay-test/payin/status but uses test key auth + path param.
app.get("/api/test/payin/status/:ref", authenticateTestApiKey, async (req, res) => {
  try {
    const sm  = req.testApiUser;
    const ref = String(req.params.ref || "").trim();
    if (!ref)
      return res.status(400).json({ success: false, message: "ref path parameter required" });

    const r = await pool.query(
      `SELECT * FROM test_mode_payins
       WHERE transaction_id = $1 AND merchant_id = $2 LIMIT 1`,
      [ref, sm.merchant_id],
    );
    if (!r.rows.length)
      return res.status(404).json({ success: false, message: "Transaction not found" });

    const row = r.rows[0];
    const settledAt = row.approved_or_reject_date
      ? new Date(row.approved_or_reject_date).toISOString()
      : null;
    res.json({
      success:                         true,
      transaction_ref:                 row.transaction_id,
      status:                          row.status,
      utr_number:                      row.utr_number || null,
      disputed_utr:                    row.disputed_utr || null,
      redirect_url:                    row.redirect_url || null,
      remaining_seconds:               testModeRemainingSeconds(row.expires_at),
      verification_remaining_seconds:  testModeRemainingSeconds(row.verification_expires_at),
      approved_at:  row.status === "Approved"  ? settledAt : null,
      expired_at:   row.status === "Expired"   ? settledAt : null,
      failed_at:    row.status === "Failed"    ? settledAt : null,
      disputed_at:  row.status === "Disputed"  ? settledAt : null,
    });
  } catch (err) {
    console.log("[TEST MODE] external payin status error:", err);
    res.status(500).json({ success: false, message: "Internal error" });
  }
});

// ── MASTERPAY TEST — public hosted checkout page (no auth, by transaction_ref) ─
// Mirrors the production /api/checkout/:ref hosted page, but reads/writes the
// isolated test_mode_payins table. Powers the React page at /test/checkout/:ref.
// No API key — these are customer-facing and identified solely by the opaque ref.
function buildTestCheckoutUrl(transactionRef) {
  return `${CHECKOUT_BASE_URL}/test/checkout/${transactionRef}`;
}

async function loadTestPayinByRef(ref) {
  const r = await pool.query(
    `SELECT * FROM test_mode_payins WHERE transaction_id = $1 LIMIT 1`,
    [String(ref || "").trim()],
  );
  return r.rows[0] || null;
}

app.get("/api/test/checkout/:ref", async (req, res) => {
  try {
    const txn = await loadTestPayinByRef(req.params.ref);
    if (!txn)
      return res.status(404).json({ success: false, message: "Checkout not found" });

    return res.json({
      success:           true,
      transaction_ref:   txn.transaction_id,
      merchant_order_id: txn.merchant_order_id,
      amount:            txn.amount,
      customer_name:     txn.customer_name || "",
      customer_mobile:   txn.customer_mobile || "",
      status:            txn.status,
      utr_number:        txn.utr_number || "",
      disputed_utr:      txn.disputed_utr || "",
      bank_details:      TEST_MODE_PAYIN_ACCOUNT,
      hide_app_buttons:  true, // test mode — Scan-QR + Copy-UPI only
      expires_at:        txn.expires_at,
      remaining_seconds: testModeRemainingSeconds(txn.expires_at),
      verification_expires_at:        txn.verification_expires_at,
      verification_remaining_seconds: testModeRemainingSeconds(txn.verification_expires_at),
    });
  } catch (error) {
    console.log("[TEST MODE] checkout get error:", error);
    return res.status(500).json({ success: false, message: "Could not fetch checkout" });
  }
});

app.get("/api/test/checkout/:ref/status", async (req, res) => {
  try {
    const txn = await loadTestPayinByRef(req.params.ref);
    if (!txn)
      return res.status(404).json({ success: false, message: "Checkout not found" });

    return res.json({
      success:           true,
      transaction_ref:   txn.transaction_id,
      status:            txn.status,
      utr_number:        txn.utr_number || "",
      disputed_utr:      txn.disputed_utr || "",
      redirect_url:      txn.redirect_url || "",
      remaining_seconds: testModeRemainingSeconds(txn.expires_at),
      verification_remaining_seconds: testModeRemainingSeconds(txn.verification_expires_at),
    });
  } catch (error) {
    console.log("[TEST MODE] checkout status error:", error);
    return res.status(500).json({ success: false, message: "Could not fetch status" });
  }
});

app.post("/api/test/checkout/:ref/submit-utr", async (req, res) => {
  try {
    const cleanUtr = String(req.body?.utr_number || "").trim();
    if (!cleanUtr)
      return res.status(400).json({ success: false, message: "utr_number is required" });

    const txn = await loadTestPayinByRef(req.params.ref);
    if (!txn)
      return res.status(404).json({ success: false, message: "Checkout not found" });
    if (txn.status === "Expired")
      return res.status(410).json({ success: false, message: "Checkout has expired" });
    if (txn.status === "Approved")
      return res.status(409).json({ success: false, message: "Transaction already approved" });
    if (!["Pending", "UTR Submitted"].includes(txn.status))
      return res.status(409).json({ success: false, message: `Cannot submit UTR — transaction is already ${txn.status}` });

    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'UTR Submitted',
           utr_number = $1,
           utr_submitted_at = NOW(),
           verification_expires_at = NOW() + ($2 || ' seconds')::INTERVAL
       WHERE transaction_id = $3
       RETURNING *`,
      [cleanUtr, String(TEST_MODE_PAYIN_VERIFICATION_TTL), txn.transaction_id],
    );
    const updated = r.rows[0];
    return res.json({
      success:         true,
      message:         "UTR submitted. Waiting for agent to verify.",
      transaction_ref: updated.transaction_id,
      utr_number:      cleanUtr,
      status:          "UTR Submitted",
      remaining_seconds:              testModeRemainingSeconds(updated.expires_at),
      verification_remaining_seconds: testModeRemainingSeconds(updated.verification_expires_at),
    });
  } catch (error) {
    console.log("[TEST MODE] checkout submit-utr error:", error);
    return res.status(500).json({ success: false, message: "Could not submit UTR" });
  }
});

app.post("/api/test/checkout/:ref/dispute", async (req, res) => {
  try {
    const cleanUtr = String(req.body?.utr_number || "").trim();
    if (!cleanUtr)
      return res.status(400).json({ success: false, message: "utr_number is required" });

    const txn = await loadTestPayinByRef(req.params.ref);
    if (!txn)
      return res.status(404).json({ success: false, message: "Checkout not found" });
    if (txn.status !== "Failed")
      return res.status(409).json({ success: false, message: "Dispute is only allowed after verification has failed" });

    const r = await pool.query(
      `UPDATE test_mode_payins
       SET status = 'Disputed', disputed_utr = $1, approved_or_reject_date = NOW()
       WHERE transaction_id = $2 AND status = 'Failed'
       RETURNING *`,
      [cleanUtr, txn.transaction_id],
    );
    if (!r.rows.length)
      return res.status(404).json({ success: false, message: "Not found or not in Failed status" });

    fireTestModePayinWebhook(r.rows[0], "payin.disputed").catch(() => {});
    return res.json({
      success:         true,
      message:         "Dispute submitted with your corrected UTR.",
      transaction_ref: txn.transaction_id,
      status:          "Disputed",
    });
  } catch (error) {
    console.log("[TEST MODE] checkout dispute error:", error);
    return res.status(500).json({ success: false, message: "Could not submit dispute" });
  }
});

// ── END MASTERPAY TEST MODE ───────────────────────────────────

function startDatabaseBackgroundJobs() {
  // Every database-dependent task is registered only after the full schema,
  // migrations, indexes, and seeds have completed successfully.
  setInterval(expirePendingTransactions, 60 * 1000);
  void expirePendingTransactions();

  // Overdue UTR alert scan — every 5 minutes is frequent enough that, at the
  // default 60-minute threshold, an alert goes out within 5 minutes of crossing
  // it, without re-querying the whole transactions table every request cycle.
  setInterval(scanOverdueUtrAlerts, 5 * 60 * 1000);
  void scanOverdueUtrAlerts();

  setInterval(pollSspayPendingWithdrawals, 90 * 1000);
  void pollSspayPendingWithdrawals();

  startLedgerSyncJob();
}

async function startServer() {
  try {
    await initializeDatabase();
    startDatabaseBackgroundJobs();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MasterPay startup aborted: database initialization did not complete.");
    console.error(error?.stack || error);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  }
}

void startServer();
