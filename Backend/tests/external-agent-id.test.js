const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const pool = require("../db");

const FORMAT = /^MPAG_[A-F0-9]{24}$/;

after(async () => { await pool.end(); });

test("all existing agents have unique, valid public IDs", async () => {
  const r = await pool.query(`SELECT external_agent_id FROM agents`);
  const ids = r.rows.map(x => x.external_agent_id);
  assert.ok(ids.length > 0, "expected at least one existing agent");
  ids.forEach(id => assert.match(id, FORMAT));
  assert.equal(new Set(ids).size, ids.length);
});

test("new agents receive an external ID automatically and it is immutable", async () => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const admin = await db.query(`SELECT id,client_id FROM admins ORDER BY id LIMIT 1`);
    assert.ok(admin.rows.length, "expected a seeded admin");
    const suffix = crypto.randomBytes(6).toString("hex");
    const inserted = await db.query(
      `INSERT INTO agents(name,username,password,is_active,created_by_admin_id,client_id)
       VALUES($1,$2,'test-hash',true,$3,$4) RETURNING id,external_agent_id`,
      [`__external_id_test_${suffix}`, `__external_id_test_${suffix}`, admin.rows[0].id, admin.rows[0].client_id],
    );
    assert.match(inserted.rows[0].external_agent_id, FORMAT);
    await assert.rejects(
      db.query(`UPDATE agents SET external_agent_id=$1 WHERE id=$2`, [`MPAG_${"A".repeat(24)}`, inserted.rows[0].id]),
      /external_agent_id is immutable/,
    );
    await db.query("ROLLBACK");
  } finally { db.release(); }
});
