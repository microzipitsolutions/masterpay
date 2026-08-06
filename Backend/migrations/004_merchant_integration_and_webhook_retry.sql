-- Merchant integration config (external platforms as MasterPay merchants,
-- e.g. TrustPay) + webhook delivery retry bookkeeping.
-- Idempotent — safe to run multiple times and on both fresh and existing
-- databases. Mirrors (and is a no-op after) the equivalent inline
-- CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS statements that also
-- run automatically on every backend boot inside initializeDatabase() in
-- Backend/server.js — this file exists so the same DDL can be applied/reviewed
-- standalone (e.g. by an ops runbook) without starting the app server.
--
-- Purely additive. Does NOT generate or write any credential — every new
-- column here is nullable/defaulted, and merchant_integration_configs has no
-- rows until an authorized Admin/Super Admin explicitly creates one through
-- the "Merchant API Integration" admin page. Absence of a row for a merchant
-- leaves that merchant's Pay-In/Pay-Out auth and webhook delivery completely
-- unchanged from current production behaviour.

BEGIN;

-- ─── Merchant integration config ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_integration_configs (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER UNIQUE NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  webhook_signing_secret TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  allowed_webhook_domains TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  webhook_secret_created_at TIMESTAMPTZ,
  webhook_secret_regenerated_at TIMESTAMPTZ,
  payin_key_regenerated_at TIMESTAMPTZ,
  payout_key_regenerated_at TIMESTAMPTZ,
  last_modified_by_role VARCHAR(20),
  last_modified_by_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_merchant_integration_configs_merchant
  ON merchant_integration_configs(merchant_id);

-- ─── Webhook delivery retry bookkeeping ─────────────────────────────────────
-- Additive on the existing Pay-In/Pay-Out transaction tables. webhook_sent /
-- webhook_response (both tables, pre-existing) keep being written exactly as
-- before; these columns let a background sweep retry failed deliveries.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_next_retry_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_last_attempt_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_delivered_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_delivery_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS webhook_last_error TEXT;

ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS webhook_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS webhook_next_retry_at TIMESTAMPTZ;
ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS webhook_last_attempt_at TIMESTAMPTZ;
ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS webhook_delivered_at TIMESTAMPTZ;
ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS webhook_delivery_id TEXT;
ALTER TABLE withdrawal_transactions ADD COLUMN IF NOT EXISTS webhook_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_webhook_retry
  ON transactions(webhook_next_retry_at) WHERE webhook_delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawal_transactions_webhook_retry
  ON withdrawal_transactions(webhook_next_retry_at) WHERE webhook_delivered_at IS NULL;

COMMIT;
