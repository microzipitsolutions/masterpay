-- Agent commission integrity + in-app Admin alerts for wallet top-up requests.
-- Idempotent — safe to run multiple times and on both fresh and existing
-- databases. Mirrors (and is a no-op after) the equivalent inline
-- CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS statements that also
-- run automatically on every backend boot inside initializeDatabase() in
-- Backend/server.js — this file exists so the same DDL can be applied/reviewed
-- standalone (e.g. by an ops runbook) without starting the app server.

BEGIN;

-- ─── Agent commission snapshot on Pay-In transactions ──────────────────────
-- Freezes the agent's commission rate/amount at the moment a transaction
-- becomes Approved, so a later edit to agents.commission_percent cannot
-- retroactively change historical dashboard/report totals.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_commission_percent NUMERIC(8,4);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS agent_commission_amount NUMERIC(18,2);

CREATE OR REPLACE FUNCTION freeze_agent_commission_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  rate NUMERIC;
BEGIN
  IF NEW.status = 'Approved' AND (OLD.status IS DISTINCT FROM 'Approved') AND NEW.agent_id IS NOT NULL THEN
    SELECT commission_percent INTO rate FROM agents WHERE id = NEW.agent_id;
    NEW.agent_commission_percent := COALESCE(rate, 0);
    NEW.agent_commission_amount := ROUND(NEW.amount * COALESCE(rate, 0) / 100.0, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_freeze_agent_commission ON transactions;
CREATE TRIGGER trg_freeze_agent_commission
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION freeze_agent_commission_on_approval();

-- One-time backfill for rows already Approved before this migration — freezes
-- them at the agent's current rate (best available approximation, since no
-- historical rate table exists) so they stop drifting from this point on.
-- Guarded by `agent_commission_amount IS NULL`, so safe to re-run.
UPDATE transactions t
SET agent_commission_percent = COALESCE(a.commission_percent, 0),
    agent_commission_amount = ROUND(t.amount * COALESCE(a.commission_percent, 0) / 100.0, 2)
FROM agents a
WHERE a.id = t.agent_id
  AND t.status = 'Approved'
  AND t.agent_commission_amount IS NULL;

-- ─── In-app Admin alerts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(40) NOT NULL,
  related_type VARCHAR(30) NOT NULL,
  related_id INTEGER NOT NULL,
  admin_id INTEGER REFERENCES admins(id),
  client_id INTEGER REFERENCES clients(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_url TEXT,
  agent_name VARCHAR(150),
  usdt_amount NUMERIC(18,6),
  inr_amount NUMERIC(18,2),
  usdt_rate NUMERIC(18,6),
  commission_amount NUMERIC(18,2),
  reference VARCHAR(100),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_alerts_related
  ON admin_alerts (alert_type, related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread ON admin_alerts(is_read, created_at DESC);

COMMIT;
