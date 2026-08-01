require("dotenv").config();
const pool = require("./db");
(async () => {
  for (const t of ["merchants", "agents", "admins"]) {
    const r = await pool.query(`SELECT id, name, username, client_id FROM ${t} WHERE LOWER(username)='sam'`);
    if (r.rows.length) {
      console.log(`${t}:`);
      for (const x of r.rows) {
        let extra = "";
        if (t === "merchants") {
          const tx = await pool.query(`SELECT COUNT(*) c FROM transactions WHERE merchant_id=$1`, [x.id]);
          const ag = await pool.query(`SELECT agent_id, commission_percent, is_active FROM merchants WHERE id=$1`, [x.id]);
          extra = ` | txns=${tx.rows[0].c} agent=${ag.rows[0].agent_id} comm=${ag.rows[0].commission_percent} active=${ag.rows[0].is_active}`;
        }
        console.log(`   id=${x.id} | name=${x.name} | username=${x.username} | client=${x.client_id}${extra}`);
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
