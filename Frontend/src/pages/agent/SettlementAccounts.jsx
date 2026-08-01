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
  const text = value === true ? "Yes" : value === false ? "No" : value || "-";
  const ok = ["Approved", "Success", "Yes", true].includes(value) || value === "Approved";
  const pending = value === "Pending";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-green-50 text-green-700" : pending ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-600"}`}>
      {text}
    </span>
  );
}

function Toolbar({ search, setSearch, status, setStatus, startDate, setStartDate, endDate, setEndDate, onExport }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Search</label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full sm:w-56 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]" />
      </div>
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Select Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]">
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">Start Date</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]" />
      </div>
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-slate-800 mb-2">End Date</label>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-auto rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]" />
      </div>
      {onExport && <button onClick={onExport} className="w-full sm:w-auto rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white">Export ⬇</button>}
    </div>
  );
}

function downloadCsv(filename, rows) {
  if (!rows.length) return alert("No data to export");
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SettlementAccounts() {
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
        const res = await api.get("/api/settlement-accounts");
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
      
    if (status) {
      if (status === "true" || status === "false") {
        const boolStatus = status === "true";
        if (item.is_active !== boolStatus) return false;
      } else if ((item.status || item.transaction_status) !== status) return false;
    }
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
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settlement Accounts List</h1>
          <Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}  />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-950">
              <tr>
              <th className="px-5 py-4">ID</th>
              <th className="px-5 py-4">Merchant</th>
              <th className="px-5 py-4">Bank Name</th>
              <th className="px-5 py-4">IFSC Code</th>
              <th className="px-5 py-4">Account Number</th>
              <th className="px-5 py-4">Account Holder Name</th>
              <th className="px-5 py-4">UPI ID</th>
              <th className="px-5 py-4">Is Active</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-8 text-slate-500">Loading...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-8 text-slate-500">No records found.</td></tr>
              ) : filteredRows.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-5 py-4">{item.id}</td>
                <td className="px-5 py-4">{item.merchant_name || "-"}</td>
                <td className="px-5 py-4">{item.bank_name || "-"}</td>
                <td className="px-5 py-4">{item.ifsc_code || "-"}</td>
                <td className="px-5 py-4">{item.account_number || "-"}</td>
                <td className="px-5 py-4">{item.account_holder_name || "-"}</td>
                <td className="px-5 py-4">{item.upi_id || "-"}</td>
                <td className="px-5 py-4"><StatusBadge value={item.is_active} /></td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AgentLayout>
  );
}

export default SettlementAccounts;
