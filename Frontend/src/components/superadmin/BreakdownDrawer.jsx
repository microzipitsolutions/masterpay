import { useEffect, useState } from "react";
import { X } from "lucide-react";
import api from "../../api";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function formatCell(col, row) {
  const value = row[col.key];
  if (col.format === "money") return money(value);
  if (col.format === "date") return formatDate(value);
  return value ?? "-";
}

// One reusable right-side slide-over used by every card / Needs-Attention row
// in the Super Admin control center — "clicking a card opens a breakdown of
// exactly which users/transactions contributed to that total" is implemented
// once here, parameterized by which existing list endpoint + filters to call,
// never as a bespoke drawer per metric.
function BreakdownDrawer({ open, onClose, endpoint, filters, title, columns }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!open || !endpoint) return;
    setPage(1);
  }, [open, endpoint, JSON.stringify(filters)]);

  useEffect(() => {
    if (!open || !endpoint) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get(endpoint, { params: { ...filters, page, limit: 25 } });
        if (cancelled) return;
        if (Array.isArray(res.data)) {
          setRows(res.data);
          setTotalPages(1);
        } else {
          setRows(res.data?.data || res.data?.items || []);
          setTotalPages(res.data?.totalPages || 1);
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || "Could not load breakdown");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, endpoint, page, JSON.stringify(filters)]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="text-left px-4 py-2.5 font-bold text-slate-700">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={columns.length} className="text-center py-8 text-slate-400">Loading...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={columns.length} className="text-center py-8 text-slate-400">No records found</td></tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={row.id ?? i} className="border-b border-slate-100 last:border-0">
                      {columns.map((c) => (
                        <td key={c.key} className="px-4 py-2.5">{formatCell(c, row)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-slate-600">Page {page} of {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BreakdownDrawer;
