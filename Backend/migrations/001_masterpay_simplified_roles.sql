-- MasterPay role-model migration (fresh databases only).
-- Run after the backend has initialized the clean schema once.
-- This migration intentionally does not import or reinterpret legacy TrustPay data.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.operators') IS NOT NULL
     OR to_regclass('public.operator_accounts') IS NOT NULL
     OR to_regclass('public.sub_merchants') IS NOT NULL THEN
    RAISE EXCEPTION
      'Legacy role tables detected. Use a brand-new MasterPay database; this migration does not migrate TrustPay role data.';
  END IF;
END $$;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS singleton_key SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM admins) > 1 THEN
    RAISE EXCEPTION 'MasterPay requires exactly one Admin; found % rows', (SELECT COUNT(*) FROM admins);
  END IF;
END $$;

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_singleton_key_check;
ALTER TABLE admins
  ADD CONSTRAINT admins_singleton_key_check CHECK (singleton_key = 1);
CREATE UNIQUE INDEX IF NOT EXISTS uq_masterpay_single_admin
  ON admins (singleton_key);

-- Former Sub-Merchant integration credentials now belong to Merchant.
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS token TEXT;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS api_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchants_api_key
  ON merchants (api_key) WHERE api_key IS NOT NULL;

-- Former Operator-owned resources now point directly to Agent.
ALTER TABLE agent_accounts
  ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE agent_wallets
  ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE agent_topup_requests
  ALTER COLUMN agent_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_accounts_agent
  ON agent_accounts (agent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_agent
  ON transactions (merchant_id, agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlements_merchant_agent
  ON settlement_transactions (merchant_id, agent_id, created_at DESC);

COMMIT;
