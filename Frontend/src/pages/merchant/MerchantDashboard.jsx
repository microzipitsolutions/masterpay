import { useEffect, useState } from "react";
import api from "../../api";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import MerchantLayout from "../../layouts/MerchantLayout";
import DateViewFilter from "../../components/DateViewFilter";
import { computeDateRange } from "../../utils/dateViewFilter";

function MerchantDashboard() {
  const defaultRange = computeDateRange("current_month");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);

  const [stats, setStats] = useState({
    totalOutstandingAmount: 0,
    totalCommissionAmount: 0,
    totalPayinAmount: 0,
    totalSettlementAmount: 0,
    totalWithdrawalAmount: 0,
    totalPayinTransactions: 0,
    payinAmountByMerchant: 0,
    payinTransactionsByMerchant: 0,
    successRate: 0,
  });

  const [modalTitle, setModalTitle] = useState("");
  const [details, setDetails] = useState([]);
  const [expanded, setExpanded] = useState({ 0: true });
  const [loading, setLoading] = useState(false);

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  const number = (value) => Number(value || 0).toLocaleString("en-IN");

  const getToken = () => localStorage.getItem("rdpay_token");

  const fetchDashboard = async () => {
    try {
      const params = {};

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get("/api/merchant-dashboard", {
        params,
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      setStats(res.data);
    } catch (error) {
      console.log("Merchant dashboard fetch error:", error);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [startDate, endDate]);

  const openDetails = async (card) => {
    setModalTitle(card.title);
    setExpanded({ 0: true });

    if (card.localDetails) {
      setDetails([
        {
          name: "Record 1",
          fields: card.localDetails,
        },
      ]);
      return;
    }

    try {
      setLoading(true);

      const params = {};

      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get(
        `/api/merchant-dashboard/details?type=${card.type}`,
        {
          params,
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        }
      );

      const rows = Array.isArray(res.data) ? res.data : [];

      setDetails(
        rows.map((row, index) => ({
          name:
            row.name ||
            row.merchantname ||
            row.merchant_name ||
            `Record ${index + 1}`,
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
      amount: "Amount",
      approved: "Approved",
      pending: "Pending",
      rejected: "Reject",
      totaltransactions: "TotalTransactions",
      total_transactions: "TotalTransactions",
      merchantid: "MerchantId",
      merchant_id: "MerchantId",
      merchantname: "MerchantName",
      merchant_name: "MerchantName",
      successrate: "SuccessRate",
      success_rate: "SuccessRate",
    };

    return labels[key.toLowerCase()] || key;
  };

  const formatValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "-";

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
    {
      title: "Total PayIn Amount",
      value: money(stats.totalPayinAmount),
      localDetails: { amount: stats.totalPayinAmount },
    },

    {
      title: "Total Settlement Amount",
      value: money(stats.totalSettlementAmount),
      localDetails: { amount: stats.totalSettlementAmount },
    },

    {
      title: "Settlement Remaining",
      value: money(stats.totalOutstandingAmount),
      localDetails: { amount: stats.totalOutstandingAmount },
    },

    {
      title: "Total Outstanding Amount",
      value: money(stats.totalOutstandingAmount),
      localDetails: { amount: stats.totalOutstandingAmount },
    },
    {
  title: "Total Withdrawal Amount",
  value: money(stats.totalWithdrawalAmount),
  localDetails: { amount: stats.totalWithdrawalAmount },
},

    {
      title: "Total Commission Amount",
      value: money(stats.totalCommissionAmount),
      localDetails: { amount: stats.totalCommissionAmount },
    },

    {
      title: "Total PayIn Transactions",
      value: number(stats.totalPayinTransactions),
      type: "totalPayinTransactions",
    },

    {
      title: "PayIn Amount By Merchant",
      value: money(stats.payinAmountByMerchant),
      type: "payinAmountByMerchant",
    },

    {
      title: "PayIn Transactions By Merchant",
      value: number(stats.payinTransactionsByMerchant),
      type: "payinTransactionsByMerchant",
    },

    {
      title: "Success Rate",
      value: stats.successRate,
      localDetails: { successRate: stats.successRate },
    },
  ];

  return (
    <MerchantLayout>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-8 bg-[#f8fafc] min-h-screen">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-[28px] font-bold text-black tracking-tight">
            Merchant Dashboard
          </h1>

          <DateViewFilter onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
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

              <button
                type="button"
                onClick={() => openDetails(card)}
                className="text-[#0057ff] text-[14px] font-medium hover:underline"
              >
                Show More Details
              </button>
            </div>
          ))}
        </div>

        {modalTitle && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:w-[540px] max-h-[82vh] bg-white rounded-t-2xl sm:rounded-[18px] px-5 pt-5 pb-4 relative">
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
                          <ChevronUp size={18} />
                        ) : (
                          <ChevronDown size={18} />
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
    </MerchantLayout>
  );
}

export default MerchantDashboard;