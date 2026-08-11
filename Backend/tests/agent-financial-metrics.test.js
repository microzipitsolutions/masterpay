const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const pool = require("../db");

after(async () => { await pool.end(); });

test("pending routing capacity is separate from approved agent financial metrics", async () => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const owner = (await db.query(`SELECT id, client_id FROM admins ORDER BY id LIMIT 1`)).rows[0];
    assert.ok(owner, "expected a seeded admin");
    const suffix = crypto.randomBytes(5).toString("hex");
    const agent = (await db.query(
      `INSERT INTO agents(name,username,password,is_active,max_payment_limit,commission_percent,created_by_admin_id,client_id)
       VALUES($1,$1,'test',true,1000000,2,$2,$3) RETURNING id`,
      [`__metric_test_${suffix}`, owner.id, owner.client_id],
    )).rows[0];
    const account = (await db.query(
      `INSERT INTO agent_accounts(agent_id,bank_name,account_number,account_holder_name,is_active,max_payment_limit,min_transaction_amount,created_by_admin_id,client_id)
       VALUES($1,'Test Bank',$2,'Test',true,1000000,0,$3,$4) RETURNING id`,
      [agent.id, `metric-${suffix}`, owner.id, owner.client_id],
    )).rows[0];

    const addPayin = async (amount, status) => (await db.query(
      `INSERT INTO transactions(transaction_id,amount,status,agent_id,account_id,created_by_admin_id,client_id)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [crypto.randomBytes(8).toString("hex"), amount, status, agent.id, account.id, owner.id, owner.client_id],
    )).rows[0];
    const pendingIds = [];
    for (let i = 0; i < 11; i += 1) pendingIds.push((await addPayin(100000, "Pending")).id);

    const metrics = async () => (await db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status IN ('Approved','Success')),0)::numeric AS collected,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('Pending','UTR Submitted')),0)::numeric AS in_flight,
         COUNT(*) FILTER (WHERE status IN ('Approved','Success'))::int AS successful_count
       FROM transactions WHERE agent_id=$1`, [agent.id],
    )).rows[0];
    let m = await metrics();
    assert.equal(Number(m.collected), 0);
    assert.equal(Number(m.in_flight), 1100000);
    assert.equal(m.successful_count, 0);
    const accountReserved = (await db.query(
      `SELECT COALESCE(SUM(amount),0) AS amount FROM transactions
       WHERE account_id=$1 AND status IN ('Approved','Success','Pending','UTR Submitted')`,
      [account.id],
    )).rows[0];
    assert.equal(Number(accountReserved.amount), 1100000, "per-account routing safety must retain in-flight reservations");

    await db.query(`UPDATE transactions SET status='Approved' WHERE id=$1`, [pendingIds[0]]);
    await db.query(`UPDATE transactions SET status='Expired' WHERE id=$1`, [pendingIds[1]]);
    await db.query(`UPDATE transactions SET status='Rejected' WHERE id=$1`, [pendingIds[2]]);
    await db.query(`UPDATE transactions SET status='Failed' WHERE id=$1`, [pendingIds[3]]);
    await db.query(`UPDATE transactions SET status='UTR Submitted' WHERE id=$1`, [pendingIds[4]]);
    await db.query(`UPDATE transactions SET status='Approved' WHERE id=$1`, [pendingIds[4]]);
    m = await metrics();
    assert.equal(Number(m.collected), 200000);
    assert.equal(m.successful_count, 2);
    assert.equal(Number(m.in_flight), 600000);

    await db.query(
      `INSERT INTO settlement_transactions(amount,transaction_status,agent_id,created_by_admin_id,client_id)
       VALUES(50000,'Approved',$1,$2,$3)`, [agent.id, owner.id, owner.client_id],
    );
    await db.query(`INSERT INTO agent_wallets(agent_id,available_balance) VALUES($1,300000) ON CONFLICT(agent_id) DO UPDATE SET available_balance=EXCLUDED.available_balance`, [agent.id]);
    await db.query(
      `INSERT INTO agent_wallet_ledger(agent_id,entry_type,amount,balance_after,reference_type,reference_id,created_by_role)
       VALUES($1,'TOPUP_CREDIT',300000,300000,'test',$2,'system')`, [agent.id, agent.id],
    );
    const flows = (await db.query(
      `SELECT
        (SELECT SUM(amount) FROM settlement_transactions WHERE agent_id=$1 AND transaction_status='Approved') AS settled,
        (SELECT SUM(amount) FROM agent_wallet_ledger WHERE agent_id=$1 AND entry_type='TOPUP_CREDIT') AS topped_up`,
      [agent.id],
    )).rows[0];
    assert.equal(Number(flows.settled), 50000);
    assert.equal(Number(flows.topped_up), 300000);
    assert.equal(Math.max(Number(m.collected) - Number(flows.settled), 0), 150000);
    assert.equal(Number(flows.topped_up) - Number(m.collected), 100000);

    await db.query("ROLLBACK");
  } finally {
    db.release();
  }
});
