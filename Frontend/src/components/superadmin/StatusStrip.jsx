import { useCallback, useEffect, useState } from "react";
import { RefreshCw, AlertOctagon, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import api from "../../api";

const POLL_MS = 60000; // matches WalletBalanceAlert.jsx's existing polling convention

const formatTime = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Compact header status strip — separate, lightweight endpoint
// (GET /api/superadmin/status-strip) so auto-refresh never re-runs the
// heavier Needs-Attention/Hierarchy aggregate queries. Polls every 60s with
// an always-available manual refresh, so this alone can't create excessive
// API traffic even left open all day.
function StatusStrip() {
  const [data, setData] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [online, setOnline] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await api.get("/api/superadmin/status-strip");
      setData(res.data);
      setLastRefresh(new Date());
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="flex items-center gap-4 flex-wrap text-xs bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-4">
      <span className="flex items-center gap-1.5 font-semibold">
        {online ? <Wifi size={13} className="text-green-600" /> : <WifiOff size={13} className="text-red-600" />}
        {online ? "System OK" : "Connection issue"}
      </span>

      <span className="flex items-center gap-1.5">
        {data?.maintenance_enabled ? (
          <>
            <AlertOctagon size={13} className="text-red-600" />
            <span className="text-red-700 font-semibold">Maintenance Mode: ON</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={13} className="text-green-600" />
            <span className="text-slate-600">Maintenance Mode: Off</span>
          </>
        )}
      </span>

      <span className="text-slate-500">
        Pending approvals: <strong className="text-slate-800">{data?.pending_approvals ?? "-"}</strong>
      </span>
      <span className="text-slate-500">
        Failed webhooks (7d): <strong className="text-slate-800">{data?.failed_webhooks ?? "-"}</strong>
      </span>

      <span className="text-slate-400 ml-auto flex items-center gap-2">
        Last refresh: {formatTime(lastRefresh)}
        <button
          onClick={load}
          disabled={refreshing}
          className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 disabled:opacity-50"
          title="Refresh now"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
        </button>
      </span>
    </div>
  );
}

export default StatusStrip;
