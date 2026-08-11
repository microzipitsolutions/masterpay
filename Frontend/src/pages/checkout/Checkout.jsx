import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { API_BASE_URL } from "../../config/apiConfig";

function buildUpiParams({ upiId, payeeName, amount, note, ref }) {
  // encodeURIComponent encodes spaces as %20 (not +) which UPI apps handle correctly.
  // @ must stay literal in the VPA — URLSearchParams would encode it as %40 which
  // some UPI apps don't decode, causing them to address an invalid VPA.
  const enc = (v) => encodeURIComponent(String(v)).replace(/%40/gi, "@");
  const parts = [`pa=${enc(upiId)}`];
  if (payeeName) parts.push(`pn=${enc(payeeName)}`);
  if (amount) parts.push(`am=${String(amount)}`);
  parts.push("cu=INR");
  if (note) parts.push(`tn=${enc(note)}`);
  // NOTE: intentionally NO `tr` (merchant transaction ref). These are individual
  // agent VPAs, not PSP-registered merchant VPAs — including `tr` makes apps
  // treat it as a P2M merchant payment, which a non-merchant VPA rejects ("failed").
  // Omitting it keeps a plain P2P intent that every UPI app accepts. We reconcile
  // by UTR + amount, so `ref` is not needed in the intent. (`ref` kept for callers.)
  void ref;
  return parts.join("&");
}

// Generic UPI URI used by the QR code.
function buildUpiUri({ upiId, payeeName, amount, note, ref }) {
  if (!upiId) return "";
  return `upi://pay?${buildUpiParams({ upiId, payeeName, amount, note, ref })}`;
}

const POLL_INTERVAL_MS = 3000;

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
      className="ml-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 underline"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="flex items-center">
        <span className="font-medium text-slate-900 text-sm break-all">{value}</span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

// Returns the UTR string only if it looks like an actual bank UTR reference.
// Guards against data where webhook_url was accidentally stored in utr_number.
function safeUtr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^https?:\/\//i.test(s) ? "" : s;
}

// Only ever redirect to an absolute http(s) URL — guards against empty/garbage
// values and blocks javascript: or other unsafe schemes from ever reaching
// window.location.replace.
function isValidRedirectUrl(v) {
  if (!v || typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function Checkout({ basePath = "/api/checkout" } = {}) {
  const { ref } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [utr, setUtr] = useState("");
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitUtr, setResubmitUtr] = useState("");
  const [disputeUtr, setDisputeUtr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [verificationRemaining, setVerificationRemaining] = useState(0);
  const pollTimer = useRef(null);
  const tickTimer = useRef(null);
  const hasRedirectedRef = useRef(false);

  const applyServerData = useCallback((j) => {
    // Merge rather than replace so a redirect_url learned from an earlier
    // response (e.g. the status poll) survives a later fetchCheckout() call
    // whose payload doesn't repeat it.
    setData((prev) => ({
      ...j,
      redirect_url: j.redirect_url || prev?.redirect_url || "",
    }));
    setRemaining(Number(j.remaining_seconds || 0));
    setVerificationRemaining(Number(j.verification_remaining_seconds || 0));
  }, []);

  const fetchCheckout = useCallback(async (silent = false) => {
    if (!ref) return;
    try {
      if (!silent) setLoading(true);
      const r = await fetch(`${API_BASE_URL}${basePath}/${encodeURIComponent(ref)}`);
      const j = await r.json();
      if (!r.ok || !j.success) {
        setError(j.message || "Could not load checkout");
        setData(null);
        return;
      }
      applyServerData(j);
      setError("");
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ref, basePath, applyServerData]);

  const fetchStatus = useCallback(async () => {
    if (!ref) return;
    try {
      const r = await fetch(`${API_BASE_URL}${basePath}/${encodeURIComponent(ref)}/status`);
      const j = await r.json();
      if (!r.ok || !j.success) return;
     setData((prev) =>
  prev
    ? {
        ...prev,
        status: j.status,
        utr_number: j.utr_number,
        disputed_utr: j.disputed_utr,
        remaining_seconds: j.remaining_seconds,
        verification_remaining_seconds: j.verification_remaining_seconds,
        redirect_url: j.redirect_url || prev.redirect_url,
      }
    : prev
);
      setRemaining(Number(j.remaining_seconds || 0));
      setVerificationRemaining(Number(j.verification_remaining_seconds || 0));
    } catch {
      /* network blip — keep going */
    }
  }, [ref, basePath]);

  useEffect(() => {
    fetchCheckout();
  }, [fetchCheckout]);

  // Local 1s countdown — drives both checkout and verification timers
  useEffect(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
      setVerificationRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => tickTimer.current && clearInterval(tickTimer.current);
  }, []);

  // Status polling — stop only on truly terminal states
 // Status polling — stop only on truly terminal states
useEffect(() => {
  if (!data) return;

  const terminal = ["Approved", "Expired", "Rejected"].includes(data.status);

  if (terminal) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    return;
  }

  if (pollTimer.current) clearInterval(pollTimer.current);

  pollTimer.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

  return () => pollTimer.current && clearInterval(pollTimer.current);
}, [data, fetchStatus]);

// Redirect once the transaction's final React state says Approved + a valid
// redirect_url is present — driven purely by state, not by which request
// (fetchCheckout vs fetchStatus poll) happened to detect the approval.
useEffect(() => {
  const detectedStatus = data?.status;
  const detectedRedirectUrl = data?.redirect_url;
  // TEMP: verify the fix — remove once confirmed in production.
  console.log("[Checkout] detected status:", detectedStatus, "redirect_url:", detectedRedirectUrl);

  if (detectedStatus !== "Approved" || !isValidRedirectUrl(detectedRedirectUrl)) return;

  // Let the "Payment verified" screen show briefly before navigating away.
  const redirectTimer = setTimeout(() => {
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    // TEMP: verify the fix — remove once confirmed in production.
    console.log("[Checkout] executing redirect to:", detectedRedirectUrl);
    window.location.replace(detectedRedirectUrl);
  }, 1500);

  return () => clearTimeout(redirectTimer);
}, [data?.status, data?.redirect_url]);
  // When either countdown hits 0, refresh so the page flips state without waiting for the next poll tick
  useEffect(() => {
    if (remaining === 0 && data && data.status === "Pending") fetchStatus();
  }, [remaining, data, fetchStatus]);
  useEffect(() => {
    if (verificationRemaining === 0 && data && data.status === "UTR Submitted") fetchStatus();
  }, [verificationRemaining, data, fetchStatus]);

  const postUtr = useCallback(async (endpoint, utrValue) => {
    const cleaned = String(utrValue).trim();
    if (!cleaned) {
      setSubmitError("Please enter the UTR number");
      return false;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const r = await fetch(`${API_BASE_URL}${basePath}/${encodeURIComponent(ref)}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utr_number: cleaned }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setSubmitError(j.message || "Could not submit");
        return false;
      }
      await fetchCheckout(true);
      return true;
    } catch (e2) {
      setSubmitError(e2.message || "Network error");
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [ref, basePath, fetchCheckout]);

  const submitUtr = async (e) => {
    e.preventDefault();
    await postUtr("submit-utr", utr);
  };

  const submitResubmit = async (e) => {
    e.preventDefault();
    const ok = await postUtr("submit-utr", resubmitUtr);
    if (ok) {
      setResubmitOpen(false);
      setResubmitUtr("");
    }
  };

  const submitDispute = async (e) => {
    e.preventDefault();
    await postUtr("dispute", disputeUtr);
  };

  const status = data?.status;
  const timerColor = useMemo(() => {
    if (remaining <= 30) return "text-red-600";
    if (remaining <= 60) return "text-amber-600";
    return "text-slate-900";
  }, [remaining]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading checkout…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Checkout unavailable</h1>
          <p className="text-sm text-slate-600">{error || "This payment link is invalid or has been removed."}</p>
        </div>
      </div>
    );
  }

  const showApproved = status === "Approved";
  const showExpired = status === "Expired" || status === "Rejected";
  const showVerifying = status === "UTR Submitted";
  const showFailed = status === "Failed";
  const showDisputed = status === "Disputed";
const showForm = status === "Pending";

  return (
    <div className="min-h-screen bg-white py-6 px-3 sm:px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white">
            <div className="text-xs uppercase tracking-wide opacity-80">Order</div>
            <div className="text-sm font-medium truncate">{data.merchant_order_id || data.transaction_ref}</div>
            <div className="mt-3 text-3xl font-bold">₹{Number(data.amount).toLocaleString("en-IN")}</div>
          </div>

          {showApproved && (
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-3xl mb-3">✓</div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Payment verified</h2>
              <p className="text-sm text-slate-600">Your payment has been confirmed.</p>
              {safeUtr(data.utr_number) && (
                <div className="mt-4 text-xs text-slate-500">UTR: <span className="font-mono text-slate-700">{safeUtr(data.utr_number)}</span></div>
              )}
            </div>
          )}

          {showExpired && (
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-3xl mb-3">×</div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Payment session expired</h2>
              <p className="text-sm text-slate-600">The 5-minute window has ended. If you have already paid, please contact the merchant with your UTR.</p>
            </div>
          )}

          {showVerifying && (
            <div className="p-6">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-2xl mb-3 animate-pulse">⏳</div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Verifying your payment…</h2>
                <p className="text-sm text-slate-600">We've received UTR <span className="font-mono">{safeUtr(data.utr_number) || "-"}</span>. Waiting for bank confirmation.</p>
                {verificationRemaining > 0 && (
                  <div className="mt-3 text-xs text-slate-500">
                    Verification window: <span className="font-mono">{formatMMSS(verificationRemaining)}</span>
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-500">This page will update automatically.</div>
              </div>

              {!resubmitOpen ? (
                <button
                  type="button"
                  onClick={() => setResubmitOpen(true)}
                  className="mt-5 w-full text-sm text-indigo-600 hover:text-indigo-800 underline"
                >
                  Submitted the wrong UTR? Correct it
                </button>
              ) : (
                <form onSubmit={submitResubmit} className="mt-5 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Enter the correct UTR
                  </label>
                  <input
                    type="text"
                    value={resubmitUtr}
                    onChange={(e) => setResubmitUtr(e.target.value)}
                    placeholder="e.g. 412345678901"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={submitting}
                  />
                  {submitError && (
                    <div className="mt-2 text-xs text-red-600">{submitError}</div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setResubmitOpen(false); setResubmitUtr(""); setSubmitError(""); }}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 rounded-lg"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !resubmitUtr.trim()}
                      className="flex-1 brand-gradient hover:brightness-[1.06] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg"
                    >
                      {submitting ? "Submitting…" : "Update UTR"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {showFailed && (
            <div className="p-6">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-3xl mb-3">×</div>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">We couldn't verify your payment</h2>
                <p className="text-sm text-slate-600">
                  The UTR you submitted didn't match our records within the verification window.
                </p>
                {safeUtr(data.utr_number) && (
                  <div className="mt-3 text-xs text-slate-500">Submitted UTR: <span className="font-mono">{safeUtr(data.utr_number)}</span></div>
                )}
              </div>

              <form onSubmit={submitDispute} className="mt-5 border-t border-slate-100 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Already paid? Enter your correct UTR for manual review
                </label>
                <input
                  type="text"
                  value={disputeUtr}
                  onChange={(e) => setDisputeUtr(e.target.value)}
                  placeholder="e.g. 412345678901"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={submitting}
                />
                {submitError && (
                  <div className="mt-2 text-xs text-red-600">{submitError}</div>
                )}
                <button
                  type="submit"
                  disabled={submitting || !disputeUtr.trim()}
                  className="mt-3 w-full brand-gradient hover:brightness-[1.06] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg"
                >
                  {submitting ? "Submitting…" : "Submit for manual review"}
                </button>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  An agent will verify your UTR against the bank statement. This may take a few hours.
                </p>
              </form>
            </div>
          )}

          {showDisputed && (
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl mb-3">⚖</div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Under manual review</h2>
              <p className="text-sm text-slate-600">
                We've received your corrected UTR. An agent will verify it against the bank statement and update this page.
              </p>
              {data.disputed_utr && (
                <div className="mt-4 text-xs text-slate-500">Correct UTR: <span className="font-mono text-slate-700">{data.disputed_utr}</span></div>
              )}
              {safeUtr(data.utr_number) && (
                <div className="mt-1 text-xs text-slate-400">Original UTR: <span className="font-mono">{safeUtr(data.utr_number)}</span></div>
              )}
            </div>
          )}

          {showForm && (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="text-sm text-slate-500">Time remaining</div>
                <div className={`text-2xl font-bold tabular-nums ${timerColor}`}>{formatMMSS(remaining)}</div>
              </div>

              {data.bank_details.upi_id && (() => {
                const upiUri = buildUpiUri({
                  upiId: data.bank_details.upi_id,
                  payeeName: data.bank_details.account_holder_name,
                  amount: data.amount,
                  note: data.merchant_order_id || data.transaction_ref,
                  ref: data.transaction_ref,
                });
                return (
                  <div className="px-5 py-6 sm:px-8">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3 text-center">Scan & Pay with any UPI app</h3>
                    <div className="flex justify-center">
                      <div className="w-full max-w-[232px] bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <QRCodeSVG value={upiUri} width="100%" height="auto" viewBox="0 0 256 256" level="M" includeMargin={false} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-center">
                      <span className="text-xs text-slate-500">UPI ID:</span>
                      <span className="ml-1 font-mono text-xs text-slate-900">{data.bank_details.upi_id}</span>
                      <CopyButton value={data.bank_details.upi_id} />
                    </div>
                  </div>
                );
              })()}

              <form onSubmit={submitUtr} className="px-5 py-4 border-t border-slate-100">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Enter UTR / Reference number after payment
                </label>
                <input
                  type="text"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value)}
                  placeholder="e.g. 412345678901"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={submitting}
                />
                {submitError && (
                  <div className="mt-2 text-xs text-red-600">{submitError}</div>
                )}
                <button
                  type="submit"
                  disabled={submitting || !utr.trim()}
                  className="mt-3 w-full brand-gradient hover:brightness-[1.06] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition"
                >
                  {submitting ? "Submitting…" : "I have paid — Submit UTR"}
                </button>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  The UTR is a 12-digit reference number from your bank's payment confirmation. Submitting a wrong UTR may delay verification.
                </p>
              </form>
            </>
          )}
        </div>

        {/* <div className="mt-4 text-center text-xs text-slate-400">
          Secured by MasterPay
        </div> */}
      </div>
    </div>
  );
}
