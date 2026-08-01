import { useEffect, useState } from "react";
import api from "../../api";
import MetricInfoTooltip from "./MetricInfoTooltip";
import BreakdownDrawer from "./BreakdownDrawer";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const txnColumns = [
  { key: "transaction_id", label: "Txn ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "status", label: "Status" },
  { key: "utr_number", label: "UTR" },
  { key: "created_at", label: "Date", format: "date" },
];
const wdColumns = [
  { key: "id", label: "ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "status", label: "Status" },
  { key: "merchant_name", label: "Merchant" },
  { key: "created_at", label: "Date", format: "date" },
];
const stColumns = [
  { key: "id", label: "ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "transaction_status", label: "Status" },
  { key: "merchant_name", label: "Merchant" },
  { key: "created_at", label: "Date", format: "date" },
];
const topupColumns = [
  { key: "id", label: "ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "status", label: "Status" },
  { key: "agent_name", label: "Agent" },
  { key: "submitted_at", label: "Date", format: "date" },
];

// The 8 top summary cards. Self-fetches from GET /api/superadmin/summary/financial
// given a date range; clicking a card with contributing records opens the shared
// BreakdownDrawer against the exact existing list endpoint, so the card total and
// its own breakdown can never disagree.
function TopSummaryCards({ startDate, endDate, clientId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await api.get("/api/superadmin/summary/financial", { params: { startDate, endDate, client_id: clientId || undefined } });
        if (!cancelled) setSummary(res.data);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || "Could not load summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [startDate, endDate, clientId]);

  const cards = summary && [
    {
      key: "payin_received", label: "Total Pay-In Received", value: money(summary.payin_received),
      formula: "Sum of amount for Pay-Ins with status = Approved, in the selected date range.",
      color: "border-emerald-200 bg-emerald-50 text-emerald-900",
      onClick: () => setDrawer({ title: "Approved Pay-Ins", endpoint: "/api/transactions", filters: { status: "Approved", startDate, endDate }, columns: txnColumns }),
    },
    {
      key: "withdrawals_sent", label: "Total Withdrawals Sent", value: money(summary.withdrawals_sent),
      formula: "Sum of amount for Withdrawals with status = cleared, in the selected date range.",
      color: "border-orange-200 bg-orange-50 text-orange-900",
      onClick: () => setDrawer({ title: "Cleared Withdrawals", endpoint: "/api/withdrawal/transactions", filters: { status: "cleared", startDate, endDate }, columns: wdColumns }),
    },
    {
      key: "pending_settlements_count", label: "Pending Settlements", value: summary.pending_settlements_count,
      formula: "Count of Settlements with transaction_status = Pending (current snapshot, not date-filtered).",
      color: "border-amber-200 bg-amber-50 text-amber-900",
      onClick: () => setDrawer({ title: "Pending Settlements", endpoint: "/api/settlement-transactions", filters: { transaction_status: "Pending" }, columns: stColumns }),
    },
    {
      key: "approved_topups", label: "Approved Agent Top-Ups", value: money(summary.approved_topups),
      formula: "Sum of amount for Agent Top-Up requests with status = Approved, in the selected date range.",
      color: "border-sky-200 bg-sky-50 text-sky-900",
      onClick: () => setDrawer({ title: "Approved Agent Top-Ups", endpoint: "/api/admin/agent-topups", filters: { status: "Approved", from: startDate, to: endDate }, columns: topupColumns }),
    },
    {
      key: "total_commission_earned", label: "Total Commission Earned", value: money(summary.total_commission_earned),
      formula: "Gross commission collected: (Approved Pay-In amount × merchant commission %) + (cleared Withdrawal amount × payout commission %), in range.",
      note: "Gross figure collected from merchants — does not net out agents' commission share (that's a per-admin margin figure, not a platform-wide total).",
      color: "border-purple-200 bg-purple-50 text-purple-900",
    },
    {
      key: "net_platform_movement", label: "Net Platform Movement", value: money(summary.net_platform_movement),
      formula: "Total Pay-In Received − Total Withdrawals Sent − Settlements Approved, in the selected date range.",
      note: "Pure cash movement, kept separate from Total Commission Earned so nothing double-counts.",
      color: "border-indigo-200 bg-indigo-50 text-indigo-900",
    },
    {
      key: "successful_transactions", label: "Successful Transactions", value: summary.successful_transactions,
      formula: "Count of Pay-Ins with status = Approved, in the selected date range.",
      color: "border-teal-200 bg-teal-50 text-teal-900",
      onClick: () => setDrawer({ title: "Successful Pay-Ins", endpoint: "/api/transactions", filters: { status: "Approved", startDate, endDate }, columns: txnColumns }),
    },
    {
      key: "success_rate", label: "Success Rate", value: `${summary.success_rate}%`,
      formula: "Approved ÷ Finalized (Approved+Rejected+Failed+Expired) × 100. Pending/UTR Submitted/Disputed are excluded from both sides as still in-progress.",
      color: "border-slate-200 bg-slate-50 text-slate-900",
    },
  ];

  return (
    <div className="mb-6">
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !cards
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 h-28 animate-pulse" />
            ))
          : cards.map((c) => (
              <div
                key={c.key}
                onClick={c.onClick}
                className={`rounded-2xl border ${c.color} p-5 ${c.onClick ? "cursor-pointer hover:shadow-md transition" : ""}`}
              >
                <div className="flex items-center text-xs font-semibold opacity-75 mb-2">
                  {c.label}
                  <MetricInfoTooltip formula={c.formula} note={c.note} />
                </div>
                <div className="text-2xl font-bold">{c.value}</div>
              </div>
            ))}
      </div>

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

export default TopSummaryCards;
