// Pure helper functions for the merchant-integration webhook hardening
// (signing, URL validation, retry backoff). No DB access here on purpose —
// keeps this module trivially unit-testable and reusable from both the
// Pay-In and Pay-Out code paths without them sharing any formatting logic.
const crypto = require("crypto");

// Bounded exponential backoff schedule in seconds: 1, 2, 5, 10, 30, 60 minutes.
// `attempt` is 1-indexed (the attempt number that just failed); returns the
// delay before the next attempt. Attempts beyond the schedule length reuse
// the last (largest) delay rather than growing further.
const BACKOFF_SCHEDULE_SECONDS = [60, 120, 300, 600, 1800, 3600];

function computeBackoffSeconds(attempt) {
  const index = Math.max(1, Number(attempt) || 1) - 1;
  const clampedIndex = Math.min(index, BACKOFF_SCHEDULE_SECONDS.length - 1);
  return BACKOFF_SCHEDULE_SECONDS[clampedIndex];
}

// Only http/https with a non-empty hostname are accepted. Rejects
// javascript:, file:, data:, and any other scheme — closes the SSRF/unsafe-
// redirect surface on webhook_url/redirect_url/webhookUrl without requiring
// any existing merchant to change anything (a non-http(s) URL has never been
// deliverable via fetch() in this codebase anyway).
function isSafeHttpUrl(value) {
  if (!value || typeof value !== "string") return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!parsed.hostname) return false;
  return true;
}

// Optional per-merchant allowlist check. `allowedDomains` is
// merchant_integration_configs.allowed_webhook_domains — null/empty means no
// restriction (the default for every merchant, including all pre-existing
// ones). Matches exact hostname or a "*.example.com" wildcard-suffix entry.
function isAllowedWebhookDomain(url, allowedDomains) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) return true;
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedDomains.some((entry) => {
    const domain = String(entry || "").toLowerCase().trim();
    if (!domain) return false;
    if (domain.startsWith("*.")) return hostname.endsWith(domain.slice(1));
    return hostname === domain;
  });
}

// Signs the exact raw body string that will be sent — callers must sign the
// same string they POST, not a re-serialization of the payload object.
function signPayload(secret, rawBody) {
  return crypto.createHmac("sha256", String(secret)).update(String(rawBody)).digest("hex");
}

function generateWebhookSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function generateDeliveryId() {
  return crypto.randomUUID();
}

module.exports = {
  BACKOFF_SCHEDULE_SECONDS,
  computeBackoffSeconds,
  isSafeHttpUrl,
  isAllowedWebhookDomain,
  signPayload,
  generateWebhookSecret,
  generateDeliveryId,
};
