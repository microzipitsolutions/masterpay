import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import api from "../api";

function formatDate(d) {
  return d ? new Date(d).toLocaleString("en-GB") : "—";
}

// Bell + dropdown surfacing admin_alerts (currently: new Agent wallet top-up
// requests). Polls the same way TransactionBeepNotifier/WalletBalanceAlert do
// elsewhere in this app. Clicking an alert marks it read and navigates to its
// link_url (the Top-Up Requests page, pre-filtered to Pending).
function AdminAlertsBell() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const fetchAlerts = async () => {
    try {
      const r = await api.get("/api/admin/alerts", { params: { limit: 20 } });
      setAlerts(r.data?.data || []);
      setUnreadCount(r.data?.unread_count || 0);
    } catch {
      // Silent — alert-fetch failures shouldn't disrupt the rest of the admin UI.
    }
  };

  useEffect(() => {
    fetchAlerts();
    const i = setInterval(fetchAlerts, 15000);
    return () => clearInterval(i);
  }, []);

  const openAlert = async (alert) => {
    setOpen(false);
    if (!alert.is_read) {
      try { await api.put(`/api/admin/alerts/${alert.id}/read`); } catch { /* non-fatal */ }
      fetchAlerts();
    }
    if (alert.link_url) navigate(alert.link_url);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative h-10 w-10 sm:h-11 sm:w-11 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
        title="Alerts"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
              <span className="text-sm font-bold text-gray-900">Alerts</span>
              {unreadCount > 0 && <span className="text-xs text-gray-500">{unreadCount} unread</span>}
            </div>
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No alerts yet</div>
            ) : (
              alerts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openAlert(a)}
                  className={`block w-full border-b border-gray-50 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 ${!a.is_read ? "bg-[#f5f9ff]" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">{a.title}</span>
                    {!a.is_read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[#2B7DE9]" />}
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{a.message}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{formatDate(a.created_at)}</p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AdminAlertsBell;
