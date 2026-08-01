import { useState, useEffect } from "react";
import { Download, Calendar, Eye, FileText, FileSpreadsheet } from "lucide-react";
import { API_BASE_URL } from "../config/apiConfig";

const PAGE_SIZE = 25;

const ENTITY_ENDPOINTS = {
  merchant: "/api/merchants",
  agent: "/api/agents",
};

function buildHeaders() {
  const token = localStorage.getItem("rdpay_token") || "";
  const role = localStorage.getItem("rdpay_role") || "";
  const userInfo = JSON.parse(localStorage.getItem("rdpay_user_info") || "{}");
  const headers = {
    Authorization: `Bearer ${token}`,
    role,
    userid: String(userInfo?.id || userInfo?.userId || ""),
  };
  if (userInfo?.agentId || userInfo?.agent_id) headers.agentid = String(userInfo.agentId || userInfo.agent_id);
  if (userInfo?.merchantId || userInfo?.merchant_id) headers.merchantid = String(userInfo.merchantId || userInfo.merchant_id);
  return { headers, role };
}

function fmtCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleString();
  }
  return String(v);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function PaginatedTable({ title, rows, selectedColumns }) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [rows]);

  if (!rows || rows.length === 0) {
    return (
      <div className="mb-6">
        <div className="text-sm font-semibold text-slate-700 mb-2">{title}</div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">No data in this range.</div>
      </div>
    );
  }

  const allColumns = Object.keys(rows[0]);
  const columns = selectedColumns
    ? selectedColumns.filter((c) => allColumns.includes(c))
    : allColumns;
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-700">{title} <span className="text-slate-400 font-normal">({rows.length})</span></div>
        {pageCount > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">Prev</button>
            <span>Page {page + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={start + i} className="border-t border-slate-100 hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c} className="px-3 py-2 text-slate-700 whitespace-nowrap">{fmtCell(r[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DailyReportContent() {
  const today = new Date().toISOString().substring(0, 10);
  const sevenAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().substring(0, 10);

  // Default to month-to-date (1st of current month → today) so the report opens on MTD.
  const monthStart = today.substring(0, 8) + "01";
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const isAdmin = (localStorage.getItem("rdpay_role") || "") === "admin";
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [entityOptions, setEntityOptions] = useState([]);
  const [entityLoading, setEntityLoading] = useState(false);

  // Admin column picker — which payin/withdrawal columns to include (null = all).
  const [payinCols, setPayinCols] = useState(null);
  const [wdCols, setWdCols] = useState(null);
  const availPayinCols = report?.payins?.length ? Object.keys(report.payins[0]) : [];
  const availWdCols = report?.withdrawals?.length ? Object.keys(report.withdrawals[0]) : [];

  const toggleCol = (which, col) => {
    const [sel, setSel] = which === "payin" ? [payinCols, setPayinCols] : [wdCols, setWdCols];
    const avail = which === "payin" ? availPayinCols : availWdCols;
    const current = sel || avail;
    const next = current.includes(col)
      ? current.filter((c) => c !== col)
      : avail.filter((c) => c === col || current.includes(c)); // keep original order
    setSel(next);
  };

  const presets = [
    { label: "Today", start: today, end: today },
    { label: "Yesterday", start: new Date(Date.now() - 86400 * 1000).toISOString().substring(0, 10), end: new Date(Date.now() - 86400 * 1000).toISOString().substring(0, 10) },
    { label: "Last 7 days", start: sevenAgo, end: today },
    { label: "Last 30 days", start: new Date(Date.now() - 30 * 86400 * 1000).toISOString().substring(0, 10), end: today },
    { label: "This month", start: today.substring(0, 8) + "01", end: today },
  ];

  // Load entity options when the admin picks a type.
  useEffect(() => {
    setEntityId("");
    setEntityOptions([]);
    if (!isAdmin || !entityType) return;
    let cancelled = false;
    (async () => {
      setEntityLoading(true);
      try {
        const { headers } = buildHeaders();
        const r = await fetch(`${API_BASE_URL}${ENTITY_ENDPOINTS[entityType]}`, { headers });
        const data = await r.json().catch(() => []);
        if (!cancelled) setEntityOptions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setEntityOptions([]);
      } finally {
        if (!cancelled) setEntityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entityType, isAdmin]);

  const entityQuery = () =>
    isAdmin && entityType && entityId
      ? `&entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`
      : "";

  const validate = () => {
    if (!startDate || !endDate) { setError("Pick both start and end dates"); return false; }
    if (startDate > endDate) { setError("Start date must be before end date"); return false; }
    setError("");
    return true;
  };

  const viewReport = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const { headers } = buildHeaders();
      const r = await fetch(
        `${API_BASE_URL}/api/daily-report/data?start_date=${startDate}&end_date=${endDate}${entityQuery()}`,
        { headers },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Failed to load report");
      }
      const data = await r.json();
      setReport(data);
      // Default to all available (non-ID) columns on each fresh load.
      setPayinCols(data.payins?.length ? Object.keys(data.payins[0]) : null);
      setWdCols(data.withdrawals?.length ? Object.keys(data.withdrawals[0]) : null);
    } catch (e) {
      setError(e.message || "Could not load report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  // Column-selection query params for downloads (admin picker only).
  const colsQuery = () => {
    let q = "";
    if (isAdmin && payinCols && availPayinCols.length && payinCols.length < availPayinCols.length)
      q += `&payin_cols=${encodeURIComponent(payinCols.join(","))}`;
    if (isAdmin && wdCols && availWdCols.length && wdCols.length < availWdCols.length)
      q += `&wd_cols=${encodeURIComponent(wdCols.join(","))}`;
    return q;
  };

  const downloadXlsx = async () => {
    if (!validate()) return;
    setDownloading(true);
    try {
      const { headers } = buildHeaders();
      const r = await fetch(
        `${API_BASE_URL}/api/daily-report/download?start_date=${startDate}&end_date=${endDate}${entityQuery()}${colsQuery()}`,
        { headers },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Failed to download");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-report-${startDate}-to-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const entityLabel = () => {
    if (!isAdmin || !entityType || !entityId) return "";
    const opt = entityOptions.find((o) => String(o.id) === String(entityId));
    const name = opt?.name || `#${entityId}`;
    return `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}: ${name}`;
  };

  const downloadPdf = () => {
    if (!report) { setError("Click View first to load the report, then download PDF"); return; }
    const tableHtml = (title, rows, selected) => {
      if (!rows || rows.length === 0) return `<h2>${escapeHtml(title)}</h2><p class="empty">No data in this range.</p>`;
      const allCols = Object.keys(rows[0]);
      const cols = selected ? selected.filter((c) => allCols.includes(c)) : allCols;
      const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
      const body = rows
        .map((r) => `<tr>${cols.map((c) => `<td>${escapeHtml(fmtCell(r[c]))}</td>`).join("")}</tr>`)
        .join("");
      return `<h2>${escapeHtml(title)} (${rows.length})</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    };
    const scopeLine = entityLabel() ? `<div class="scope">${escapeHtml(entityLabel())}</div>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Daily Report ${startDate} to ${endDate}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:24px;font-size:11px;}
  h1{font-size:20px;margin:0 0 4px;}
  h2{font-size:14px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px;}
  .range{color:#64748b;font-size:12px;margin-bottom:2px;}
  .scope{color:#4338ca;font-weight:bold;font-size:12px;margin-bottom:4px;}
  .rate{color:#047857;font-size:12px;margin-bottom:8px;}
  table{border-collapse:collapse;width:100%;margin-bottom:8px;}
  th,td{border:1px solid #e2e8f0;padding:4px 6px;text-align:left;white-space:nowrap;}
  th{background:#f1f5f9;font-size:10px;}
  td{font-size:10px;}
  .empty{color:#94a3b8;}
  @media print{@page{size:landscape;margin:10mm;}}
</style></head><body>
  <h1>Daily Report</h1>
  <div class="range">${escapeHtml(startDate)} to ${escapeHtml(endDate)}</div>
  ${scopeLine}
  ${tableHtml("Daily Summary", report.summary)}
  ${tableHtml("Payin Transactions", report.payins, isAdmin ? payinCols : null)}
  ${tableHtml("Withdrawal Transactions", report.withdrawals, isAdmin ? wdCols : null)}
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { setError("Allow pop-ups to download the PDF"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <div className="px-2 py-2">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Daily Report</h1>
        <p className="text-sm text-slate-600 mt-1">View the per-day summary and full payin &amp; withdrawal transactions, then download as xlsx or PDF.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-3xl">
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Quick range</div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setStartDate(p.start); setEndDate(p.end); }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  startDate === p.start && endDate === p.end
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Start Date</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">End Date</label>
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Report for</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 bg-white"
              >
                <option value="">All (my data)</option>
                <option value="merchant">Merchant</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {entityType ? `Select ${entityType}` : "Select entity"}
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                disabled={!entityType || entityLoading}
                className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 bg-white disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">{entityLoading ? "Loading..." : entityType ? `All ${entityType}s` : "—"}</option>
                {entityOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name || `#${o.id}`}{o.username ? ` (${o.username})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={viewReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 disabled:opacity-50"
          >
            <Eye size={16} />
            {loading ? "Loading..." : "View Report"}
          </button>
          <button
            type="button"
            onClick={downloadXlsx}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2.5 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} />
            {downloading ? "Generating..." : "Download xlsx"}
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!report}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold px-5 py-2.5 disabled:opacity-50"
            title={!report ? "Click View Report first" : "Open print dialog → Save as PDF"}
          >
            <FileText size={16} />
            Download PDF
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          PDF opens a print-friendly view — choose <strong>Save as PDF</strong> in the print dialog.
        </div>
      </div>

      {report && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Report Preview</h2>
              <div className="text-xs text-slate-500 mt-0.5">
                {report.start_date} to {report.end_date}{entityLabel() ? ` · ${entityLabel()}` : ""}
              </div>
            </div>
          </div>

          {isAdmin && (availPayinCols.length > 0 || availWdCols.length > 0) && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-700 mb-3">Choose columns to include (view, xlsx &amp; PDF)</div>
              {availPayinCols.length > 0 && (
                <div className="mb-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Payin columns</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {availPayinCols.map((c) => (
                      <label key={c} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(payinCols || availPayinCols).includes(c)}
                          onChange={() => toggleCol("payin", c)}
                          className="rounded border-slate-300"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {availWdCols.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Withdrawal columns</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {availWdCols.map((c) => (
                      <label key={c} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(wdCols || availWdCols).includes(c)}
                          onChange={() => toggleCol("withdrawal", c)}
                          className="rounded border-slate-300"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <PaginatedTable title="Daily Summary" rows={report.summary} />
          <PaginatedTable title="Payin Transactions" rows={report.payins} selectedColumns={isAdmin ? payinCols : null} />
          <PaginatedTable title="Withdrawal Transactions" rows={report.withdrawals} selectedColumns={isAdmin ? wdCols : null} />
        </div>
      )}

      {!report && (
        <div className="mt-6 max-w-3xl rounded-lg bg-slate-50 border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-700 mb-2">The report contains 3 sections:</div>
          <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
            <li><strong>Daily Summary</strong> — one row per day with payin + withdrawal counts and volumes</li>
            <li><strong>Payin Transactions</strong> — every payin in the date range</li>
            <li><strong>Withdrawal Transactions</strong> — every withdrawal in the date range</li>
          </ul>
          <div className="mt-2 text-xs text-slate-500">Data is automatically filtered to what your role has access to.</div>
        </div>
      )}
    </div>
  );
}
