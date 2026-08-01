import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Landmark, Wallet, RotateCcw, Clock } from "lucide-react";
import api from "../../api";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const TYPE_META = {
  payin: { icon: ArrowDownCircle, color: "text-emerald-600", label: "Pay-In" },
  withdrawal: { icon: ArrowUpCircle, color: "text-orange-600", label: "Withdrawal" },
  settlement: { icon: Landmark, color: "text-indigo-600", label: "Settlement" },
  topup: { icon: Wallet, color: "text-sky-600", label: "Agent Top-Up" },
  wallet_refund: { icon: RotateCcw, color: "text-purple-600", label: "Wallet Refund" },
};

function StatusBadge({ value }) {
  const v = value || "Pending";
  const cls =
    ["Approved", "cleared", "Refunded"].includes(v)
      ? "bg-green-100 text-green-700"
      : ["Rejected", "Failed", "Expired", "rejected"].includes(v)
      ? "bg-red-100 text-red-700"
      : ["Disputed"].includes(v)
      ? "bg-purple-100 text-purple-700"
      : "bg-yellow-100 text-yellow-700";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{v}</span>;
}

// Merges Pay-Ins, withdrawals, settlements, top-ups, and wallet refunds from
// GET /api/superadmin/activity-feed into one chronological feed. Commission is
// shown inline on payin/withdrawal rows (computed sub-field), not as its own
// row type — there's no discrete "commission event" in the data model.
function ActivityFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/superadmin/activity-feed", { params: { limit: 50 } });
      setItems(res.data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load activity feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Clock size={18} className="text-slate-500" /> Recent Financial Activity
        </h2>
        <button onClick={load} className="text-xs font-semibold text-[#2B7DE9]">Refresh</button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-400 py-4">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-400 py-4">No recent activity</div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
          {items.map((item, i) => {
            const meta = TYPE_META[item.type] || { icon: Clock, color: "text-slate-500", label: item.type };
            const Icon = meta.icon;
            return (
              <div key={`${item.type}-${item.id}-${i}`} className="flex items-center gap-3 py-2.5">
                <Icon size={18} className={`shrink-0 ${meta.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-500">{meta.label}</span>
                    <StatusBadge value={item.status} />
                  </div>
                  <div className="text-sm text-slate-700 truncate">
                    {item.entity_name || "-"} {item.ref ? `· ${item.ref}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-slate-900">{money(item.amount)}</div>
                  {item.commission_amount > 0 && (
                    <div className="text-[11px] text-slate-400">commission {money(item.commission_amount)}</div>
                  )}
                  <div className="text-[11px] text-slate-400">{formatDate(item.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ActivityFeed;
