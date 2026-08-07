BEGIN;

CREATE TABLE IF NOT EXISTS trustpay_external_merchant_assignments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  external_merchant_id TEXT NOT NULL,
  external_merchant_code TEXT,
  external_merchant_name TEXT NOT NULL,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  webhook_url TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, external_merchant_id)
);
CREATE INDEX IF NOT EXISTS idx_tp_assignments_agent ON trustpay_external_merchant_assignments(agent_id, is_active);

CREATE TABLE IF NOT EXISTS trustpay_external_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  external_merchant_id TEXT,
  external_transaction_id TEXT,
  agent_id INTEGER,
  request_digest TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, event_type, idempotency_key)
);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_assignment_id BIGINT REFERENCES trustpay_external_merchant_assignments(id) ON DELETE RESTRICT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_tenant_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_merchant_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_transaction_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_payload JSONB;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_proof_metadata JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tp_transactions_unique ON transactions(external_tenant_id, external_transaction_id)
  WHERE external_tenant_id IS NOT NULL AND external_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tp_transactions_assignment ON transactions(external_assignment_id, id DESC);

COMMIT;
