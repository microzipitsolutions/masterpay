// Mirrors Backend/server.js's UPI_ID_REGEX / isUpiFormatValid — keep in sync.
// Format-only check (username@bank); no VPA-existence provider is configured
// in this project, so this can never claim more than "well-formed".
export const UPI_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{1,49}@[a-zA-Z][a-zA-Z0-9.\-]{1,49}$/;

export function isValidUpiFormat(upiId) {
  return UPI_ID_REGEX.test(String(upiId || "").trim());
}

// Same upi://pay?pa=...&pn=...&cu=INR pattern already used for QR codes in
// Checkout.jsx / merchant/CreatePayin.jsx / merchant/PayinTransactions.jsx
// (a static deposit QR, so no amount/note/ref — just who to pay).
export function buildUpiUri({ upiId, payeeName }) {
  if (!upiId) return "";
  const enc = (v) => encodeURIComponent(String(v)).replace(/%40/gi, "@");
  const parts = [`pa=${enc(upiId)}`];
  if (payeeName) parts.push(`pn=${enc(payeeName)}`);
  parts.push("cu=INR");
  return `upi://pay?${parts.join("&")}`;
}
