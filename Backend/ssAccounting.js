// Thin client for the SS Accounting / Ledger API (https://account.sspay.online/api/v1).
//
// MasterPay users are pushed as "parties" and money movements as "entries". An entry is a
// transfer from_party -> to_party; the ledger handles the double-entry internally.
// Everything here is best-effort: failures are returned (not thrown) so the ledger
// sync can never break MasterPay's own flow. Idempotency:
//   - parties  : the API returns the existing party if the name already exists.
//   - entries  : the API returns {status:"exists"} for a repeated external_ref.

// Read lazily so it works regardless of when dotenv.config() runs.
const baseUrl = () =>
  process.env.SSACCT_BASE_URL || "https://account.sspay.online/api/v1";
const username = () => process.env.SSACCT_USERNAME || "";
const password = () => process.env.SSACCT_PASSWORD || "";

function ssEnabled() {
  return Boolean(username() && password());
}

function authHeader() {
  const token = Buffer.from(`${username()}:${password()}`).toString("base64");
  return `Basic ${token}`;
}

async function ssRequest(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!r.ok)
      return { ok: false, status: r.status, data, error: data?.detail || `http_${r.status}` };
    return { ok: true, status: r.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

// Create (or no-op if it exists) a party.
async function ensureParty(partyname, opening_balance = 0) {
  return ssRequest("POST", "/parties", { partyname, opening_balance });
}

// Post a money-movement entry. amount in rupees, date "YYYY-MM-DD".
async function postEntry({ from_party, to_party, amount, date, remark, external_ref }) {
  return ssRequest("POST", "/entries", {
    from_party,
    to_party,
    amount,
    date,
    remark,
    external_ref,
  });
}

module.exports = { ssEnabled, ensureParty, postEntry, ssRequest, baseUrl };
