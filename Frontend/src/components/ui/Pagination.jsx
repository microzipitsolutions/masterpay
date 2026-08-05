import { ChevronLeft, ChevronRight } from "lucide-react";

// Replaces ~15 duplicated inline prev/next pagination implementations.
export default function Pagination({ page, totalPages, onChange, total, pageSize }) {
  if (totalPages <= 1 && !total) return null;
  const from = total != null && pageSize ? (page - 1) * pageSize + 1 : null;
  const to = total != null && pageSize ? Math.min(page * pageSize, total) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-slate-200 bg-white px-5 py-4 shadow-card">
      <p className="text-sm font-medium text-slate-500">
        {from != null ? (
          <>
            Showing <span className="font-semibold text-navy-900">{from}-{to}</span> of{" "}
            <span className="font-semibold text-navy-900">{total}</span>
          </>
        ) : (
          <>
            Page <span className="font-semibold text-navy-900">{page}</span> of{" "}
            <span className="font-semibold text-navy-900">{totalPages}</span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex h-9 items-center gap-1 rounded-control border border-slate-200 px-3 text-sm font-semibold text-navy-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Prev
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages || page + 1, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex h-9 items-center gap-1 rounded-control border border-slate-200 px-3 text-sm font-semibold text-navy-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
