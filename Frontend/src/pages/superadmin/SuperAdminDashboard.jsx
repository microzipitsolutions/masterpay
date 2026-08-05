import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Store, ShieldCheck, ArrowRight, TrendingUp, Download, Network } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";
import { API_BASE_URL } from "../../config/apiConfig";
import StatusStrip from "../../components/superadmin/StatusStrip";
import GlobalSearch from "../../components/superadmin/GlobalSearch";
import FiltersBar from "../../components/superadmin/FiltersBar";
import TopSummaryCards from "../../components/superadmin/TopSummaryCards";
import MoneyInOutChart from "../../components/superadmin/MoneyInOutChart";
import NeedsAttentionPanel from "../../components/superadmin/NeedsAttentionPanel";
import ActivityFeed from "../../components/superadmin/ActivityFeed";

function RosterCard({ icon: Icon, label, value, color }) {
  return (
    <div className={`rounded-xl border ${color} px-4 py-3 flex items-center gap-3`}>
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0">
        <Icon size={16} />
      </div>
      <div>
        <div className="text-lg font-bold leading-none">{value ?? "—"}</div>
        <div className="text-[11px] opacity-75 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const [roster, setRoster] = useState(null);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", clientId: null });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get("/api/superadmin/summary").then((r) => setRoster(r.data)).catch(() => {});
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);
      const token = localStorage.getItem("rdpay_token");
      const params = new URLSearchParams();
      if (filters.startDate) params.set("startDate", filters.startDate);
      if (filters.endDate) params.set("endDate", filters.endDate);
      const res = await fetch(`${API_BASE_URL}/api/superadmin/export/financial-overview?${params}`, {
        headers: { Authorization: `Bearer ${token || ""}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `superadmin-financial-overview-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not generate export");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SuperAdminLayout>
      <StatusStrip />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Super Admin Control Center</h1>
          <p className="text-slate-500 text-sm mt-1">System-wide overview across every Client, Admin, Agent and Merchant.</p>
        </div>
        <div className="flex items-center gap-2">
          <GlobalSearch />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="h-9 flex items-center gap-1.5 rounded-control border border-slate-200 px-3 text-sm font-semibold text-navy-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download size={14} /> {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>

      {/* Compact platform roster — unchanged endpoint, shrunk to a strip so the
          new financial sections lead the page (progressive disclosure). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <RosterCard icon={ShieldCheck} label="Active Admins" value={roster?.active_admins} color="border-navy-500/20 bg-navy-900/[0.03] text-navy-900" />
        <RosterCard icon={Users} label="Agents" value={roster?.agents} color="border-brand-blue/20 bg-brand-blue-light text-brand-blue-dark" />
        <RosterCard icon={Store} label="Merchants" value={roster?.merchants} color="border-brand-teal/20 bg-brand-teal-light text-brand-teal-dark" />
        <RosterCard icon={TrendingUp} label="Total Txns" value={roster?.transactions?.toLocaleString?.("en-IN") ?? roster?.transactions} color="border-slate-200 bg-slate-50 text-slate-900" />
      </div>

      <FiltersBar onChange={setFilters} />

      <TopSummaryCards startDate={filters.startDate} endDate={filters.endDate} clientId={filters.clientId} />

      <MoneyInOutChart />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeedsAttentionPanel />
        <ActivityFeed />
      </div>

      <Link
        to="/superadmin/hierarchy"
        className="flex items-center justify-between rounded-card border border-slate-200 bg-white p-5 shadow-card hover:shadow-card-hover transition mb-6"
      >
        <span className="flex items-center gap-3">
          <Network size={20} className="text-brand-blue" />
          <span>
            <span className="block text-sm font-bold text-navy-900">Hierarchy Overview</span>
            <span className="block text-xs text-slate-500">Drill down Client → Admin → Agent/Merchant</span>
          </span>
        </span>
        <ArrowRight size={18} className="text-slate-400" />
      </Link>

      <Link
        to="/superadmin/admins"
        className="inline-flex items-center gap-2 rounded-control brand-gradient text-white font-semibold px-5 py-2.5 shadow-[0_4px_14px_rgba(30,136,255,0.35)] hover:brightness-[1.06]"
      >
        Manage Admins
        <ArrowRight size={16} />
      </Link>
    </SuperAdminLayout>
  );
}
