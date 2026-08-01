import { useBranding } from "../context/BrandingContext";

export default function Logo() {
  const { company_name, logo_url, theme_color } = useBranding();

  const initials = (company_name || "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "P";

  return (
    <div className="flex items-center gap-3">
      {logo_url ? (
        <img
          src={logo_url}
          alt={company_name}
          className="w-11 h-11 rounded-xl object-contain"
        />
      ) : (
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, ${theme_color}cc, ${theme_color})`,
            boxShadow: `0 4px 14px ${theme_color}55`,
          }}
        >
          <span className="text-white text-base font-bold">{initials}</span>
        </div>
      )}
      <div className="flex flex-col gap-0">
        <span
          className="text-2xl font-bold leading-none tracking-tight"
          style={{ color: theme_color }}
        >
          {company_name}
        </span>
        <span className="text-[11px] font-medium tracking-widest text-slate-400">
          PAYMENTS
        </span>
      </div>
    </div>
  );
}
