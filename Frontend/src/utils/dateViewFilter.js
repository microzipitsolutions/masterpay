// Date-range math backing the shared DateViewFilter component. Split into its own
// module (rather than living in DateViewFilter.jsx) so that file can stick to a
// single component export, which react-refresh/Fast Refresh requires.
const pad = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function currentMonthRange() {
  const now = new Date();
  return { startDate: toYMD(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toYMD(now) };
}

function monthRange(monthStr) {
  if (!monthStr) return { startDate: "", endDate: "" };
  const [y, m] = monthStr.split("-").map(Number);
  return {
    startDate: toYMD(new Date(y, m - 1, 1)),
    endDate: toYMD(new Date(y, m, 0)), // day 0 of next month = last day of this month
  };
}

export const VIEWS = [
  { value: "current_month", label: "Current Month" },
  { value: "specific_date", label: "Specific Date" },
  { value: "specific_month", label: "Specific Month" },
  { value: "all_time", label: "All Time" },
];

export function computeDateRange(view, { date, month } = {}) {
  if (view === "current_month") return currentMonthRange();
  if (view === "specific_date") return { startDate: date || "", endDate: date || "" };
  if (view === "specific_month") return monthRange(month || "");
  return { startDate: "", endDate: "" }; // all_time
}

export function todayYMD() {
  return toYMD(new Date());
}

export function currentMonthYM() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}
