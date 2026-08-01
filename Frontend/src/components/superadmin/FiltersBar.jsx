import { useEffect, useState } from "react";
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import DateViewFilter from "../DateViewFilter";
import api from "../../api";
import { computeDateRange } from "../../utils/dateViewFilter";

// Date range is always visible (drives every dashboard section); the
// remaining filters stay collapsed by default per the progressive-disclosure
// requirement. Only Client is wired end-to-end today (into
// GET /api/superadmin/summary/financial's optional client_id param) — the
// entity hierarchy (admin/agent/merchant/merchant/agent) is best
// explored via the Hierarchy Overview's own drill-down instead of a flat
// dropdown here, since a flat filter can't express "which admin under which
// client" without the same tree the Hierarchy page already provides.
function FiltersBar({ onChange }) {
  const defaultRange = computeDateRange("current_month");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");

  useEffect(() => {
    api.get("/api/superadmin/clients").then((r) => setClients(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    onChange?.({ startDate, endDate, clientId: clientId || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, clientId]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <DateViewFilter onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }} />
        <button
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 h-[44px]"
        >
          <SlidersHorizontal size={14} /> Advanced Filters
          {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {advancedOpen && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-10 w-56 rounded-lg border border-slate-300 px-3 text-sm bg-white"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

export default FiltersBar;
