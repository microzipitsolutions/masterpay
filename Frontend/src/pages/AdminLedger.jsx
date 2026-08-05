import { useEffect, useState } from "react";
import api from "../api";
import { FileSpreadsheet, FileText } from "lucide-react";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value) => value ? new Date(value).toLocaleString("en-IN") : "-";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]);

export default function AdminLedger() {
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [filters, setFilters] = useState({ from: "", to: "", agent_id: "", status: "" });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/admin/ledger", { params: { ...filters, page, limit: 20 } });
      setRows(res.data?.data || []);
      setTotalPages(res.data?.totalPages || 1);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load admin ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get("/api/agents").then((r) => setAgents(Array.isArray(r.data) ? r.data : r.data?.data || [])).catch(() => {});
  }, []);

  const applyFilters = () => { setPage(1); load(); };
  const exportExcel = async () => {
    const res = await api.get("/api/admin/ledger", { params: { ...filters, export: "xlsx" }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return setError("Allow pop-ups to export the ledger as PDF");
    const cells = rows.map((r) => `<tr><td>${escapeHtml(r.receive_from)}</td><td>${escapeHtml(r.pay_to)}</td><td>${escapeHtml(money(r.amount))}</td><td>${escapeHtml(money(r.commission_amount))}</td><td>${escapeHtml(money(r.payable_receivable_amount))}</td><td>${escapeHtml(dateTime(r.submitted_at))}</td><td>${escapeHtml(r.transaction_reference)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.notes || r.rejection_reason || "-")}</td></tr>`).join("");
    popup.document.write(`<html><head><title>Admin Ledger</title><style>body{font-family:Arial;padding:24px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccc;padding:6px;text-align:left}h1{font-size:20px}</style></head><body><h1>Admin Ledger</h1><table><thead><tr><th>Receive From</th><th>Pay To</th><th>Top-Up</th><th>Commission</th><th>Final Amount</th><th>Date</th><th>Reference</th><th>Status</th><th>Remarks</th></tr></thead><tbody>${cells}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Admin Ledger</h1><p className="mt-1 text-sm text-slate-500">Top-up funds received and commission-inclusive credits payable to Agents.</p></div>
        <div className="flex gap-2"><button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white"><FileSpreadsheet size={16} /> Export Excel</button><button onClick={exportPdf} disabled={!rows.length} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><FileText size={16} /> Export PDF</button></div>
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-5">
        <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" aria-label="From date" />
        <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2" aria-label="To date" />
        <select value={filters.agent_id} onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">All Agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} (@{a.username})</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">All Statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
        <button onClick={applyFilters} className="rounded-lg bg-[#1E88FF] px-4 py-2 font-semibold text-white">Apply Filters</button>
      </div>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
        <table className="min-w-[1300px] w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Receive From", "Pay To", "Top-Up", "Commission", "Final Amount", "Date & Time", "Reference", "Status", "Remarks"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{loading ? <tr><td colSpan={9} className="py-10 text-center text-slate-400">Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-slate-400">No ledger entries found.</td></tr> : rows.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="px-4 py-3">{r.receive_from}</td><td className="px-4 py-3">{r.pay_to}</td><td className="px-4 py-3">{money(r.amount)}</td><td className="px-4 py-3">{money(r.commission_amount)} <span className="text-xs text-slate-400">({Number(r.commission_percent || 0)}%)</span></td><td className="px-4 py-3 font-semibold">{money(r.payable_receivable_amount)}</td><td className="px-4 py-3">{dateTime(r.submitted_at)}</td><td className="px-4 py-3 font-mono text-xs">{r.transaction_reference}</td><td className="px-4 py-3">{r.status}</td><td className="px-4 py-3">{r.notes || r.rejection_reason || "-"}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="flex justify-center gap-3"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Previous</button><span className="py-2 text-sm">Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-50">Next</button></div>
    </div>
  );
}
