BEGIN;
ALTER TABLE company_wallet_configs ADD COLUMN IF NOT EXISTS usdt_rate NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE agent_topup_requests
  ADD COLUMN IF NOT EXISTS usdt_amount NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS usdt_rate NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS commission_percent NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS final_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS notes TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_topups_admin_ledger ON agent_topup_requests(created_by_admin_id, submitted_at DESC, status);
COMMIT;
