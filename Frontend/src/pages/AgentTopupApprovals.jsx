import { useEffect, useState } from "react";
import api from "../api";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function StatusBadge({ value }) {
  const v = value || "Pending";
  const cls =
    v === "Approved"
      ? "bg-green-100 text-green-700"
      : v === "Rejected"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{v}</span>
  );
}

// Layout-agnostic — rendered bare inside admin's ProtectedLayout (already
// supplies Sidebar/Topbar) and inside a SuperAdminLayout wrapper for
// super-admin (see pages/superadmin/AgentTopups.jsx), same pattern as
// WithdrawalTransactions / superadmin/Withdrawals.
function AgentTopupApprovals() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [updatingId, setUpdatingId] = useState(null);
  const [reasonMap, setReasonMap] = useState({});
  const [notesMap, setNotesMap] = useState({});

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setMessage("");
      const params = { page, limit: 20 };
      if (status) params.status = status;
      if (method) params.method = method;
      if (search) params.search = search;
      const res = await api.get("/api/admin/agent-topups", { params });
      setRows(res.data?.data || []);
      setTotalPages(res.data?.totalPages || 1);
    } catch (e) {
      setMessageType("error");
      setMessage(e?.response?.data?.message || "Could not load top-up requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, method]);

  const search_ = () => {
    setPage(1);
    load();
  };

  const approve = async (id) => {
    setMessage("");
    try {
      setUpdatingId(id);
      await api.put(`/api/admin/agent-topups/${id}/approve`, { notes: (notesMap[id] || "").trim() });
      setMessageType("success");
      setMessage("Top-up approved and credited to agent's wallet.");
      load();
    } catch (e) {
      setMessageType("error");
      setMessage(e?.response?.data?.message || "Could not approve top-up");
    } finally {
      setUpdatingId(null);
    }
  };

  const reject = async (id) => {
    const reason = (reasonMap[id] || "").trim();
    if (!reason) {
      setMessageType("error");
      setMessage("A rejection reason is required");
      return;
    }
    setMessage("");
    try {
      setUpdatingId(id);
      await api.put(`/api/admin/agent-topups/${id}/reject`, { reason });
      setMessageType("success");
      setMessage("Top-up rejected.");
      load();
    } catch (e) {
      setMessageType("error");
      setMessage(e?.response?.data?.message || "Could not reject top-up");
    } finally {
      setUpdatingId(null);
    }
  };

  const viewProof = async (id) => {
    try {
      const res = await api.get(`/api/agent-topups/${id}/proof`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch (e) {
      alert(e?.response?.data?.message || "Could not load proof");
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Agent Top-Up Approvals</h1>
      <p className="text-sm text-gray-500">
        Review Agent top-up requests: payment method, amount, UTR/transaction hash, and proof —
        then approve to credit the agent's wallet or reject with a reason.
      </p>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            messageType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search_()}
            placeholder="Agent name / username..."
            className="w-full sm:w-60 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
          <select
            value={status}
            onChange={(e) => { setPage(1); setStatus(e.target.value); }}
            className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          >
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Method</label>
          <select
            value={method}
            onChange={(e) => { setPage(1); setMethod(e.target.value); }}
            className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          >
            <option value="">All</option>
            <option value="USDT">USDT</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
        </div>
        <button
          onClick={search_}
          className="rounded-xl bg-[#1E88FF] text-white font-semibold px-5 py-3 text-sm hover:bg-[#0b2a5b]"
        >
          Search
        </button>
      </div>

      <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-700">
            <tr>
              <th className="px-5 py-4 font-semibold">Agent</th>
              <th className="px-5 py-4 font-semibold">Method</th>
              <th className="px-5 py-4 font-semibold">Top-Up</th>
              <th className="px-5 py-4 font-semibold">Commission</th>
              <th className="px-5 py-4 font-semibold">Final Credit</th>
              <th className="px-5 py-4 font-semibold">UTR / Hash</th>
              <th className="px-5 py-4 font-semibold">Submitted</th>
              <th className="px-5 py-4 font-semibold">Proof</th>
              <th className="px-5 py-4 font-semibold">Status</th>
              <th className="px-5 py-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-slate-400">No top-up requests found.</td></tr>
            ) : (
              rows.map((row) => {
                const isPending = (row.status || "Pending") === "Pending";
                const isUpdating = updatingId === row.id;
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-800">{row.agent_name}</div>
                      <div className="text-xs text-slate-500">@{row.agent_username}</div>
                    </td>
                    <td className="px-5 py-4">{row.method === "USDT" ? "USDT" : "Bank Transfer"}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {money(row.amount)}
                      {row.usdt_amount && <div className="text-xs font-normal text-slate-500">{Number(row.usdt_amount)} USDT × ₹{Number(row.usdt_rate)}</div>}
                    </td>
                    <td className="px-5 py-4">{money(row.commission_amount ?? (Number(row.amount) * Number(row.agent_commission_percent || 0) / 100))}<div className="text-xs text-slate-500">{Number(row.commission_percent ?? row.agent_commission_percent ?? 0)}%</div></td>
                    <td className="px-5 py-4 font-semibold">{money(row.final_amount ?? (Number(row.amount) * (1 + Number(row.agent_commission_percent || 0) / 100)))}</td>
                    <td className="px-5 py-4 font-mono text-xs break-all">
                      {row.method === "USDT" ? row.usdt_tx_hash : row.bank_utr}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(row.submitted_at)}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => viewProof(row.id)} className="text-[#1E88FF] underline text-xs">
                        View
                      </button>
                    </td>
                    <td className="px-5 py-4"><StatusBadge value={row.status} /></td>
                    <td className="px-5 py-4">
                      {isPending ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <textarea
                            rows={2}
                            value={reasonMap[row.id] || ""}
                            onChange={(e) =>
                              setReasonMap((prev) => ({ ...prev, [row.id]: e.target.value }))
                            }
                            placeholder="Rejection reason (required to reject)..."
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E88FF]"
                          />
                          <input
                            value={notesMap[row.id] || ""}
                            onChange={(e) => setNotesMap((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            placeholder="Approval notes (optional)..."
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E88FF]"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => approve(row.id)}
                              disabled={isUpdating}
                              className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {isUpdating ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => reject(row.id)}
                              disabled={isUpdating}
                              className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              {isUpdating ? "..." : "Reject"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 whitespace-pre-wrap max-w-xs">
                          {row.status === "Rejected" ? row.rejection_reason || "-" : "-"}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default AgentTopupApprovals;
