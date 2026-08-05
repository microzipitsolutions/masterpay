export default function Card({ className = "", padded = true, hover = false, children, ...rest }) {
  return (
    <div
      className={`rounded-card border border-slate-200 bg-white shadow-card ${hover ? "transition hover:shadow-card-hover" : ""} ${padded ? "p-5 sm:p-6" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, className = "" }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div>
        <h3 className="text-base font-bold text-navy-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
