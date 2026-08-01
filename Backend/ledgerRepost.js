// One-time migration: re-post payins and tracking withdrawals so the BANK becomes the
// counter-party (Bank -> Merchant for payins, Agent -> Bank for tracking withdrawals).
//
// It deletes the existing payin-* / trkwd-* entries (DELETE /entries removes BOTH linked
// rows, so the ledger stays balanced) and drops their local markers. The running ledger
// sync then re-posts them with the new bank counter-party on its next ticks.
//
// Run on the server:  cd /root/MasterPay/Backend && node ledgerRepost.js

require("dotenv").config();
const pool = require("./db");
const { ssRequest, ssEnabled } = require("./ssAccounting");

async function main() {
  if (!ssEnabled()) {
    console.error("SS Accounting not configured.");
    process.exit(1);
  }
  const { rows } = await pool.query(
    `SELECT external_ref FROM ledger_sync WHERE kind IN ('payin','tracking-withdrawal','bank-transfer') ORDER BY external_ref`,
  );
  console.log(`Re-posting ${rows.length} bank entries (payin/tracking/transfer) with updated bank names...`);

  let removed = 0;
  for (const r of rows) {
    const ref = r.external_ref;
    const res = await ssRequest("DELETE", `/entries/${encodeURIComponent(ref)}`);
    if (res.ok || res.status === 404) {
      await pool.query(`DELETE FROM ledger_sync WHERE external_ref = $1`, [ref]);
      removed++;
    } else {
      console.log(`  ! failed to delete ${ref}: ${res.error || res.status}`);
    }
  }
  console.log(`Removed ${removed} old entries. The sync will re-post them as Bank->Merchant / Agent->Bank.`);
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("Repost error:", e.message);
  process.exit(1);
});
