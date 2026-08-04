import { useEffect, useMemo, useState } from "react";
import { Search, Pencil, X } from "lucide-react";
import api from "../../api";
import AgentLayout from "../../layouts/AgentLayout";

function timeAgo(value) {
  if (!value) return "Never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60000) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
};

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

function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [viewAccount, setViewAccount] = useState(null);
  const [editAccount, setEditAccount] = useState(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    ifsc_code: "",
    account_number: "",
    account_holder_name: "",
    upi_id: "",
    max_payment_limit: "",
    min_transaction_amount: "0",
    is_active: true,
  });

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/agent-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    const term = search.toLowerCase().trim();
    return accounts.filter((item) => {
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
  }, [accounts, search, status, startDate, endDate]);

  const handleCreateChange = (e) => {
    setCreateForm({ ...createForm, [e.target.name]: e.target.value });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      setCreating(true);
      await api.post("/api/agent-accounts", createForm);
      alert("Account saved successfully");
      setShowCreate(false);
      setCreateForm({
        ifsc_code: "",
        account_number: "",
        account_holder_name: "",
        upi_id: "",
        max_payment_limit: "",
        min_transaction_amount: "0",
        is_active: true,
      });
      fetchAccounts();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Failed to save account");
    } finally {
      setCreating(false);
    }
  };

  const handleEditChange = (e) => {
    setEditAccount({ ...editAccount, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/agent-accounts/${editAccount.id}`, editAccount);
      alert("Account updated successfully");
      setEditAccount(null);
      fetchAccounts();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Failed to update account");
    }
  };

  return (
    <AgentLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Accounts List</h1>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-semibold text-slate-800 mb-2">Search</label>
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full sm:w-56 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]"
                />
                <button className="h-[50px] w-[50px] rounded-xl border border-slate-300 bg-white flex items-center justify-center">
                  <Search size={20} />
                </button>
              </div>
            </div>
            <div className="w-full sm:w-auto">
              <label className="block text-sm font-semibold text-slate-800 mb-2">Select Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#2B7DE9]">
                <option value="">All</option>
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
            <button
              onClick={() => downloadCsv("agent-accounts.csv", filteredAccounts)}
              className="w-full sm:w-auto rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white"
            >
              Export ⬇
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="w-full sm:w-auto rounded-lg bg-[#2B7DE9] px-4 py-3 text-sm font-semibold text-white"
            >
              + Create Account
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-4 font-bold">ID</th>
                <th className="text-left px-6 py-4 font-bold">Bank Name</th>
                <th className="text-left px-6 py-4 font-bold">IFSC Code</th>
                <th className="text-left px-6 py-4 font-bold">Account Number</th>
                <th className="text-left px-6 py-4 font-bold">Account Holder Name</th>
                <th className="text-left px-6 py-4 font-bold">UPI ID</th>
                <th className="text-left px-6 py-4 font-bold">Is Active</th>
                <th className="text-left px-6 py-4 font-bold">Last Active</th>
                <th className="text-left px-6 py-4 font-bold">Action</th>
                <th className="text-left px-6 py-4 font-bold">View</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" className="text-center py-8">Loading...</td></tr>
              ) : filteredAccounts.length === 0 ? (
                <tr><td colSpan="10" className="text-center py-8">No accounts found</td></tr>
              ) : (
                filteredAccounts.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-6 py-6">{item.id}</td>
                    <td className="px-6 py-6">{item.bank_name}</td>
                    <td className="px-6 py-6">{item.ifsc_code}</td>
                    <td className="px-6 py-6">{item.account_number}</td>
                    <td className="px-6 py-6">{item.account_holder_name}</td>
                    <td className="px-6 py-6">{item.upi_id}</td>
                    <td className="px-6 py-6"><StatusBadge value={item.is_active} /></td>
                    <td className="px-6 py-6 whitespace-nowrap text-sm text-gray-600">{timeAgo(item.last_active)}</td>
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditAccount(item)}
                          title="Edit"
                          className="w-9 h-9 rounded-full bg-[#eef3fb] text-[#2B7DE9] flex items-center justify-center"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <button onClick={() => setViewAccount(item)} className="text-[#2B7DE9] underline">
                        View All
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-3xl p-6 sm:p-10 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowCreate(false)}
                className="absolute top-6 right-6 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X />
              </button>

              <h2 className="text-2xl font-bold mb-6">Account Form</h2>

              <form onSubmit={handleCreateSubmit} className="space-y-5">
                <div>
                  <label className="font-semibold text-sm">Account Number <span className="text-red-500">*</span></label>
                  <input name="account_number" value={createForm.account_number} onChange={handleCreateChange} required
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">IFSC Code <span className="text-red-500">*</span></label>
                  <input name="ifsc_code" value={createForm.ifsc_code} onChange={handleCreateChange} required placeholder="e.g IDIB000A180"
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Account Holder Name <span className="text-red-500">*</span></label>
                  <input name="account_holder_name" value={createForm.account_holder_name} onChange={handleCreateChange} required
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Upi Id <span className="text-red-500">*</span></label>
                  <input name="upi_id" value={createForm.upi_id} onChange={handleCreateChange} required
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Max Payment Limit <span className="text-red-500">*</span></label>
                  <input type="number" name="max_payment_limit" value={createForm.max_payment_limit} onChange={handleCreateChange} required
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Minimum Transaction Amount <span className="text-red-500">*</span></label>
                  <input type="number" name="min_transaction_amount" value={createForm.min_transaction_amount} onChange={handleCreateChange} required
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateForm({ ...createForm, is_active: !createForm.is_active })}
                    className={`w-12 h-7 rounded-full relative transition ${createForm.is_active ? "bg-[#2B7DE9]" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${createForm.is_active ? "left-6" : "left-1"}`} />
                  </button>
                  <span className="text-sm font-semibold">Is Active</span>
                </div>
                <div className="flex justify-end pt-5">
                  <button type="submit" disabled={creating} className="bg-[#2B7DE9] text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-60">
                    {creating ? "Saving..." : "Save Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit modal */}
        {editAccount && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-3xl p-6 sm:p-10 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setEditAccount(null)}
                className="absolute top-6 right-6 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X />
              </button>

              <form onSubmit={handleUpdate} className="space-y-5">
                <div>
                  <label className="font-semibold text-sm">Account Number <span className="text-red-500">*</span></label>
                  <input name="account_number" value={editAccount.account_number || ""} onChange={handleEditChange}
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">IFSC Code <span className="text-red-500">*</span></label>
                  <input name="ifsc_code" value={editAccount.ifsc_code || ""} onChange={handleEditChange}
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Account Holder Name <span className="text-red-500">*</span></label>
                  <input name="account_holder_name" value={editAccount.account_holder_name || ""} onChange={handleEditChange}
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Upi Id <span className="text-red-500">*</span></label>
                  <input name="upi_id" value={editAccount.upi_id || ""} onChange={handleEditChange}
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Max Payment Limit (Daily) <span className="text-red-500">*</span></label>
                  <input type="number" name="max_payment_limit" value={editAccount.max_payment_limit || ""} onChange={handleEditChange}
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div>
                  <label className="font-semibold text-sm">Minimum Transaction Amount <span className="text-red-500">*</span></label>
                  <input type="number" name="min_transaction_amount" value={editAccount.min_transaction_amount || ""} onChange={handleEditChange}
                    className="mt-2 w-full h-12 border border-gray-300 rounded-lg px-4 outline-none focus:border-[#2B7DE9]" />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditAccount({ ...editAccount, is_active: !editAccount.is_active })}
                    className={`w-12 h-7 rounded-full relative transition ${editAccount.is_active ? "bg-[#2B7DE9]" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition ${editAccount.is_active ? "left-6" : "left-1"}`} />
                  </button>
                  <span className="text-sm font-semibold">Is Active</span>
                </div>
                <div className="flex justify-end pt-5">
                  <button type="submit" className="bg-[#2B7DE9] text-white px-8 py-3 rounded-lg font-semibold">
                    Save Account
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View modal */}
        {viewAccount && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-3xl p-6 sm:p-10 relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setViewAccount(null)}
                className="absolute top-6 right-6 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <X />
              </button>

              <h2 className="text-2xl font-bold mb-6">Account Details</h2>

              <div className="border-l border-gray-200 pl-4">
                {[
                  ["Bank Name", viewAccount.bank_name],
                  ["Ifsc Code", viewAccount.ifsc_code],
                  ["Account Number", viewAccount.account_number],
                  ["Account Holder Name", viewAccount.account_holder_name],
                  ["Upi Id", viewAccount.upi_id],
                  ["Min Transaction Amount", viewAccount.min_transaction_amount],
                  ["Max Payment Limit (Daily Cap)", viewAccount.max_payment_limit],
                  ["Status", String(viewAccount.is_active)],
                  ["Created", formatDate(viewAccount.created_at)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-gray-200 py-2">
                    <span className="font-semibold">{label}</span>
                    <span className="text-gray-600">{value || "-"}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-8">
                <button onClick={() => setViewAccount(null)} className="border border-gray-300 px-8 py-3 rounded-lg font-semibold">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AgentLayout>
  );
}

export default Accounts;
