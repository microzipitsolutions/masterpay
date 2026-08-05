import { useBranding } from "../context/BrandingContext";

// `variant="dark"` is for placement on the navy sidebar background; the
// default `variant="light"` is for white surfaces (login/signup cards).
// This distinction matters because the MasterPay wordmark's "Master" half
// is rendered in a solid brand color that must invert per-surface, or it
// blends into a same-color background and disappears.
export default function Logo({ variant = "light", size = "md" }) {
  const { company_name, logo_url, theme_color } = useBranding();

  const initials = (company_name || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "P";

  // Default MasterPay wordmark: solid "Master" + a blue->teal gradient "Pay",
  // matching the Stripe/Linear style of a purely typographic mark. White-label
  // tenants with their own logo_url/company_name still render as before —
  // only the no-logo MasterPay default changes visually.
  const isMasterPay = !logo_url && company_name === "MasterPay";
  const isDark = variant === "dark";
  const isLg = size === "lg";

  const iconSize = isLg ? "w-12 h-12" : "w-10 h-10";
  const wordmarkSize = isLg ? "text-2xl" : "text-xl";
  const subtitleColor = isDark ? "text-white/40" : "text-slate-400";
  const masterColor = isDark ? "text-white" : "text-navy-900";

  return (
    <div className="flex items-center gap-3 min-w-0">
      {logo_url ? (
        <img
          src={logo_url}
          alt={company_name}
          className={`${iconSize} rounded-xl object-contain shrink-0`}
        />
      ) : !isMasterPay ? (
        <div
          className={`${iconSize} rounded-xl flex items-center justify-center shrink-0`}
          style={{
            background: `linear-gradient(135deg, ${theme_color}cc, ${theme_color})`,
            boxShadow: `0 4px 14px ${theme_color}55`,
          }}
        >
          <span className="text-white text-base font-bold">{initials}</span>
        </div>
      ) : (
        <div
          className={`${iconSize} rounded-xl flex items-center justify-center shrink-0 brand-gradient`}
          style={{ boxShadow: "0 4px 14px rgba(30,136,255,0.35)" }}
        >
          <span className="text-white text-lg font-extrabold tracking-tight">M</span>
        </div>
      )}
      <div className="flex flex-col gap-0.5 min-w-0">
        {isMasterPay ? (
          <span className={`${wordmarkSize} font-extrabold leading-none tracking-tight whitespace-nowrap ${masterColor}`}>
            Master<span className="brand-gradient-text">Pay</span>
          </span>
        ) : (
          <span
            className={`${wordmarkSize} font-bold leading-none tracking-tight truncate`}
            style={{ color: isDark ? "#ffffff" : theme_color }}
            title={company_name}
          >
            {company_name}
          </span>
        )}
        <span className={`text-[10px] font-semibold tracking-widest whitespace-nowrap ${subtitleColor}`}>
          PAYMENTS
        </span>
      </div>
    </div>
  );
}
