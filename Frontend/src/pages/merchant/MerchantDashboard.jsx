import { useEffect, useState } from "react";
import api from "../../api";
import { ChevronDown, ChevronUp, ArrowDownToLine, HandCoins, Wallet, Receipt, Users, ListChecks, Percent } from "lucide-react";
import MerchantLayout from "../../layouts/MerchantLayout";
import DateViewFilter from "../../components/DateViewFilter";
import { computeDateRange } from "../../utils/dateViewFilter";
import { PageHeader, KpiCard, Modal } from "../../components/ui";

const CARD_ICONS = {
  "Total PayIn Amount": ArrowDownToLine,
  "Total Settlement Amount": HandCoins,
  "Settlement Remaining": Wallet,
  "Total Outstanding Amount": Wallet,
  "Total Withdrawal Amount": ArrowDownToLine,
  "Total Commission Amount": HandCoins,
  "Total PayIn Transactions": Receipt,
  "PayIn Amount By Merchant": Users,
  "PayIn Transactions By Merchant": ListChecks,
  "Success Rate": Percent,
};

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
          <span className="text-[13px] text-slate-500">
            {formatLabel(key)}
          </span>

          <span className="text-[13px] text-navy-900 font-semibold text-right break-all">
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
      value: `${Number(stats.successRate || 0)}%`,
      localDetails: { successRate: stats.successRate },
    },
  ];

  return (
    <MerchantLayout>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-8 bg-white min-h-screen">
        <PageHeader
          title="Merchant Dashboard"
          actions={<DateViewFilter onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }} />}
          className="mb-6 sm:mb-10"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
          {cards.map((card, index) => (
            <div key={index}>
              <KpiCard
                label={card.title}
                value={card.value}
                icon={CARD_ICONS[card.title]}
                tone={index === 0 ? "brand" : "light"}
              />
              <button
                type="button"
                onClick={() => openDetails(card)}
                className="mt-2 text-sm font-semibold text-brand-blue hover:underline"
              >
                Show More Details
              </button>
            </div>
          ))}
        </div>

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
                      <ChevronUp size={18} className="text-slate-400" />
                    ) : (
                      <ChevronDown size={18} className="text-slate-400" />
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
    </MerchantLayout>
  );
}

export default MerchantDashboard;
