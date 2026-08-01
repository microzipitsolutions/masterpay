const path = require("path");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");

// SMTP credentials/connection details live only in env vars (never in the
// DB) — mirrors the split already used for DB_* in db.js. Recipients and
// alert rules (thresholds, enable/disable, reminder interval) are the part
// that changes at runtime from the Super Admin panel and live in Postgres
// instead (see alert_recipients / alert_settings in server.js).
let transporter = null;

// Resolved relative to this file (not process.cwd()), and re-read on every
// call rather than once at module load — a long-running process (nodemon,
// or a manually started `node server.js` left over from before .env had
// SMTP_* set) must not get permanently stuck with whatever was true the
// first time getTransporter() ran.
function loadSmtpEnv() {
  dotenv.config({
    path: path.resolve(__dirname, ".env"),
    override: true,
  });
}

// Lazy — only builds (and caches) a transporter once SMTP_HOST/USER/PASSWORD
// are all actually present. Never caches a "not configured" result: if the
// env vars are missing this throws every time instead of memoizing `null`,
// so fixing .env and retrying (without a restart) works immediately.
function getTransporter() {
  loadSmtpEnv();

  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  // Gmail App Passwords are displayed as "abcd efgh ijkl mnop" with spaces
  // for readability — spaces are not part of the actual 16-character secret
  // and must be stripped, or Gmail's SMTP server rejects the AUTH attempt.
  const password = String(process.env.SMTP_PASSWORD || "")
    .replace(/\s/g, "")
    .trim();

  if (!host) {
    throw new Error("SMTP is not configured (SMTP_HOST env var missing)");
  }
  if (!user) {
    throw new Error("SMTP_USER env var is missing");
  }
  if (!password) {
    throw new Error("SMTP_PASSWORD env var is missing");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: { user, pass: password },
    });
  }

  return transporter;
}

function isSmtpConfigured() {
  loadSmtpEnv();
  return Boolean(
    String(process.env.SMTP_HOST || "").trim() &&
      String(process.env.SMTP_USER || "").trim() &&
      String(process.env.SMTP_PASSWORD || "").trim(),
  );
}

// Small bounded retry (3 attempts, exponential backoff) for transient SMTP
// failures (connection reset, greeting timeout, etc.) — callers still wrap
// this in their own try/catch since a permanent failure (bad recipient,
// auth failure, SMTP not configured at all) must still surface so it gets
// logged as a failed alert attempt rather than retried forever.
async function sendMailWithRetry({ to, subject, html, text }, attempts = 3) {
  const smtpTransporter = getTransporter();

  const from =
    String(process.env.SMTP_FROM || "").trim() ||
    `"MasterPay Alerts" <${process.env.SMTP_USER}>`;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await smtpTransporter.sendMail({ from, to, subject, html, text });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError;
}

module.exports = { sendMailWithRetry, isSmtpConfigured };
