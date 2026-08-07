BEGIN;

ALTER TABLE agents ADD COLUMN IF NOT EXISTS external_agent_id VARCHAR(37);

UPDATE agents
SET external_agent_id = 'MPAG_' || UPPER(SUBSTRING(MD5(id::text || ':' || clock_timestamp()::text || ':' || random()::text), 1, 24))
WHERE external_agent_id IS NULL OR BTRIM(external_agent_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_external_agent_id ON agents(external_agent_id);
ALTER TABLE agents ALTER COLUMN external_agent_id SET DEFAULT ('MPAG_' || UPPER(SUBSTRING(MD5(clock_timestamp()::text || ':' || random()::text), 1, 24)));
ALTER TABLE agents ALTER COLUMN external_agent_id SET NOT NULL;

CREATE OR REPLACE FUNCTION prevent_external_agent_id_change() RETURNS trigger AS $$
BEGIN
  IF OLD.external_agent_id IS DISTINCT FROM NEW.external_agent_id THEN
    RAISE EXCEPTION 'external_agent_id is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agents_external_agent_id_immutable ON agents;
CREATE TRIGGER trg_agents_external_agent_id_immutable BEFORE UPDATE OF external_agent_id ON agents
FOR EACH ROW EXECUTE FUNCTION prevent_external_agent_id_change();

COMMIT;
