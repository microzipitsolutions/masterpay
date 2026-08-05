// Single status -> tone taxonomy shared across every table/status pill in the
// app (replaces ~19 duplicated ad hoc StatusBadge/getStatusClass implementations).
// Pass a known `tone` directly, or just pass `status` (any of the raw strings
// already used across pages — Approved/Pending/Rejected/Disputed/cleared/
// picked/utr_submitted/refunded/Active/Inactive/true/false/etc.) and the tone
// is inferred automatically.

const TONE_STYLES = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-brand-blue-dark",
  neutral: "bg-slate-100 text-slate-600",
  teal: "bg-brand-teal-light text-brand-teal-dark",
};

export function statusToTone(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (["approved", "success", "cleared", "active", "yes", "true", "completed", "resolved", "paid"].includes(s)) return "success";
  if (["pending", "picked", "processing", "utr submitted", "utr_submitted", "in review", "reviewing"].includes(s)) return "warning";
  if (["rejected", "failed", "expired", "inactive", "no", "false", "cancelled", "canceled"].includes(s)) return "danger";
  if (["disputed", "dispute"].includes(s)) return "info";
  if (["refunded"].includes(s)) return "teal";
  return "neutral";
}

export default function Badge({ tone, status, children, className = "" }) {
  const resolvedTone = tone || statusToTone(status);
  const label = children ?? status ?? "-";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${TONE_STYLES[resolvedTone] || TONE_STYLES.neutral} ${className}`}
    >
      {label}
    </span>
  );
}
