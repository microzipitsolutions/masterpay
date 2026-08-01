import { useEffect, useState } from "react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";
import { X, Info } from "lucide-react";
import { Link } from "react-router-dom";
import DateViewFilter from "../../components/DateViewFilter";
import { computeDateRange } from "../../utils/dateViewFilter";

function AgentDashboard() {
  const defaultRange = computeDateRange("current_month");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [stats, setStats] = useState({
    totalPayinAmount: 0,
    totalPayinTransactions: 0,
    totalCommissionAmount: 0,
    totalOutstandingAmount: 0,
    payinAmountByAgent: 0,
    payinTransactionsByAgent: 0,
    successRate: 0,
    pendingVerifications: 0,
    agents: [],
    totalWithdrawalAmount: 0,
    withdrawalAgents: [],
    totalSettlementAmount: 0,
    settlementAgents: [],
    // Wallet-derived figures (folded in from the former Agent Dashboard).
    settlementRemaining: 0,
    settlementAmount: 0,
  });

  const [modalTitle, setModalTitle] = useState("");
  const [modalRows, setModalRows] = useState([]);

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  const fetchDashboard = async () => {
    try {
      const params = new URLSearchParams();

      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await api.get(`/api/agent-dashboard?${params.toString()}`);
      setStats((prev) => ({ ...prev, ...res.data }));
    } catch (error) {
      console.log("Agent dashboard fetch error:", error);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [startDate, endDate]);

  const openAgentAmount = () => {
    setModalTitle("PayIn Amount By Agent");
    setModalRows(
      (stats.agents || []).map((item) => ({
        Agent: item.name,
        Amount: money(item.amount),
      }))
    );
  };

  const openAgentTransactions = () => {
    setModalTitle("PayIn Transactions By Agent");
    setModalRows(
      (stats.agents || []).map((item) => ({
        Agent: item.name,
        Transactions: item.transactions,
      }))
    );
  };

  const openWithdrawalByAgent = () => {
    setModalTitle("Withdrawal Amount By Agent");
    setModalRows(
      (stats.withdrawalAgents || []).map((item) => ({
        Agent: item.name,
        Amount: money(item.amount),
      }))
    );
  };

  const openSettlementByAgent = () => {
    setModalTitle("Settlement Amount By Agent");
    setModalRows(
      (stats.settlementAgents || []).map((item) => ({
        Agent: item.name,
        Amount: money(item.amount),
      }))
    );
  };

  const cards = [
    {
      title: "Total PayIn Amount",
      value: money(stats.totalPayinAmount),
    },
    {
      title: "Total PayIn Transactions",
      value: stats.totalPayinTransactions,
    },
    {
      title: "Total Commission Amount",
      value: money(stats.totalCommissionAmount),
    },
    {
      title: "Total Outstanding Amount",
      value: money(stats.totalOutstandingAmount),
    },
     {
      title: "Total Withdrawal Amount",
      value: money(stats.totalWithdrawalAmount),
      onClick: openWithdrawalByAgent,
    },
    {
      title: "Total Settlement Amount",
      value: money(stats.totalSettlementAmount),
      onClick: openSettlementByAgent,
    },
    {
      title: "PayIn Amount By Agent",
      value: money(stats.payinAmountByAgent),
      onClick: openAgentAmount,
    },
    {
      title: "PayIn Transactions By Agent",
      value: stats.payinTransactionsByAgent,
      onClick: openAgentTransactions,
    },
    {
      title: "Success Rate",
      value: `${stats.successRate || 0}%`,
    },
    {
      title: "Pending Verifications",
      value: stats.pendingVerifications,
    },

  ];

  return (
    <AgentLayout>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-8 bg-[#f8fafc] min-h-screen">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Agent Dashboard
          </h1>

          <DateViewFilter onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }} />
        </div>

        {/* Settlement Remaining / Settlement Amount — derived from the Agent
            wallet + ledger (see Top Up Funds for wallet balance, top-up
            history, and ledger detail; no "Wallet Balance" card lives here by
            design). Kept in its own highlighted group, separate from "Total
            Settlement Amount" below (an unrelated, pre-existing figure from
            the settlement-transactions payout flow), so the two don't read
            as duplicates of each other. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-6">
            <p className="text-[14px] text-emerald-800 font-medium mb-2 flex items-center gap-1.5">
              Settlement Remaining
              <span title="Your current available funded balance — approved top-ups minus what's been consumed by routed Pay-Ins, refunded automatically if a Pay-In fails/expires/is rejected.">
                <Info size={14} className="text-emerald-500" />
              </span>
            </p>
            <h2 className="text-[22px] leading-none font-extrabold text-emerald-900">
              {money(stats.settlementRemaining)}
            </h2>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-6">
            <p className="text-[14px] text-slate-700 font-medium mb-2 flex items-center gap-1.5">
              Settlement Amount
              <span title="How much of your approved top-up balance has been consumed by Pay-Ins so far (net of any refunds).">
                <Info size={14} className="text-slate-400" />
              </span>
            </p>
            <h2 className="text-[22px] leading-none font-extrabold text-slate-900">
              {money(stats.settlementAmount)}
            </h2>
          </div>
        </div>
        <Link to="/agent/wallet/top-up" className="inline-block text-sm font-semibold text-[#2B7DE9] mb-6 hover:underline">
          Top Up Funds →
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-xl p-5 min-h-[140px]"
            >
              <p className="text-sm font-semibold text-gray-700 mb-4">
                {card.title}
              </p>

              <h2 className="text-2xl font-bold text-black">
                {card.value}
              </h2>

              {card.onClick && (
                <button
                  type="button"
                  onClick={card.onClick}
                  className="mt-5 text-sm font-semibold text-blue-600 hover:underline"
                >
                  Show More Details
                </button>
              )}
            </div>
          ))}
        </div>

        {modalTitle && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:w-[620px] max-h-[90vh] sm:max-h-[80vh] bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 relative">
              <button
                type="button"
                onClick={() => {
                  setModalTitle("");
                  setModalRows([]);
                }}
                className="absolute right-5 top-5 rounded-full bg-gray-100 p-2"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-bold mb-5">{modalTitle}</h2>

              <div className="overflow-auto max-h-[60vh]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      {modalRows[0] &&
                        Object.keys(modalRows[0]).map((key) => (
                          <th
                            key={key}
                            className="text-left text-sm font-bold px-4 py-3"
                          >
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>

                  <tbody>
                    {modalRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          No details found
                        </td>
                      </tr>
                    ) : (
                      modalRows.map((row, index) => (
                        <tr key={index} className="border-b">
                          {Object.values(row).map((value, i) => (
                            <td key={i} className="px-4 py-3 text-sm">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AgentLayout>
  );
}

export default AgentDashboard;
