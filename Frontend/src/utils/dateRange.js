// Inclusive date-range check in the browser's LOCAL timezone (IST for these users).
//
// startDate / endDate come from <input type="date"> as "YYYY-MM-DD". The bug we're
// fixing: `new Date("2026-06-04")` parses as UTC midnight, and comparing `<= that`
// excluded the whole selected day — so picking the same from/to date showed nothing.
//
// Here we build the day bounds with an explicit time ("T00:00:00" / "T23:59:59.999")
// so they parse in LOCAL (IST) time, and the end bound covers the full day. A row's
// timestamp (UTC, e.g. "...Z") is turned into a Date, which is the correct instant,
// then compared against the local-day window.
export function inLocalDateRange(value, startDate, endDate) {
  if (!startDate && !endDate) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  if (startDate) {
    const s = new Date(`${startDate}T00:00:00`).getTime();
    if (t < s) return false;
  }
  if (endDate) {
    const e = new Date(`${endDate}T23:59:59.999`).getTime();
    if (t > e) return false;
  }
  return true;
}
