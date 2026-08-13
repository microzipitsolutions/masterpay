// Client-side mirror of validateUtr() in Backend/server.js. The server is the
// authority — this exists so a wrong length is caught in the form instead of
// coming back as a request error after the user has already submitted.
//
// Customers paste the reference wrapped in noise ("UTR-138320644088",
// "RRN 1383 2064 4088"), and the backend matches on a normalized form, so the
// digit count is taken after the same normalization rather than off the raw
// input. Keep this in step with the backend copy.
export const UTR_DIGITS = 12;

export function normalizeUtr(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^(utr|rrn|ref|txn|upi)[^a-z0-9]*/, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^t/, "");
}

// Returns an error message, or "" when the value is acceptable.
// Pass { required: false } where proof alone is enough but a supplied UTR
// still has to be well-formed.
export function utrError(value, { required = true } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return required ? "UTR number is required" : "";

  const normalized = normalizeUtr(raw);
  if (!/^\d+$/.test(normalized)) return `UTR must be exactly ${UTR_DIGITS} digits`;
  if (normalized.length !== UTR_DIGITS)
    return `UTR must be exactly ${UTR_DIGITS} digits — you entered ${normalized.length}`;

  return "";
}

export function isValidUtr(value, options) {
  return utrError(value, options) === "";
}
