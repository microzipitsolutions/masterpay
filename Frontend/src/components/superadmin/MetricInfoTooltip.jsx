import { useState } from "react";
import { Info } from "lucide-react";

// One reusable (i)-icon used next to every metric label across the Super
// Admin control center. Click toggles a small popover with the exact
// formula — every metric must explain how it's computed, not just show a number.
function MetricInfoTooltip({ formula, note }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle ml-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-slate-400 hover:text-slate-600 align-middle"
        aria-label="Formula explanation"
      >
        <Info size={13} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 left-1/2 -translate-x-1/2 top-6 w-64 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg"
        >
          <p className="text-xs font-semibold text-slate-800 mb-1">Formula</p>
          <p className="text-xs text-slate-600">{formula}</p>
          {note && <p className="text-[11px] text-slate-400 mt-2 border-t border-slate-100 pt-2">{note}</p>}
        </div>
      )}
    </span>
  );
}

export default MetricInfoTooltip;
