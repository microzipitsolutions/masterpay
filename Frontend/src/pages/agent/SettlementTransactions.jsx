import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import AgentLayout from "../../layouts/AgentLayout";

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
};

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function StatusBadge({ value }) {
  const text = value || "Pending";
  const ok = value === "Approved";
  const pending = !value || value === "Pending";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-green-50 text-green-700" : pending ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
      {text}
    </span>
  );
}

function SettlementTransactions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get("/api/settlement-transactions");
        setRows(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        console.error(error);
        alert(error?.response?.data?.message || "Could not load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase().trim();
    return rows.filter((item) => {
      const haystack = Object.values(item).join(" ").toLowerCase();
      if (term && !haystack.includes(term)) return false;
      if (status && (item.transaction_status || "Pending") !== status) return false;
      const created = item.created_at ? new Date(item.created_at) : null;
      if (startDate && created && created < new Date(startDate)) return false;
      if (endDate && created) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (created > end) return false;
      }
      return true;
    });
  }, [rows, search, status, startDate, endDate]);

  return (
    <AgentLayout>
      <div className="space-y-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Settlement Transactions</h1>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-semibold text-slate-800 mb-2">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full sm:w-56 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]" />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-semibold text-slate-800 mb-2">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]">
              <option value="">All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-semibold text-slate-800 mb-2">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]" />
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-semibold text-slate-800 mb-2">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#1E88FF]" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-950">
              <tr>
                <th className="px-5 py-4">ID</th>
                <th className="px-5 py-4">Amount</th>
                <th className="px-5 py-4">UTR Number</th>
                <th className="px-5 py-4">Source</th>
                <th className="px-5 py-4">Agent</th>
                <th className="px-5 py-4">Merchant</th>
                <th className="px-5 py-4">Created Date</th>
                <th className="px-5 py-4">Approved/Rejected Date</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-5 py-8 text-slate-500">Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-8 text-slate-500">No records found.</td></tr>
              ) : filteredRows.map((item) => {
                const source = item.agent_id
                  ? `Agent (${item.agent_name || item.agent_id})`
                  : "Agent / Admin";
                return (
                  <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-5 py-4">{item.id}</td>
                    <td className="px-5 py-4">{money(item.amount)}</td>
                    <td className="px-5 py-4">{item.utr_number || "-"}</td>
                    <td className="px-5 py-4">{source}</td>
                    <td className="px-5 py-4">{item.agent_name || "-"}</td>
                    <td className="px-5 py-4">{item.merchant_name || "-"}</td>
                    <td className="px-5 py-4">{formatDate(item.created_at)}</td>
                    <td className="px-5 py-4">{formatDate(item.approved_or_reject_date)}</td>
                    <td className="px-5 py-4"><StatusBadge value={item.transaction_status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AgentLayout>
  );
}

export default SettlementTransactions;
