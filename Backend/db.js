const { Pool, types } = require("pg");
require("dotenv").config();

// PostgreSQL OID 1114 is `timestamp without time zone`. The application and
// database write those values in UTC, but node-postgres otherwise parses them
// in the host's local timezone. That made fresh checkout/verification expiry
// timestamps appear four hours old on Asia/Dubai hosts. Keep the existing
// schema and make the UTC convention explicit at the database boundary.
types.setTypeParser(1114, (value) => new Date(`${value.replace(" ", "T")}Z`));

// Pool sizing and timeouts. The stock defaults are `max: 10` with
// `connectionTimeoutMillis: 0` — an unbounded wait. Once the pool saturated,
// every further request queued forever instead of failing, so load spikes
// presented as "the site is down" rather than "the site is slow". Each value
// below is overridable per-environment.
//
// DB_POOL_MAX must stay under Postgres `max_connections` divided by the number
// of app instances (check with: SHOW max_connections;).
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  max: Number(process.env.DB_POOL_MAX) || 20,
  // Fail fast when the pool is saturated: the caller gets a 500 it can retry
  // instead of holding a socket open indefinitely.
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,

  // Server-side caps so a single pathological query cannot pin a connection
  // for the life of the process. `idle_in_transaction_session_timeout` is the
  // backstop for a BEGIN whose COMMIT/ROLLBACK was lost on an error path.
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 15000,
  idle_in_transaction_session_timeout:
    Number(process.env.DB_IDLE_TX_TIMEOUT_MS) || 30000,
});

// A pooled client can emit an error while idle (server restart, network drop).
// Without this listener that error is an unhandled 'error' event, which takes
// the whole process down — pg removes the bad client from the pool by itself.
pool.on("error", (err) => {
  console.log("Idle PostgreSQL client error", err.message);
});

pool.connect((err, client) => {
  if (err) {
    console.log("Database connection error", err);
  } else {
    console.log("PostgreSQL Connected");
    client.release();
  }
});

module.exports = pool;
