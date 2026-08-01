import { useEffect, useState } from "react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";
import WalletBalanceCard from "../../components/agent/WalletBalanceCard";

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

function TopUpHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [summary, setSummary] = useState({ approvedTotal: 0, approvedCount: 0, pendingCount: 0 });

  const [ledger, setLedger] = useState([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const params = { page, limit: 20 };
      if (status) params.status = status;
      if (method) params.method = method;
      const res = await api.get("/api/agent/topups", { params });
      setRows(res.data?.data || []);
      setTotalPages(res.data?.totalPages || 1);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load top-up history");
    } finally {
      setLoading(false);
    }
  };

  // Approved/Pending totals — a small summary of "approved top-ups" and
  // "pending top-ups", the figures the Top Up Funds section is meant to
  // surface. Capped at 100 rows per status (comfortably covers real usage);
  // count is always exact (from the endpoint's total), the summed amount is
  // only approximate beyond 100 requests in a single status.
  const loadSummary = async () => {
    try {
      const [approved, pending] = await Promise.all([
        api.get("/api/agent/topups", { params: { status: "Approved", limit: 100 } }),
        api.get("/api/agent/topups", { params: { status: "Pending", limit: 100 } }),
      ]);
      const approvedRows = approved.data?.data || [];
      setSummary({
        approvedTotal: approvedRows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
        approvedCount: approved.data?.total || 0,
        pendingCount: pending.data?.total || 0,
      });
    } catch {
      // non-critical summary — leave defaults on failure
    }
  };

  const loadLedger = async () => {
    try {
      setLedgerLoading(true);
      const res = await api.get("/api/agent/wallet/ledger", { params: { page: ledgerPage, limit: 20 } });
      setLedger(res.data?.data || []);
      setLedgerTotalPages(res.data?.totalPages || 1);
    } catch {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, method]);

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerPage]);

  const ledgerTypeLabel = (t) => ({
    TOPUP_CREDIT: "Top-Up Credited",
    PAYIN_DEBIT: "Pay-In Debit",
    PAYIN_REFUND: "Pay-In Refund",
    PAYIN_REDEBIT: "Dispute Re-Debit",
  }[t] || t);

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
    <AgentLayout>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-8 bg-[#f8fafc] min-h-screen">
        <h1 className="text-2xl sm:text-3xl font-bold text-black mb-6">Top-Up History</h1>

        <WalletBalanceCard hideLinks />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-[#d9e0ea] rounded-xl px-5 py-4">
            <p className="text-[13px] text-slate-500">Approved Top-Ups</p>
            <p className="text-xl font-bold text-black">{money(summary.approvedTotal)}</p>
            <p className="text-[12px] text-slate-400">{summary.approvedCount} request(s)</p>
          </div>
          <div className="bg-white border border-[#d9e0ea] rounded-xl px-5 py-4">
            <p className="text-[13px] text-slate-500">Pending Top-Ups</p>
            <p className="text-xl font-bold text-black">{summary.pendingCount}</p>
            <p className="text-[12px] text-slate-400">awaiting admin review</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Status</label>
            <select
              value={status}
              onChange={(e) => { setPage(1); setStatus(e.target.value); }}
              className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
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
              className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
            >
              <option value="">All</option>
              <option value="USDT">USDT</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-slate-50">
                <th className="text-left px-5 py-3 font-bold">ID</th>
                <th className="text-left px-5 py-3 font-bold">Method</th>
                <th className="text-left px-5 py-3 font-bold">Amount</th>
                <th className="text-left px-5 py-3 font-bold">Reference</th>
                <th className="text-left px-5 py-3 font-bold">Submitted</th>
                <th className="text-left px-5 py-3 font-bold">Status</th>
                <th className="text-left px-5 py-3 font-bold">Rejection Reason</th>
                <th className="text-left px-5 py-3 font-bold">Proof</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400">No top-up requests yet</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="px-5 py-4">{row.id}</td>
                    <td className="px-5 py-4">{row.method === "USDT" ? "USDT" : "Bank Transfer"}</td>
                    <td className="px-5 py-4 font-semibold">{money(row.amount)}</td>
                    <td className="px-5 py-4 font-mono text-xs break-words [overflow-wrap:anywhere] max-w-[220px]">
                      {row.method === "USDT" ? row.usdt_tx_hash : row.bank_utr}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(row.submitted_at)}</td>
                    <td className="px-5 py-4"><StatusBadge value={row.status} /></td>
                    <td className="px-5 py-4 text-xs text-slate-500 break-words [overflow-wrap:anywhere] max-w-[220px]">{row.rejection_reason || "-"}</td>
                    <td className="px-5 py-4">
                      <button onClick={() => viewProof(row.id)} className="text-[#2B7DE9] underline text-xs">
                        View Proof
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
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

        {/* Wallet ledger — the append-only record backing Settlement
            Remaining/Settlement Amount on the main dashboard. Lives here
            (Top Up Funds section) per the "wallet detail only here" rule. */}
        <h2 className="text-xl font-bold text-black mt-10 mb-4">Wallet Ledger</h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-slate-50">
                <th className="text-left px-5 py-3 font-bold">Date</th>
                <th className="text-left px-5 py-3 font-bold">Type</th>
                <th className="text-left px-5 py-3 font-bold">Amount</th>
                <th className="text-left px-5 py-3 font-bold">Balance After</th>
                <th className="text-left px-5 py-3 font-bold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {ledgerLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : ledger.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-400">No ledger entries yet</td></tr>
              ) : (
                ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100">
                    <td className="px-5 py-4 text-slate-500">{formatDate(entry.created_at)}</td>
                    <td className="px-5 py-4">{ledgerTypeLabel(entry.entry_type)}</td>
                    <td className={`px-5 py-4 font-semibold ${Number(entry.amount) >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {Number(entry.amount) >= 0 ? "+" : ""}{money(entry.amount)}
                    </td>
                    <td className="px-5 py-4">{money(entry.balance_after)}</td>
                    <td className="px-5 py-4 text-xs text-slate-500 break-words [overflow-wrap:anywhere] max-w-[260px]">{entry.notes || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {ledgerTotalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              disabled={ledgerPage <= 1}
              onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">Page {ledgerPage} of {ledgerTotalPages}</span>
            <button
              disabled={ledgerPage >= ledgerTotalPages}
              onClick={() => setLedgerPage((p) => Math.min(ledgerTotalPages, p + 1))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </AgentLayout>
  );
}

export default TopUpHistory;
