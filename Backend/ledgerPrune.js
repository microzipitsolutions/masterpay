// One-time cleanup: remove ledger entries (and try the parties) that belong to admins
// OTHER than SSACCT_ADMIN_ID from the SS Accounting ledger, then drop their local
// ledger_sync markers so the scoped sync won't treat them as already-posted.
//
// Run on the server:  cd /root/MasterPay/Backend && node ledgerPrune.js
//
// Safe to re-run. Deletes are idempotent (a missing entry just returns not-found).

require("dotenv").config();
const pool = require("./db");
const { ssRequest } = require("./ssAccounting");

const ADMIN = Number(process.env.SSACCT_ADMIN_ID);

// Each money kind: the ledger_sync refs to KEEP belong to ADMIN; everything else is pruned.
const KINDS = [
  {
    kind: "payin",
    sql: `SELECT ls.external_ref FROM ledger_sync ls
            JOIN transactions t ON ls.external_ref = 'payin-' || t.id
           WHERE ls.kind = 'payin' AND COALESCE(t.created_by_admin_id,0) <> $1`,
  },
  {
    kind: "payin-commission",
    sql: `SELECT ls.external_ref FROM ledger_sync ls
            JOIN transactions t ON ls.external_ref = 'paycomm-' || t.id
           WHERE ls.kind = 'payin-commission' AND COALESCE(t.created_by_admin_id,0) <> $1`,
  },
  {
    kind: "withdrawal",
    sql: `SELECT ls.external_ref FROM ledger_sync ls
            JOIN withdrawal_transactions w ON ls.external_ref = 'wd-' || w.id
            LEFT JOIN merchants m ON m.id = w.merchant_id
           WHERE ls.kind = 'withdrawal' AND COALESCE(m.created_by_admin_id,0) <> $1`,
  },
  {
    kind: "payout-commission",
    sql: `SELECT ls.external_ref FROM ledger_sync ls
            JOIN withdrawal_transactions w ON ls.external_ref = 'wdcomm-' || w.id
            LEFT JOIN merchants m ON m.id = w.merchant_id
           WHERE ls.kind = 'payout-commission' AND COALESCE(m.created_by_admin_id,0) <> $1`,
  },
  {
    kind: "settlement",
    sql: `SELECT ls.external_ref FROM ledger_sync ls
            JOIN settlement_transactions st ON ls.external_ref = 'settle-' || st.id
            LEFT JOIN merchants m ON m.id = st.merchant_id
           WHERE ls.kind = 'settlement' AND COALESCE(m.created_by_admin_id,0) <> $1`,
  },
  {
    kind: "tracking-withdrawal",
    sql: `SELECT ls.external_ref FROM ledger_sync ls
            JOIN agent_account_withdrawals ow ON ls.external_ref = 'trkwd-' || ow.id
            JOIN agent_accounts oa ON oa.id = ow.account_id
            LEFT JOIN agents o ON o.id = oa.agent_id
           WHERE ls.kind = 'tracking-withdrawal' AND COALESCE(o.created_by_admin_id,0) <> $1`,
  },
];

const partyName = (name, username) => {
  const n = String(name || "").trim() || "Unknown";
  const u = String(username || "").trim();
  return u ? `${n} (@${u})` : n;
};

async function main() {
  if (!ADMIN) {
    console.error("SSACCT_ADMIN_ID not set — refusing to prune (would target everything).");
    process.exit(1);
  }
  console.log(`Pruning ledger of everything NOT belonging to admin ${ADMIN}...`);

  let deletedEntries = 0;
  for (const k of KINDS) {
    const { rows } = await pool.query(k.sql, [ADMIN]);
    if (rows.length) console.log(`  ${k.kind}: ${rows.length} non-admin entries to remove`);
    for (const r of rows) {
      const ref = r.external_ref;
      const res = await ssRequest("DELETE", `/entries/${encodeURIComponent(ref)}`);
      // Treat both a successful delete and a not-found as "gone".
      if (res.ok || res.status === 404) {
        await pool.query(`DELETE FROM ledger_sync WHERE external_ref = $1`, [ref]);
        deletedEntries++;
      } else {
        console.log(`    ! failed to delete ${ref}: ${res.error || res.status}`);
      }
    }
  }

  // Try to remove non-admin parties (best-effort; the API may not support party delete).
  let triedParties = 0, deletedParties = 0;
  const tables = [
    { kind: "merchant", table: "merchants" },
    { kind: "agent", table: "agents" },
    { kind: "agent", table: "agents" },
    { kind: "merchant", table: "merchants" },
  ];
  for (const t of tables) {
    const { rows } = await pool.query(
      `SELECT id, name, username FROM ${t.table} WHERE COALESCE(created_by_admin_id,0) <> $1`,
      [ADMIN],
    );
    for (const u of rows) {
      const name = partyName(u.name, u.username);
      triedParties++;
      const enc = encodeURIComponent(name);
      let res = await ssRequest("DELETE", `/parties/${enc}`);
      // A party that still has rows returns 409 — force it (our non-RD parties are
      // already empty, so this is just a safety net).
      if (!res.ok && res.status === 409) {
        res = await ssRequest("DELETE", `/parties/${enc}?force=true`);
      }
      if (res.ok) {
        deletedParties++;
        await pool.query(`DELETE FROM ledger_sync WHERE external_ref = $1`, [`party:${t.kind}:${u.id}`]);
      } else {
        console.log(`    ! could not delete party "${name}": ${res.error || res.status}`);
      }
    }
  }

  console.log(`\nDone. Removed ${deletedEntries} entries.`);
  console.log(
    deletedParties > 0
      ? `Deleted ${deletedParties}/${triedParties} non-admin parties.`
      : `Party delete not supported by API (${triedParties} non-admin parties left empty — harmless).`,
  );
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("Prune error:", e.message);
  process.exit(1);
});
