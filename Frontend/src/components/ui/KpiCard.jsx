// Gradient-accent stat tile for dashboards. `tone="brand"` uses the full
// navy->blue->teal gradient for the single most important metric on a page;
// `tone="light"` (default) keeps a white card with a colored icon chip so a
// row of several KPIs doesn't turn into a wall of gradient.
export default function KpiCard({ label, value, icon: Icon, tone = "light", trend, subtext }) {
  if (tone === "brand") {
    return (
      <div className="relative overflow-hidden rounded-card p-5 sm:p-6 text-white shadow-card bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full brand-gradient opacity-30 blur-2xl" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{label}</p>
            <p className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight">{value}</p>
            {subtext && <p className="mt-1 text-xs text-white/50">{subtext}</p>}
          </div>
          {Icon && (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl brand-gradient shadow-lg">
              <Icon size={20} className="text-white" />
            </div>
          )}
        </div>
        {trend && <div className="relative mt-3 text-xs font-semibold text-brand-teal-light">{trend}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-slate-200 bg-white p-5 sm:p-6 shadow-card transition hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-navy-900">{value}</p>
          {subtext && <p className="mt-1 text-xs text-slate-400">{subtext}</p>}
        </div>
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue-light text-brand-blue-dark">
            <Icon size={20} />
          </div>
        )}
      </div>
      {trend && <div className="mt-3 text-xs font-semibold text-success">{trend}</div>}
    </div>
  );
}
