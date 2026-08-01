'use strict';
/**
 * RDPay Sandbox API
 *
 * Intercepts all /api/* requests when req.isSandbox === true and returns
 * realistic mock responses.  Nothing is written to production tables;
 * no balances change; no agent queues are touched.
 *
 * Webhook simulation: the sandbox fires real HTTP POSTs to the merchant's
 * webhook_url so they can validate their webhook receiver end-to-end.
 * These are clearly identifiable as sandbox events via the "sandbox": true field.
 *
 * A request is identified as sandbox when:
 *   • req.hostname starts with "sandbox."  (production subdomain via nginx), OR
 *   • the header  x-rdpay-sandbox: 1       (local / CI / explicit override),  OR
 *   • the path contains a sandbox checkout ref (detected by server.js before
 *     routing — lets the hosted checkout page work without extra headers).
 */

const express = require('express');
const crypto  = require('crypto');
const pool    = require('./db');

const router = express.Router();

// ─── In-memory sandbox state ──────────────────────────────────────────────────
// Keyed by both numeric stringified ID and transaction_ref hex for flexible lookup.
const sbxPayins  = new Map();  // String(numericId) | txRef → payin record
const sbxPayouts = new Map();  // txId (24-char hex)        → payout record

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rndHex = (n) => crypto.randomBytes(n).toString('hex');
const rndInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo));
const rndUTR = () => String(rndInt(100_000_000_000, 999_999_999_999));
const nowIso = () => new Date().toISOString();

const SANDBOX_BANK = {
  bank_name:           'HDFC Bank (Sandbox)',
  ifsc_code:           'HDFC0001234',
  account_number:      '50200012345678',
  account_holder_name: 'Trust Pay Sandbox',
  upi_id:              'masterpay.sbx@hdfcbank',
};

// Checkout TTL in sandbox: 5 min (vs 15 min in production) for faster testing.
const SANDBOX_CHECKOUT_TTL_MS = 5 * 60 * 1000;

// ─── Webhook simulation ───────────────────────────────────────────────────────
// Fire-and-forget.  Logs result; never throws; swallows network errors.
async function fireWebhookSandbox(url, payload) {
  if (!url || !url.startsWith('http')) return;
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...payload, sandbox: true }),
      signal:  AbortSignal.timeout(5_000),
    });
    console.log(`[SANDBOX] webhook → ${url}  event=${payload.event}  http=${res.status}`);
  } catch (e) {
    console.warn(`[SANDBOX] webhook to ${url} failed:`, e.message);
  }
}

// Schedule payin auto-approval ~10 s after UTR submission and fire webhook.
function schedulePayinApproval(txn, utr) {
  setTimeout(() => {
    if (txn.status !== 'UTR Submitted') return; // already terminal
    txn.status                  = 'Approved';
    txn.utr_number              = utr || txn.utr_number;
    txn.approved_or_reject_date = nowIso();
    console.log(`[SANDBOX] payin auto-approved  id=${txn.id}`);

    if (txn.webhook_url) {
      fireWebhookSandbox(txn.webhook_url, {
        event:             'payin.approved',
        transaction_id:    txn.id,
        transaction_ref:   txn.transaction_id,
        merchant_order_id: txn.merchant_order_id,
        amount:            txn.amount,
        utr_number:        txn.utr_number,
        status:            'Approved',
        approved_at:       txn.approved_or_reject_date,
      });
    }
  }, 10_000);
}

// ─── Authentication ───────────────────────────────────────────────────────────

async function authPayin(req, res, next) {
  const key = String(req.headers['x-api-key'] || '').trim();
  if (!key)
    return res.status(401).json({ success: false, message: 'API key required' });
  try {
    const r = await pool.query(
      `SELECT merchant_id FROM sandbox_api_keys WHERE payin_key = $1 LIMIT 1`,
      [key],
    );
    if (!r.rows.length)
      return res.status(401).json({ success: false, message: 'Invalid sandbox API key' });
    req.sandboxMerchantId = r.rows[0].merchant_id;
    next();
  } catch (e) {
    console.error('[SANDBOX] payin auth error:', e.message);
    res.status(500).json({ success: false, message: 'Sandbox auth failed' });
  }
}

async function authWithdrawal(req, res, next) {
  const key = String(req.headers['api-key'] || req.headers['x-api-key'] || '').trim();
  if (!key)
    return res.status(401).json({ message: 'api-key header required', code: 401, data: {}, error: true });
  try {
    const r = await pool.query(
      `SELECT merchant_id FROM sandbox_api_keys WHERE withdrawal_key = $1 LIMIT 1`,
      [key],
    );
    if (!r.rows.length)
      return res.status(401).json({ message: 'Merchant does not exist', code: 400, data: {}, error: true });
    req.sandboxMerchantId = r.rows[0].merchant_id;
    next();
  } catch (e) {
    console.error('[SANDBOX] withdrawal auth error:', e.message);
    res.status(500).json({ message: 'Sandbox auth failed', code: 500, data: {}, error: true });
  }
}

// ─── POST /api/payin/create ───────────────────────────────────────────────────

router.post('/payin/create', authPayin, (req, res) => {
  const { merchant_order_id, amount, customer_name, customer_mobile, webhook_url, redirect_url } = req.body || {};
  const num = Number(amount);

  if (!merchant_order_id)
    return res.status(400).json({ success: false, message: 'merchant_order_id is required' });
  if (!num || num <= 0)
    return res.status(400).json({ success: false, message: 'Valid amount is required' });

  const id  = rndInt(10_000, 99_999);
  const ref = rndHex(12);

  const txn = {
    id,
    transaction_id:   ref,
    merchant_order_id,
    amount:           num,
    customer_name:    customer_name  || '',
    customer_mobile:  customer_mobile || '',
    status:           'Pending',
    utr_number:       '',
    webhook_url:      webhook_url  || '',
    redirect_url:     redirect_url || '',
    created_at:       nowIso(),
    ...SANDBOX_BANK,
  };

  sbxPayins.set(String(id), txn);
  sbxPayins.set(ref, txn);

  console.log(`[SANDBOX] payin/create  id=${id}  ref=${ref}`);

  return res.json({
    success:          true,
    transaction_id:   id,
    transaction_ref:  ref,
    merchant_order_id,
    amount:           num,
    status:           'Pending',
    bank_details:     SANDBOX_BANK,
  });
});

// ─── POST /api/payin/checkout/create ─────────────────────────────────────────

router.post('/payin/checkout/create', authPayin, (req, res) => {
  const { merchant_order_id, amount, customer_name, customer_mobile, webhook_url, redirect_url } = req.body || {};
  const num = Number(amount);

  if (!merchant_order_id)
    return res.status(400).json({ success: false, message: 'merchant_order_id is required' });
  if (!num || num <= 0)
    return res.status(400).json({ success: false, message: 'Valid amount is required' });

  const id        = rndInt(10_000, 99_999);
  const ref       = rndHex(12);
  const expiresAt = new Date(Date.now() + SANDBOX_CHECKOUT_TTL_MS).toISOString();

  const txn = {
    id,
    transaction_id:   ref,
    merchant_order_id,
    amount:           num,
    customer_name:    customer_name  || '',
    customer_mobile:  customer_mobile || '',
    status:           'Pending',
    utr_number:       '',
    webhook_url:      webhook_url  || '',
    redirect_url:     redirect_url || '',
    checkout_mode:    true,
    expires_at:       expiresAt,
    created_at:       nowIso(),
    ...SANDBOX_BANK,
  };

  sbxPayins.set(String(id), txn);
  sbxPayins.set(ref, txn);

  // Fire payin.expired webhook when the checkout TTL elapses (if still pending)
  if (txn.webhook_url) {
    setTimeout(() => {
      if (txn.status === 'Pending' || txn.status === 'UTR Submitted') {
        txn.status                  = 'Expired';
        txn.approved_or_reject_date = nowIso();
        console.log(`[SANDBOX] checkout expired  id=${txn.id}`);
        fireWebhookSandbox(txn.webhook_url, {
          event:             'payin.expired',
          transaction_id:    txn.id,
          transaction_ref:   txn.transaction_id,
          merchant_order_id: txn.merchant_order_id,
          amount:            txn.amount,
          status:            'Expired',
          expired_at:        txn.approved_or_reject_date,
        });
      }
    }, SANDBOX_CHECKOUT_TTL_MS);
  }

  const checkoutBase = (
    process.env.SANDBOX_CHECKOUT_URL || process.env.CHECKOUT_BASE_URL || 'http://localhost:5174'
  ).replace(/\/+$/, '');
  const checkoutUrl = `${checkoutBase}/checkout/${ref}`;

  console.log(`[SANDBOX] checkout/create  id=${id}  ref=${ref}`);

  return res.json({
    success:            true,
    transaction_id:     id,
    transaction_ref:    ref,
    merchant_order_id,
    amount:             num,
    status:             'Pending',
    checkout_url:       checkoutUrl,
    expires_at:         expiresAt,
    expires_in_seconds: Math.round(SANDBOX_CHECKOUT_TTL_MS / 1000),
  });
});

// ─── POST /api/payin/submit-utr ───────────────────────────────────────────────

router.post('/payin/submit-utr', authPayin, (req, res) => {
  const { transaction_id, utr_number } = req.body || {};

  if (!transaction_id || !utr_number)
    return res.status(400).json({ success: false, message: 'transaction_id and utr_number are required' });

  const utr = String(utr_number).trim();
  if (utr.length < 8)
    return res.status(400).json({ success: false, message: 'utr_number must be at least 8 characters' });

  const txn = sbxPayins.get(String(transaction_id));
  if (!txn)
    return res.status(404).json({ success: false, message: 'Transaction not found for this API key' });

  if (txn.status === 'Approved') {
    return res.json({
      success:           true,
      message:           'Transaction already approved',
      transaction_id:    txn.id,
      merchant_order_id: txn.merchant_order_id,
      utr_number:        txn.utr_number,
      status:            txn.status,
    });
  }

  txn.status           = 'UTR Submitted';
  txn.utr_number       = utr;
  txn.utr_submitted_at = nowIso();

  // Auto-approve after ~10 s and fire payin.approved webhook
  schedulePayinApproval(txn, utr);

  console.log(`[SANDBOX] submit-utr  id=${txn.id}  utr=${utr}`);

  return res.json({
    success:           true,
    message:           'UTR submitted successfully',
    transaction_id:    txn.id,
    merchant_order_id: txn.merchant_order_id,
    utr_number:        utr,
    status:            'UTR Submitted',
  });
});

// ─── GET /api/payin/status/:transactionId ─────────────────────────────────────

router.get('/payin/status/:transactionId', authPayin, (req, res) => {
  const input = String(req.params.transactionId).trim();
  const txn   = sbxPayins.get(input);

  if (!txn)
    return res.status(404).json({ success: false, message: 'Transaction not found for this API key' });

  return res.json({
    success: true,
    transaction: {
      id:                      txn.id,
      transaction_id:          txn.transaction_id,
      merchant_order_id:       txn.merchant_order_id,
      amount:                  txn.amount,
      customer_name:           txn.customer_name,
      customer_mobile:         txn.customer_mobile,
      utr_number:              txn.utr_number || '',
      status:                  txn.status,
      approved_or_reject_date: txn.approved_or_reject_date || null,
      created_at:              txn.created_at,
    },
  });
});

// ─── POST /api/withdrawal/payout-create ──────────────────────────────────────

router.post('/withdrawal/payout-create', authWithdrawal, (req, res) => {
  const { amount, transaction_type, upi_id, account_name, account_number, ifsc_code, webhookUrl } = req.body || {};
  const num = Number(amount);

  if (!num || num <= 0)
    return res.status(400).json({ message: 'Valid amount required', code: 400, data: {}, error: true });
  if (transaction_type !== 'upi' && transaction_type !== 'account')
    return res.status(400).json({ message: "transaction_type must be 'upi' or 'account'", code: 400, data: {}, error: true });
  if (transaction_type === 'upi' && !String(upi_id || '').trim())
    return res.status(400).json({ message: 'upi_id required for upi transaction_type', code: 400, data: {}, error: true });
  if (transaction_type === 'account' && (!account_number || !account_name || !ifsc_code))
    return res.status(400).json({ message: 'account_name, account_number, ifsc_code required for account transaction_type', code: 400, data: {}, error: true });

  const txnId  = rndHex(12);
  const payout = {
    transaction_id:           txnId,
    merchant_id:              req.sandboxMerchantId,
    amount:                   num,
    transaction_type,
    upi_id:                   upi_id         || '',
    account_name:             account_name   || '',
    account_number:           account_number || '',
    ifsc_code:                ifsc_code      || '',
    webhook_url:              webhookUrl     || '',
    status:                   'pending',
    utr_number:               null,
    webhook_fired:            false,
    created_at:               nowIso(),
    cleared_or_rejected_date: null,
  };

  sbxPayouts.set(txnId, payout);

  console.log(`[SANDBOX] payout-create  id=${txnId}  type=${transaction_type}  amount=${num}`);

  return res.json({
    message: 'Transaction Create Successfully',
    code:    200,
    data:    { transaction_id: txnId, status: 'pending' },
  });
});

// ─── GET /api/withdrawal/transactions/status ──────────────────────────────────

router.get('/withdrawal/transactions/status', authWithdrawal, (req, res) => {
  const { transactionId } = req.query;

  if (!transactionId)
    return res.status(400).json({ message: 'transactionId required', code: 400, data: {}, error: true });

  const p = sbxPayouts.get(String(transactionId));
  if (!p)
    return res.status(404).json({ message: 'Transaction does not exist', code: 400, data: {}, error: true });

  // Simulate status progression based on age of the transaction:
  //   0 – 5 s   → pending        (created, not yet picked)
  //   5 – 10 s  → picked         (agent is processing)
  //   10 – 20 s → utr_submitted  (agent paid, awaiting confirmation)
  //   > 20 s    → cleared        (completed, UTR assigned)
  const ageMs = Date.now() - new Date(p.created_at).getTime();
  if (ageMs > 20_000 && p.status !== 'rejected') {
    const isFirstClear = p.status !== 'cleared';
    p.status                    = 'cleared';
    p.utr_number              ??= rndUTR();
    p.cleared_or_rejected_date ??= nowIso();

    // Fire withdrawal webhook exactly once on first clear transition
    if (isFirstClear && !p.webhook_fired && p.webhook_url) {
      p.webhook_fired = true;
      fireWebhookSandbox(p.webhook_url, {
        event:                   'withdrawal.cleared',
        transaction_id:          p.transaction_id,
        amount:                  String(p.amount),
        status:                  'cleared',
        utr_number:              p.utr_number,
        cleared_at:              p.cleared_or_rejected_date,
      });
    }
  } else if (ageMs > 10_000 && (p.status === 'pending' || p.status === 'picked')) {
    p.status = 'utr_submitted';
  } else if (ageMs > 5_000 && p.status === 'pending') {
    p.status = 'picked';
  }

  return res.json({
    message: 'ok',
    code:    200,
    data: {
      transaction_id:           p.transaction_id,
      amount:                   String(p.amount),
      status:                   p.status,
      utr_number:               p.utr_number,
      transaction_type:         p.transaction_type,
      upi_id:                   p.upi_id         || null,
      account_name:             p.account_name   || null,
      account_number:           p.account_number || null,
      ifsc_code:                p.ifsc_code      || null,
      created_at:               p.created_at,
      cleared_or_rejected_date: p.cleared_or_rejected_date,
    },
  });
});

// ─── Checkout page endpoints (public, no API key required) ────────────────────
// These mirror the production /api/checkout/:ref handlers so the hosted checkout
// page works end-to-end for Mode B (Hosted Checkout) sandbox testing.
// They are activated by the isSandbox flag set in server.js when the request's
// :ref is found in sbxPayins.

// GET /api/checkout/:ref
router.get('/checkout/:ref', (req, res) => {
  const txn = sbxPayins.get(req.params.ref);
  if (!txn || !txn.checkout_mode)
    return res.status(404).json({ success: false, message: 'Checkout not found' });

  const remainingSecs = Math.max(0, Math.round(
    (new Date(txn.expires_at).getTime() - Date.now()) / 1000,
  ));

  return res.json({
    success:                          true,
    transaction_ref:                  txn.transaction_id,
    merchant_order_id:                txn.merchant_order_id,
    amount:                           txn.amount,
    customer_name:                    txn.customer_name,
    customer_mobile:                  txn.customer_mobile,
    status:                           txn.status,
    utr_number:                       txn.utr_number || '',
    disputed_utr:                     '',
    bank_details:                     SANDBOX_BANK,
    expires_at:                       txn.expires_at,
    remaining_seconds:                remainingSecs,
    verification_expires_at:          null,
    verification_remaining_seconds:   null,
  });
});

// POST /api/checkout/:ref/submit-utr
router.post('/checkout/:ref/submit-utr', (req, res) => {
  const txn = sbxPayins.get(req.params.ref);
  if (!txn || !txn.checkout_mode)
    return res.status(404).json({ success: false, message: 'Checkout not found' });

  const { utr_number } = req.body || {};
  if (!utr_number || !String(utr_number).trim())
    return res.status(400).json({ success: false, message: 'utr_number is required' });

  const utr = String(utr_number).trim();

  if (txn.status === 'Expired')
    return res.status(410).json({ success: false, message: 'Checkout has expired' });

  if (txn.status !== 'Pending' && txn.status !== 'UTR Submitted')
    return res.status(409).json({
      success: false,
      message: `Cannot submit UTR — transaction is already ${txn.status}`,
      status:  txn.status,
    });

  txn.status           = 'UTR Submitted';
  txn.utr_number       = utr;
  txn.utr_submitted_at = nowIso();

  schedulePayinApproval(txn, utr);

  const remainingSecs = Math.max(0, Math.round(
    (new Date(txn.expires_at).getTime() - Date.now()) / 1000,
  ));

  return res.json({
    success:                       true,
    message:                       'UTR submitted successfully',
    transaction_ref:               txn.transaction_id,
    utr_number:                    utr,
    status:                        txn.status,
    remaining_seconds:             remainingSecs,
    verification_remaining_seconds: 30,
  });
});

// GET /api/checkout/:ref/status
router.get('/checkout/:ref/status', (req, res) => {
  const txn = sbxPayins.get(req.params.ref);
  if (!txn || !txn.checkout_mode)
    return res.status(404).json({ success: false, message: 'Checkout not found' });

  const remainingSecs = Math.max(0, Math.round(
    (new Date(txn.expires_at).getTime() - Date.now()) / 1000,
  ));

  return res.json({
    success:                       true,
    transaction_ref:               txn.transaction_id,
    status:                        txn.status,
    utr_number:                    txn.utr_number || '',
    disputed_utr:                  '',
    redirect_url:                  txn.redirect_url || '',
    remaining_seconds:             remainingSecs,
    verification_remaining_seconds: txn.status === 'UTR Submitted' ? 30 : 0,
    approved_at: txn.status === 'Approved' ? txn.approved_or_reject_date : null,
    expired_at:  txn.status === 'Expired'  ? txn.approved_or_reject_date : null,
    failed_at:   null,
  });
});

// ─── Export ───────────────────────────────────────────────────────────────────

const sandboxMiddleware = (req, res, next) => {
  if (!req.isSandbox) return next();
  router(req, res, next);
};

// Called by server.js to auto-detect checkout page requests that belong to a
// sandbox transaction (the checkout page doesn't set x-rdpay-sandbox header).
sandboxMiddleware.hasSandboxRef = (ref) => {
  const txn = sbxPayins.get(ref);
  return !!(txn && txn.checkout_mode);
};

module.exports = sandboxMiddleware;
