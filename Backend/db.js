const { Pool, types } = require("pg");
require("dotenv").config();

// PostgreSQL OID 1114 is `timestamp without time zone`. The application and
// database write those values in UTC, but node-postgres otherwise parses them
// in the host's local timezone. That made fresh checkout/verification expiry
// timestamps appear four hours old on Asia/Dubai hosts. Keep the existing
// schema and make the UTC convention explicit at the database boundary.
types.setTypeParser(1114, (value) => new Date(`${value.replace(" ", "T")}Z`));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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
