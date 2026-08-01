// Mirrors Backend/server.js's EMAIL_REGEX / isEmailFormatValid — keep in sync.
// Deliberately simple/pragmatic (not full RFC 5322) — backend is authoritative.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email) {
  return EMAIL_REGEX.test(String(email || "").trim());
}
