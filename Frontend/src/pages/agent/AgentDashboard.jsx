import { useEffect, useState } from "react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";
import { Info, Wallet, Receipt, Percent, Clock, ArrowDownToLine, HandCoins, Users, ListChecks } from "lucide-react";
import { Link } from "react-router-dom";
import DateViewFilter from "../../components/DateViewFilter";
import { computeDateRange } from "../../utils/dateViewFilter";
import { PageHeader, KpiCard, Modal } from "../../components/ui";

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
    { title: "Total PayIn Amount", value: money(stats.totalPayinAmount), icon: ArrowDownToLine, tone: "brand" },
    { title: "Total PayIn Transactions", value: stats.totalPayinTransactions, icon: Receipt },
    { title: "Total Commission Amount", value: money(stats.totalCommissionAmount), icon: HandCoins },
    { title: "Total Outstanding Amount", value: money(stats.totalOutstandingAmount), icon: Wallet },
    { title: "Total Withdrawal Amount", value: money(stats.totalWithdrawalAmount), onClick: openWithdrawalByAgent, icon: ArrowDownToLine },
    { title: "Total Settlement Amount", value: money(stats.totalSettlementAmount), onClick: openSettlementByAgent, icon: HandCoins },
    { title: "PayIn Amount By Agent", value: money(stats.payinAmountByAgent), onClick: openAgentAmount, icon: Users },
    { title: "PayIn Transactions By Agent", value: stats.payinTransactionsByAgent, onClick: openAgentTransactions, icon: ListChecks },
    { title: "Success Rate", value: `${stats.successRate || 0}%`, icon: Percent },
    { title: "Pending Verifications", value: stats.pendingVerifications, icon: Clock },
  ];

  return (
    <AgentLayout>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-8 bg-white min-h-screen">
        <PageHeader
          title="Agent Dashboard"
          actions={<DateViewFilter onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }} />}
          className="mb-6 sm:mb-8"
        />

        {/* Settlement Remaining / Settlement Amount — derived from the Agent
            wallet + ledger (see Top Up Funds for wallet balance, top-up
            history, and ledger detail; no "Wallet Balance" card lives here by
            design). Kept in its own highlighted group, separate from "Total
            Settlement Amount" below (an unrelated, pre-existing figure from
            the settlement-transactions payout flow), so the two don't read
            as duplicates of each other. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-card border border-brand-teal/25 bg-brand-teal-light px-5 py-6">
            <p className="text-sm text-brand-teal-dark font-semibold mb-2 flex items-center gap-1.5">
              Settlement Remaining
              <span title="Your current available funded balance — approved top-ups minus what's been consumed by routed Pay-Ins, refunded automatically if a Pay-In fails/expires/is rejected.">
                <Info size={14} className="text-brand-teal-dark/70" />
              </span>
            </p>
            <h2 className="text-2xl leading-none font-extrabold text-navy-900">
              {money(stats.settlementRemaining)}
            </h2>
          </div>
          <div className="rounded-card border border-slate-200 bg-white px-5 py-6 shadow-card">
            <p className="text-sm text-slate-600 font-semibold mb-2 flex items-center gap-1.5">
              Settlement Amount
              <span title="How much of your approved top-up balance has been consumed by Pay-Ins so far (net of any refunds).">
                <Info size={14} className="text-slate-400" />
              </span>
            </p>
            <h2 className="text-2xl leading-none font-extrabold text-navy-900">
              {money(stats.settlementAmount)}
            </h2>
          </div>
        </div>
        <Link to="/agent/wallet/top-up" className="inline-block text-sm font-semibold text-brand-blue mb-6 hover:underline">
          Top Up Funds →
        </Link>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, index) => (
            <div key={index}>
              <KpiCard label={card.title} value={card.value} icon={card.icon} tone={card.tone} />
              {card.onClick && (
                <button
                  type="button"
                  onClick={card.onClick}
                  className="mt-2 text-sm font-semibold text-brand-blue hover:underline"
                >
                  Show More Details
                </button>
              )}
            </div>
          ))}
        </div>

        <Modal open={!!modalTitle} onClose={() => { setModalTitle(""); setModalRows([]); }} title={modalTitle} maxWidth="max-w-2xl">
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  {modalRows[0] &&
                    Object.keys(modalRows[0]).map((key) => (
                      <th
                        key={key}
                        className="text-left text-sm font-bold px-4 py-3 text-navy-900"
                      >
                        {key}
                      </th>
                    ))}
                </tr>
              </thead>

              <tbody>
                {modalRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-sm text-slate-500">
                      No details found
                    </td>
                  </tr>
                ) : (
                  modalRows.map((row, index) => (
                    <tr key={index} className="border-b border-slate-100">
                      {Object.values(row).map((value, i) => (
                        <td key={i} className="px-4 py-3 text-sm text-slate-700">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      </div>
    </AgentLayout>
  );
}

export default AgentDashboard;
