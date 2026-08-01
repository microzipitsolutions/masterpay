import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import DateViewFilter from "../components/DateViewFilter";
import { computeDateRange } from "../utils/dateViewFilter";

function Dashboard() {
  const defaultRange = computeDateRange("current_month");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState([]);

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

    return params;
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
const params = buildParams();

const url = `/api/admin-dashboard/details?type=${card.type}${
  params.viewAgentId ? `&viewAgentId=${params.viewAgentId}` : ""
}${
  params.startDate ? `&startDate=${params.startDate}` : ""
}${
  params.endDate ? `&endDate=${params.endDate}` : ""
}`;

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

    if (key.toLowerCase() === "amount") {
      return money(value);
    }

    return value;
  };

  const renderFields = (item) => {
    const fields = item.fields || item;

    return Object.entries(fields)
      .filter(([key]) => !["name"].includes(key.toLowerCase()))
      .map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4 mb-2">
          <span className="text-[13px] text-[#475569]">
            {formatLabel(key)}
          </span>

          <span className="text-[13px] text-black font-semibold text-right break-all">
            {formatValue(key, value)}
          </span>
        </div>
      ));
  };

  const cards = [
    // Primary KPIs, fixed order: payin → payin commission → payout → payout commission → success rate.
    {
      title: "Total Payin",
      value: money(stats.totalPayinAmount),
      localDetails: { amount: stats.totalPayinAmount },
    },
    {
      title: "Payin Commission",
      value: money(stats.payinCommission),
      localDetails: { amount: stats.payinCommission },
    },
    {
      title: "Total Payout",
      value: money(stats.totalWithdrawal),
      localDetails: { amount: stats.totalWithdrawal },
    },
    {
      title: "Payout Commission",
      value: money(stats.payoutCommission),
      localDetails: { amount: stats.payoutCommission },
    },
    {
      title: "Total Settlement Amount",
      value: money(stats.totalSettlementAmount),
      localDetails: { amount: stats.totalSettlementAmount },
    },
    {
      title: "Settlement Remaining",
      value: money(stats.settlementRemaining),
      localDetails: { amount: stats.settlementRemaining },
    },
    {
      title: "Total Merchant Commission",
      value: money(stats.totalMerchantCommission),
      localDetails: { amount: stats.totalMerchantCommission },
    },
    {
      title: "Total Agent Commission",
      value: money(stats.totalAgentCommission),
      localDetails: { amount: stats.totalAgentCommission },
    },
    {
      title: "Payin Success Rate",
      value: `${Number(stats.successRate || 0)}%`,
      noDetails: true,
    },
    {
      title: "Settlement Remaining by Agent",
      value: money(stats.settlementRemainingByAgent),
      type: "settlementRemainingByAgent",
    },
    {
      title: "Commission By Agent",
      value: money(stats.commissionByAgent),
      type: "commissionByAgent",
    },
    {
      title: "Commission By Merchant",
      value: money(stats.commissionByMerchant),
      type: "commissionByMerchant",
    },
    {
      title: "PayIn Amount By Agent",
      value: money(stats.payinAmountByAgent),
      type: "payinAmountByAgent",
    },
    {
      title: "PayIn Amount By Merchant",
      value: money(stats.payinAmountByMerchant),
      type: "payinAmountByMerchant",
    },
    {
      title: "PayIn Amount By Agent",
      value: money(stats.payinAmountByAgent),
      type: "payinAmountByAgent",
    },
    {
      title: "PayIn Amount By Merchant",
      value: money(stats.payinAmountByMerchant),
      type: "payinAmountByMerchant",
    },
    {
      title: "PayIn Transactions By Agent",
      value: number(stats.payinTransactionsByAgent),
      type: "payinTransactionsByAgent",
    },
    {
      title: "PayIn Transactions By Merchant",
      value: number(stats.payinTransactionsByMerchant),
      type: "payinTransactionsByMerchant",
    },
    {
      title: "PayIn Transactions By Agent",
      value: number(stats.payinTransactionsByAgent),
      type: "payinTransactionsByAgent",
    },
    {
      title: "PayIn Transactions By Merchant",
      value: number(stats.payinTransactionsByMerchant),
      type: "payinTransactionsByMerchant",
    },
    {
      title: "Total PayIn Transactions",
      value: number(stats.totalPayinTransactions),
      type: "totalPayinTransactions",
    },
    {
      title: "Settlement Amount By Agent",
      value: money(stats.settlementAmountByAgent),
      type: "settlementAmountByAgent",
    },
    {
      title: "Settlement Amount By Merchant",
      value: money(stats.settlementAmountByMerchant),
      type: "settlementAmountByMerchant",
    },
    {
      title: "Settlement Amount By Agent",
      value: money(stats.settlementAmountByAgent),
      type: "settlementAmountByAgent",
    },
    {
      title: "Settlement Transactions By Agent",
      value: number(stats.settlementTransactionsByAgent),
      type: "settlementTransactionsByAgent",
    },
    {
      title: "Settlement Transactions By Merchant",
      value: number(stats.settlementTransactionsByMerchant),
      type: "settlementTransactionsByMerchant",
    },
    {
      title: "Settlement Transactions By Agent",
      value: number(stats.settlementTransactionsByAgent),
      type: "settlementTransactionsByAgent",
    },
    {
      title: "Total Settlement Transactions",
      value: number(stats.totalSettlementTransactions),
      type: "totalSettlementTransactions",
    },
  ];

  return (
    <div className="w-full px-3 sm:px-6 py-5 sm:py-8 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-10">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-black tracking-tight">
            {viewAgentId ? `${viewAgentName} Dashboard` : "Admin Dashboard"}
          </h1>

          {viewAgentId && (
            <p className="mt-1 text-sm font-semibold text-blue-700">
              Viewing only selected agent data
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#172554] mb-2">
              Merchant
            </label>
            <select
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              className="w-full sm:w-[200px] h-[44px] bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-[#2B7DE9] focus:border-[#2B7DE9]"
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, index) => (
          <div
            key={index}
            className="bg-white border border-[#d9e0ea] rounded-xl px-5 py-6 min-h-[134px]"
          >
            <p className="text-[14px] text-[#334155] font-medium mb-4">
              {card.title}
            </p>

            <h2 className="text-[18px] leading-none font-extrabold text-black mb-6">
              {card.value}
            </h2>

            {!card.noDetails && (
              <button
                type="button"
                onClick={() => openDetails(card)}
                className="text-[#0057ff] text-[14px] font-medium hover:underline"
              >
                Show More Details
              </button>
            )}
          </div>
        ))}
      </div>

      {modalTitle && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:w-[540px] max-h-[90vh] sm:max-h-[82vh] bg-white rounded-t-[18px] sm:rounded-[18px] px-5 pt-5 pb-4 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-5 top-5 w-10 h-10 rounded-full bg-[#f1f5f9] flex items-center justify-center text-[#94a3b8]"
            >
              <X size={22} />
            </button>

            <h2 className="text-[18px] font-bold text-black mb-4 pr-12">
              {modalTitle}
            </h2>

            <div className="max-h-[66vh] overflow-y-auto pr-2">
              {loading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : details.length === 0 ? (
                <div className="border border-[#d9e0ea] rounded-md">
                  <button
                    type="button"
                    className="w-full px-3 py-3 flex items-center justify-between"
                  >
                    <span className="font-semibold text-black">Details</span>
                    <ChevronDown size={18} />
                  </button>

                  <div className="border-t border-[#e5e7eb] px-3 py-3">
                    <p className="text-sm text-gray-500">No details found</p>
                  </div>
                </div>
              ) : (
                details.map((item, index) => (
                  <div
                    key={index}
                    className="border border-[#d9e0ea] rounded-md mb-3 overflow-hidden bg-white"
                  >
                    <button
                      type="button"
                      onClick={() => toggleAccordion(index)}
                      className="w-full px-3 py-3 flex items-center justify-between"
                    >
                      <span className="text-[15px] font-semibold text-black">
                        {item.name || "Details"}
                      </span>

                      {expanded[index] ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronUp size={18} />
                      )}
                    </button>

                    {expanded[index] && (
                      <div className="border-t border-[#e5e7eb] px-3 py-3">
                        {renderFields(item)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
