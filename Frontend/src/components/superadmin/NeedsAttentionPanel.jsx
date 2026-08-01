import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import api from "../../api";
import BreakdownDrawer from "./BreakdownDrawer";

const txnColumns = [
  { key: "transaction_id", label: "Txn ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Date", format: "date" },
];
const stColumns = [
  { key: "id", label: "ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "transaction_status", label: "Status" },
  { key: "merchant_name", label: "Merchant" },
  { key: "created_at", label: "Date", format: "date" },
];
const wdDisputeColumns = [
  { key: "id", label: "ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "merchant_name", label: "Merchant" },
  { key: "merchant_disputed_at", label: "Disputed At", format: "date" },
];
const accountColumns = [
  { key: "id", label: "ID" },
  { key: "agent_name", label: "Agent" },
  { key: "bank_name", label: "Bank" },
  { key: "account_number", label: "Account #" },
];

// Each row opens the shared BreakdownDrawer directly against an existing list
// endpoint (pending settlements, disputed payins, failed webhooks, inactive
// accounts, failed/expired payins) or navigates to a real existing page when
// one already exists and supports the right filter (agent top-ups,
// withdrawal transactions).
function NeedsAttentionPanel() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/superadmin/needs-attention");
      setItems(res.data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load needs-attention data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sevenDaysAgo = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  };
  const today = () => new Date().toISOString().slice(0, 10);

  const handleClick = (item) => {
    switch (item.key) {
      case "pending_settlements":
        setDrawer({ title: "Pending Settlement Approvals", endpoint: "/api/settlement-transactions", filters: { transaction_status: "Pending" }, columns: stColumns });
        return;
      case "disputed_payins":
        setDrawer({ title: "Disputed Pay-Ins", endpoint: "/api/transactions", filters: { status: "Disputed" }, columns: txnColumns });
        return;
      case "disputed_withdrawals":
        setDrawer({ title: "Disputed Withdrawals", endpoint: "/api/withdrawal/disputes", filters: {}, columns: wdDisputeColumns });
        return;
      case "failed_webhooks":
        setDrawer({ title: "Failed Webhooks (last 7 days)", endpoint: "/api/transactions", filters: { webhook_failed: "true", startDate: sevenDaysAgo(), endDate: today() }, columns: txnColumns });
        return;
      case "inactive_accounts":
        setDrawer({ title: "Inactive Agent Bank Accounts", endpoint: "/api/agent-accounts", filters: { is_active: "false" }, columns: accountColumns });
        return;
      case "failed_expired_payins":
        setDrawer({ title: "Failed / Expired Pay-Ins (last 7 days)", endpoint: "/api/transactions", filters: { status: "Failed,Expired", startDate: sevenDaysAgo(), endDate: today() }, columns: txnColumns });
        return;
      default:
        // pending_topups, pending_withdrawals, low_balance_agents — real
        // existing pages, navigate directly.
        navigate(item.filter_link);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
        <AlertTriangle size={18} className="text-amber-500" /> Needs Attention
      </h2>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-400 py-4">Loading...</div>
      ) : items.every((i) => i.count === 0) ? (
        <div className="text-sm text-slate-400 py-4">Nothing needs attention right now.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.filter((i) => i.count > 0).map((item) => (
            <button
              key={item.key}
              onClick={() => handleClick(item)}
              className="flex items-center justify-between rounded-lg border border-slate-200 hover:border-amber-300 hover:bg-amber-50 px-4 py-3 text-left transition"
            >
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
              <span className="flex items-center gap-1">
                <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold px-2">
                  {item.count}
                </span>
                <ChevronRight size={16} className="text-slate-400" />
              </span>
            </button>
          ))}
        </div>
      )}

      <BreakdownDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        endpoint={drawer?.endpoint}
        filters={drawer?.filters}
        title={drawer?.title}
        columns={drawer?.columns || []}
      />
    </div>
  );
}

export default NeedsAttentionPanel;
