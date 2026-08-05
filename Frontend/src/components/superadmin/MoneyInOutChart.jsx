import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import MetricInfoTooltip from "./MetricInfoTooltip";

const MONEY_IN_COLOR = "#2a78d6";
const MONEY_OUT_COLOR = "#eb6834";

const todayYMD = () => new Date().toISOString().slice(0, 10);
const daysAgoYMD = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function niceMax(value) {
  if (value <= 0) return 10;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  const niceNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return niceNorm * base;
}

function rollup(days, granularity) {
  if (granularity === "day") {
    return days.map((d) => ({ bucket: d.day, money_in: d.money_in, money_out: d.money_out }));
  }
  const map = new Map();
  for (const d of days) {
    let key;
    if (granularity === "week") {
      const date = new Date(d.day + "T00:00:00Z");
      const dow = date.getUTCDay();
      const diffToMonday = (dow + 6) % 7;
      const monday = new Date(date);
      monday.setUTCDate(date.getUTCDate() - diffToMonday);
      key = monday.toISOString().slice(0, 10);
    } else {
      key = d.day.slice(0, 7);
    }
    const cur = map.get(key) || { bucket: key, money_in: 0, money_out: 0 };
    cur.money_in += d.money_in;
    cur.money_out += d.money_out;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function bucketLabel(bucket, granularity) {
  if (granularity === "month") {
    const [y, m] = bucket.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  const d = new Date(bucket + "T00:00:00");
  const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return granularity === "week" ? `Wk ${label}` : label;
}

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function MoneyInOutChart() {
  const [granularity, setGranularity] = useState("day");
  const [customStart, setCustomStart] = useState(daysAgoYMD(30));
  const [customEnd, setCustomEnd] = useState(todayYMD());
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverIdx, setHoverIdx] = useState(null);

  const range = useMemo(() => {
    if (granularity === "custom") return { startDate: customStart, endDate: customEnd };
    if (granularity === "week") return { startDate: daysAgoYMD(84), endDate: todayYMD() };
    if (granularity === "month") return { startDate: daysAgoYMD(180), endDate: todayYMD() };
    return { startDate: daysAgoYMD(30), endDate: todayYMD() };
  }, [granularity, customStart, customEnd]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get("/api/superadmin/money-flow", { params: range });
        if (!cancelled) setDays(res.data?.days || []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || "Could not load money flow");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range.startDate, range.endDate]);

  const buckets = useMemo(
    () => rollup(days, granularity === "custom" ? "day" : granularity),
    [days, granularity],
  );

  const width = 800, height = 280;
  const padL = 56, padR = 16, padT = 16, padB = 32;
  const innerW = width - padL - padR, innerH = height - padT - padB;

  const maxVal = niceMax(Math.max(1, ...buckets.map((b) => Math.max(b.money_in, b.money_out))));
  const xFor = (i) => (buckets.length <= 1 ? padL : padL + (i / (buckets.length - 1)) * innerW);
  const yFor = (v) => padT + innerH - (v / maxVal) * innerH;

  const linePath = (key) =>
    buckets.map((b, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(b[key])}`).join(" ");
  const areaPath = (key) => {
    if (buckets.length === 0) return "";
    const top = buckets.map((b, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(b[key])}`).join(" ");
    return `${top} L ${xFor(buckets.length - 1)} ${yFor(0)} L ${xFor(0)} ${yFor(0)} Z`;
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => maxVal * f);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-navy-900 flex items-center">
          Money In vs Money Out
          <MetricInfoTooltip formula="Money In = sum of Approved Pay-Ins per period. Money Out = sum of cleared Withdrawals + Approved Settlements per period." />
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {["day", "week", "month", "custom"].map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                granularity === g ? "bg-[#1E88FF] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {g}
            </button>
          ))}
          {granularity === "custom" && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-2 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: MONEY_IN_COLOR }} /> Money In</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: MONEY_OUT_COLOR }} /> Money Out</span>
      </div>

      {error && <div className="text-sm text-red-600 py-6">{error}</div>}
      {loading && !error && <div className="text-sm text-slate-400 py-6">Loading...</div>}

      {!loading && !error && (
        buckets.length === 0 ? (
          <div className="text-sm text-slate-400 py-6 text-center">No activity in this range</div>
        ) : (
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full"
              style={{ minWidth: 480 }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {gridLines.map((g, i) => (
                <g key={i}>
                  <line x1={padL} x2={width - padR} y1={yFor(g)} y2={yFor(g)} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={padL - 8} y={yFor(g) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                    {g >= 1000 ? `${Math.round(g / 1000)}k` : Math.round(g)}
                  </text>
                </g>
              ))}

              <path d={areaPath("money_in")} fill={MONEY_IN_COLOR} opacity="0.1" />
              <path d={areaPath("money_out")} fill={MONEY_OUT_COLOR} opacity="0.1" />
              <path d={linePath("money_in")} fill="none" stroke={MONEY_IN_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={linePath("money_out")} fill="none" stroke={MONEY_OUT_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

              {buckets.map((b, i) => (
                <g key={i}>
                  <circle cx={xFor(i)} cy={yFor(b.money_in)} r="3" fill="#fff" stroke={MONEY_IN_COLOR} strokeWidth="2" />
                  <circle cx={xFor(i)} cy={yFor(b.money_out)} r="3" fill="#fff" stroke={MONEY_OUT_COLOR} strokeWidth="2" />
                  <rect
                    x={xFor(i) - (innerW / buckets.length) / 2}
                    y={padT}
                    width={Math.max(4, innerW / buckets.length)}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIdx(i)}
                  />
                  {i % labelEvery === 0 && (
                    <text x={xFor(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="#94a3b8">
                      {bucketLabel(b.bucket, granularity === "custom" ? "day" : granularity)}
                    </text>
                  )}
                </g>
              ))}

              {hoverIdx !== null && buckets[hoverIdx] && (
                <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={padT} y2={padT + innerH} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3,3" />
              )}
            </svg>

            {hoverIdx !== null && buckets[hoverIdx] && (
              <div className="mt-2 inline-flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-700">{bucketLabel(buckets[hoverIdx].bucket, granularity === "custom" ? "day" : granularity)}</span>
                <span style={{ color: MONEY_IN_COLOR }}>In: {money(buckets[hoverIdx].money_in)}</span>
                <span style={{ color: MONEY_OUT_COLOR }}>Out: {money(buckets[hoverIdx].money_out)}</span>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default MoneyInOutChart;
