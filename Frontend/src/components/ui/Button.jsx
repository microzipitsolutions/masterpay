import { Loader2 } from "lucide-react";

const VARIANTS = {
  primary:
    "text-white brand-gradient shadow-[0_4px_14px_rgba(30,136,255,0.35)] hover:brightness-[1.06] active:brightness-95",
  secondary:
    "bg-white text-navy-900 border border-slate-200 hover:bg-slate-50 hover:border-slate-300",
  ghost:
    "bg-transparent text-navy-800 hover:bg-slate-100",
  danger:
    "bg-white text-danger border border-red-200 hover:bg-danger-bg",
  dangerSolid:
    "text-white bg-danger hover:brightness-95",
};

const SIZES = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  children,
  icon: Icon,
  type = "button",
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-control font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}
