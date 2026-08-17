import { useEffect, useMemo, useState } from "react";
import api from "../api";
import {
  ChevronDown,
  ChevronUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Percent,
  Landmark,
  Wallet2,
  Store,
  Users,
  CheckCircle2,
  Receipt,
  ListChecks,
} from "lucide-react";
import DateViewFilter from "../components/DateViewFilter";
import { computeDateRange } from "../utils/dateViewFilter";
import { PageHeader, KpiCard, Modal, Card, CardHeader } from "../components/ui";

const BAR_COLORS = { agent: "#1e88ff", merchant: "#14c7b7" };

// Compact "top 5" horizontal bar list — reuses the same per-agent/per-merchant
// rows the breakdown modals already fetch, just rendered as a chart instead of
// a flat number, so the trend/ranking is visible without opening anything.
function TopBreakdownChart({ title, subtitle, rows, formatValue, color }) {
  const top = (rows || []).slice(0, 5);
  const max = Math.max(1, ...top.map((r) => Number(r.amount || 0)));

  return (
    <div className="rounded-card border border-slate-200 bg-white p-5 sm:p-6 shadow-card">
      <h3 className="text-base font-bold text-navy-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}

      {top.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No data yet</p>
      ) : (
        <div className="mt-5 space-y-3.5">
          {top.map((row) => {
            const amount = Number(row.amount || 0);
            const pct = Math.max(4, (amount / max) * 100);
            return (
              <div key={row.id ?? row.name}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-navy-800">{row.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-navy-900">{formatValue(amount)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const defaultRange = computeDateRange("current_month");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState([]);
  const [breakdownTab, setBreakdownTab] = useState("agent");

 const viewAs = useMemo(() => {
  try {
    return JSON.parse(localStorage.getItem("rdpay_view_as") || "null");
  } catch {
    return null;
  }
}, []);

const queryParams = new URLSearchParams(window.location.search);

const viewAgentId =
  queryParams.get("viewAgentId") ||
  (viewAs?.role === "agent" ? viewAs.id : null);

const viewAgentName =
  queryParams.get("viewAgentName") ||
  viewAs?.name ||
  "Agent";



  const [stats, setStats] = useState({
    adminCommission: 0,
    payinCommission: 0,
    payoutCommission: 0,
    settlementRemaining: 0,
    settlementRemainingByAgent: 0,
    commissionByAgent: 0,
    commissionByMerchant: 0,
    totalAgentCommission: 0,
    totalMerchantCommission: 0,
    totalWithdrawal: 0,
    payinAmountByAgent: 0,
    payinAmountByMerchant: 0,
    totalPayinAmount: 0,
    payinTransactionsByAgent: 0,
    payinTransactionsByMerchant: 0,
    totalPayinTransactions: 0,
    settlementAmountByMerchant: 0,
    settlementAmountByAgent: 0,
    totalSettlementAmount: 0,
    settlementTransactionsByMerchant: 0,
    settlementTransactionsByAgent: 0,
    totalSettlementTransactions: 0,
    successRate: 0,
  });

  const [agentCommissionRows, setAgentCommissionRows] = useState([]);
  const [merchantCommissionRows, setMerchantCommissionRows] = useState([]);

  const [modalTitle, setModalTitle] = useState("");
  const [details, setDetails] = useState([]);
  const [expanded, setExpanded] = useState({ 0: true });
  const [loading, setLoading] = useState(false);

const money = (value) => {
  // Keep the sign: figures like Settlement Remaining legitimately go negative
  // (settled more than owed), and hiding the minus misrepresents the balance.
  const number = Number(value || 0);

  return `₹${number.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
};

  const number = (value) => Number(value || 0).toLocaleString("en-IN");

  const buildParams = () => {
    const params = {};

    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (viewAgentId) params.viewAgentId = viewAgentId;
    if (merchantId) params.merchantId = merchantId;

    return params;
  };

  const detailsUrl = (type) => {
    const params = buildParams();
    const query = new URLSearchParams({ type, ...params });
    return `/api/admin-dashboard/details?${query.toString()}`;
  };

  const fetchDashboard = async () => {
    try {
    const params = buildParams();

const url = `/api/admin-dashboard?${
  params.viewAgentId ? `viewAgentId=${params.viewAgentId}` : ""
}${
  params.startDate ? `&startDate=${params.startDate}` : ""
}${
  params.endDate ? `&endDate=${params.endDate}` : ""
}${
  merchantId ? `&merchantId=${merchantId}` : ""
}`;

console.log("DASHBOARD URL:", url);

const res = await api.get(url);
      setStats(res.data);
    } catch (error) {
      console.log("Dashboard fetch error:", error);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [startDate, endDate, viewAgentId, merchantId]);

  // Top-5 commission leaderboards for the chart panels — same endpoint/params
  // the "Commission By Agent/Merchant" breakdown modal already uses.
  useEffect(() => {
    api.get(detailsUrl("commissionByAgent"))
      .then((r) => setAgentCommissionRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setAgentCommissionRows([]));
    api.get(detailsUrl("commissionByMerchant"))
      .then((r) => setMerchantCommissionRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMerchantCommissionRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, viewAgentId]);

  // Merchant list for the dashboard filter dropdown.
  useEffect(() => {
    api
      .get("/api/merchants")
      .then((r) => setMerchants(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMerchants([]));
  }, []);

  const openDetails = async (card) => {
    setModalTitle(card.title);
    setExpanded({ 0: true });

    if (card.localDetails) {
      setDetails([
        {
          name: "Details",
          fields: card.localDetails,
        },
      ]);
      return;
    }

    try {
      setLoading(true);
      if (card.type === "payinBreakdown") {
        const params = new URLSearchParams(buildParams());
        params.set("page", "1");
        params.set("limit", "1");
        const res = await api.get(`/api/admin/payins?${params.toString()}`);
        setDetails((res.data.breakdown || []).map((row) => ({
          name: row.source_name,
          fields: {
            successful_transactions: row.successful_count,
            total_transactions: row.total_transaction_count,
            approved_payin_amount: row.approved_amount,
            commission: row.commission,
            share_percent: `${row.share_percent}%`,
            source_key: row.source_key,
          },
        })));
        return;
      }
const url = detailsUrl(card.type);

console.log("DETAIL URL:", url);

const res = await api.get(url);
      const rows = Array.isArray(res.data) ? res.data : [];

      setDetails(
        rows.map((row) => ({
          name:
            row.name ||
            row.agentname ||
            row.merchantname ||
            row.agentname ||
            row.merchantname ||
            "Details",
          fields: row,
        }))
      );
    } catch (error) {
      console.log("Details fetch error:", error);
      setDetails([]);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalTitle("");
    setDetails([]);
    setExpanded({ 0: true });
  };

  const toggleAccordion = (index) => {
    setExpanded((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const formatLabel = (key) => {
    const labels = {
      id: "_id",
      agentid: "AgentId",
      agent_id: "AgentId",
      agentname: "AgentName",
      agent_name: "AgentName",
      merchantid: "MerchantId",
      merchant_id: "MerchantId",
      merchantname: "MerchantName",
      merchant_name: "MerchantName",
      amount: "Amount",
      approved: "Approved",
      pending: "Pending",
      rejected: "Reject",
      reject: "Reject",
      total: "TotalTransactions",
      totaltransactions: "TotalTransactions",
      total_transactions: "TotalTransactions",
    };

    return labels[key.toLowerCase()] || key;
  };

  const formatValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "-";

    const moneyKeys = ["amount", "approved", "pending", "rejected", "reject"];

    if (moneyKeys.includes(key.toLowerCase()) && modalTitle.includes("Amount")) {
      return money(value);
    }

    if (["amount", "approved_payin_amount", "commission"].includes(key.toLowerCase())) {
      return money(value);
    }

    return value;
  };

  const renderFields = (item) => {
    const fields = item.fields || item;

    return Object.entries(fields)
      .filter(([key]) => !["name"].includes(key.toLowerCase()))
      .map(([key, value]) => key === "source_key" ? (
        <div key={key} className="mt-3">
          <a
            href={`/payin-transactions?${new URLSearchParams({ source: value, ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) }).toString()}`}
            className="text-sm font-semibold text-brand-blue hover:underline"
          >View individual transactions →</a>
        </div>
      ) : (
        <div key={key} className="flex justify-between gap-4 mb-2">
          <span className="text-[13px] text-slate-500">
            {formatLabel(key)}
          </span>

          <span className="text-[13px] text-navy-900 font-semibold text-right break-all">
            {formatValue(key, value)}
          </span>
        </div>
      ));
  };

  // Primary KPIs — one card per distinct metric, fixed order: payin → payin
  // commission → payout → payout commission → settlement → commissions →
  // success rate → transaction counts. Everything here is a unique figure;
  // the "By Agent" / "By Merchant" breakdowns (which the old dashboard
  // repeated as near-identical cards showing the very same totals) now live
  // in the Breakdowns panel below instead of being duplicated here.
  const summaryCards = [
    { title: "Total Payin", value: money(stats.totalPayinAmount), icon: ArrowDownToLine, tone: "brand", type: "payinBreakdown" },
    // { title: "Payin Commission", value: money(stats.payinCommission), icon: Percent },
    { title: "Total Payout", value: money(stats.totalWithdrawal), icon: ArrowUpFromLine },
    { title: "Payout Commission", value: money(stats.payoutCommission), icon: Percent },
    { title: "Total Settlement Amount", value: money(stats.totalSettlementAmount), icon: Landmark },
    { title: "Settlement Remaining", value: money(stats.settlementRemaining), icon: Wallet2 },
    { title: "Total Merchant Commission", value: money(stats.totalMerchantCommission), icon: Store },
    { title: "Total Agent Commission", value: money(stats.totalAgentCommission), icon: Users },
    { title: "Payin Success Rate", value: `${Number(stats.successRate || 0)}%`, icon: CheckCircle2 },
    { title: "Total Payin Transactions", value: number(stats.totalPayinTransactions), icon: Receipt, type: "payinBreakdown" },
    { title: "Total Settlement Transactions", value: number(stats.totalSettlementTransactions), icon: ListChecks },
  ];

  // Per-agent / per-merchant breakdown views. Each entry opens the exact same
  // details modal + endpoint the old duplicate cards used (card.type is
  // unchanged) — only the presentation (grouped list vs. a wall of cards)
  // is different.
  const breakdownItems = {
    agent: [
      { title: "Settlement Remaining By Agent", type: "settlementRemainingByAgent", desc: "Agent with the highest unsettled balance" },
      { title: "Commission By Agent", type: "commissionByAgent", desc: "Commission earned per agent" },
      { title: "PayIn Amount By Agent", type: "payinAmountByAgent", desc: "Pay-in volume per agent" },
      { title: "PayIn Transactions By Agent", type: "payinTransactionsByAgent", desc: "Pay-in counts per agent" },
      { title: "Settlement Amount By Agent", type: "settlementAmountByAgent", desc: "Settlement volume per agent" },
      { title: "Settlement Transactions By Agent", type: "settlementTransactionsByAgent", desc: "Settlement counts per agent" },
    ],
    merchant: [
      { title: "Commission By Merchant", type: "commissionByMerchant", desc: "Commission earned per merchant" },
      { title: "PayIn Amount By Merchant", type: "payinAmountByMerchant", desc: "Pay-in volume per merchant" },
      { title: "PayIn Transactions By Merchant", type: "payinTransactionsByMerchant", desc: "Pay-in counts per merchant" },
      { title: "Settlement Amount By Merchant", type: "settlementAmountByMerchant", desc: "Settlement volume per merchant" },
      { title: "Settlement Transactions By Merchant", type: "settlementTransactionsByMerchant", desc: "Settlement counts per merchant" },
    ],
  };

  return (
    <div className="w-full px-3 sm:px-6 py-5 sm:py-8 bg-white min-h-screen">
      <PageHeader
        title={viewAgentId ? `${viewAgentName} Dashboard` : "Admin Dashboard"}
        subtitle={viewAgentId ? "Viewing only selected agent data" : undefined}
        className="mb-6 sm:mb-10"
        actions={
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-800 mb-2">
                Merchant
              </label>
              <select
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="w-full sm:w-[200px] h-11 bg-white border border-slate-200 rounded-control px-3 text-sm text-navy-900 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
              >
                <option value="">All Merchants</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <DateViewFilter onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }} />
          </div>
        }
      />

      {/* ── Summary KPIs — one card per unique metric ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {summaryCards.map((card) => card.type === "payinBreakdown" ? (
          <button key={card.title} type="button" onClick={() => openDetails(card)} className="text-left rounded-card focus:outline-none focus:ring-2 focus:ring-brand-blue/30" aria-label={`View ${card.title} breakdown`}>
            <KpiCard label={card.title} value={card.value} icon={card.icon} tone={card.tone || "light"} />
          </button>
        ) : (
          <KpiCard key={card.title} label={card.title} value={card.value} icon={card.icon} tone={card.tone || "light"} />
        ))}
      </div>

      {/* ── Top-5 commission charts ── */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TopBreakdownChart
          title="Top Agents by Commission"
          subtitle="Highest commission-earning agents in the selected period"
          rows={agentCommissionRows}
          formatValue={money}
          color={BAR_COLORS.agent}
        />
        <TopBreakdownChart
          title="Top Merchants by Commission"
          subtitle="Highest commission-earning merchants in the selected period"
          rows={merchantCommissionRows}
          formatValue={money}
          color={BAR_COLORS.merchant}
        />
      </div>

      {/* ── Detailed breakdowns, grouped by dimension instead of repeated as cards ── */}
      <Card className="mt-8" padded>
        <CardHeader
          title="Breakdowns"
          subtitle="Per-agent and per-merchant detail views"
        />

        <div className="mt-4 mb-2 inline-flex rounded-control bg-slate-100 p-1">
          {["agent", "merchant"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setBreakdownTab(tab)}
              className={`rounded-control px-4 py-2 text-sm font-semibold capitalize transition ${
                breakdownTab === tab ? "bg-white text-navy-900 shadow-card" : "text-slate-500 hover:text-navy-800"
              }`}
            >
              By {tab}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-100">
          {breakdownItems[breakdownTab].map((item) => (
            <div key={item.type} className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900 truncate">{item.title}</p>
                <p className="text-xs text-slate-400 truncate">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => openDetails(item)}
                className="shrink-0 text-sm font-semibold text-brand-blue hover:underline"
              >
                View →
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={!!modalTitle} onClose={closeModal} title={modalTitle} maxWidth="max-w-xl">
        <div className="max-h-[66vh] overflow-y-auto pr-1">
          {loading ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : details.length === 0 ? (
            <div className="rounded-control border border-slate-200">
              <button
                type="button"
                className="w-full px-3 py-3 flex items-center justify-between"
              >
                <span className="font-semibold text-navy-900">Details</span>
                <ChevronDown size={18} className="text-slate-400" />
              </button>

              <div className="border-t border-slate-100 px-3 py-3">
                <p className="text-sm text-slate-500">No details found</p>
              </div>
            </div>
          ) : (
            details.map((item, index) => (
              <div
                key={index}
                className="rounded-control border border-slate-200 mb-3 overflow-hidden bg-white"
              >
                <button
                  type="button"
                  onClick={() => toggleAccordion(index)}
                  className="w-full px-3 py-3 flex items-center justify-between"
                >
                  <span className="text-sm font-semibold text-navy-900">
                    {item.name || "Details"}
                  </span>

                  {expanded[index] ? (
                    <ChevronDown size={18} className="text-slate-400" />
                  ) : (
                    <ChevronUp size={18} className="text-slate-400" />
                  )}
                </button>

                {expanded[index] && (
                  <div className="border-t border-slate-100 px-3 py-3">
                    {renderFields(item)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}

export default Dashboard;
