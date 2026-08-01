import { useEffect, useState } from "react";
import { VIEWS, computeDateRange, todayYMD, currentMonthYM } from "../utils/dateViewFilter";

const fieldClass =
  "w-full sm:w-[180px] h-[44px] bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-[#2B7DE9] focus:border-[#2B7DE9]";
const labelClass = "block text-[12px] font-semibold text-[#172554] mb-2";

/**
 * Shared "View" filter for dashboard stat cards/charts/tables: Current Month
 * (default) / Specific Date / Specific Month / All Time. Owns its own
 * view/date/month selection state, and calls onChange({ view, startDate, endDate })
 * whenever the effective range changes (including once on mount, so the parent's
 * first fetch already uses the default range instead of firing unfiltered).
 */
export default function DateViewFilter({ onChange, className = "" }) {
  const [view, setView] = useState("current_month");
  const [date, setDate] = useState(() => todayYMD());
  const [month, setMonth] = useState(() => currentMonthYM());

  useEffect(() => {
    onChange?.({ view, ...computeDateRange(view, { date, month }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, month]);

  return (
    <div className={`flex flex-col sm:flex-row flex-wrap gap-3 ${className}`}>
      <div>
        <label className={labelClass}>View</label>
        <select value={view} onChange={(e) => setView(e.target.value)} className={fieldClass}>
          {VIEWS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>

      {view === "specific_date" && (
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
        </div>
      )}

      {view === "specific_month" && (
        <div>
          <label className={labelClass}>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={fieldClass} />
        </div>
      )}
    </div>
  );
}
