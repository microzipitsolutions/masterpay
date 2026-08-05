import { useEffect, useMemo, useState } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import api from "../api";
import {
  PageHeader,
  Badge,
  TableContainer,
  Table,
  Thead,
  Th,
  Tr,
  Td,
  TableEmptyRow,
} from "../components/ui";

function formatDate(d) { return d ? new Date(d).toLocaleString("en-GB") : "—"; }

export default function WithdrawalTransactions() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [disputeFilter, setDisputeFilter] = useState(false);

  const [checkingId, setCheckingId] = useState(null);

  const fetchList = async () => {
    try { const r = await api.get("/api/withdrawal/transactions"); setList(r.data || []); }
    catch (e) { setError(e?.response?.data?.message || "Could not load"); }
  };
  useEffect(() => { fetchList(); const i = setInterval(fetchList, 7000); return () => clearInterval(i); }, []);

  const checkStatus = async (id) => {
    setCheckingId(id);
    try {
      const r = await api.post(`/api/withdrawal/transactions/${id}/check-status`);
      await fetchList();
      if (r.data?.message) alert(r.data.message);
    } catch (e) {
      alert(e?.response?.data?.message || "Could not check status");
    } finally {
      setCheckingId(null);
    }
  };

  const disputeCount = useMemo(() => list.filter((w) => w.merchant_disputed_at).length, [list]);

  const filtered = useMemo(() => {
    return list.filter((w) => {
      if (statusFilter && w.status !== statusFilter) return false;
      if (disputeFilter && !w.merchant_disputed_at) return false;
      if (startDate && new Date(w.created_at) < new Date(startDate)) return false;
      if (endDate && new Date(w.created_at) > new Date(endDate + "T23:59:59")) return false;
      return true;
    });
  }, [list, statusFilter, startDate, endDate, disputeFilter]);

  return (
    <div className="px-2 py-2">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <PageHeader title="Withdrawals" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-11 w-full sm:w-auto rounded-control border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="picked">Picked</option>
            <option value="utr_submitted">UTR Submitted</option>
            <option value="cleared">Cleared</option>
            <option value="rejected">Rejected</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        {/* Date filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-navy-800 whitespace-nowrap">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-control border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-navy-800 whitespace-nowrap">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-control border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-blue" />
          </div>
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }} className="h-9 px-3 rounded-control border border-slate-200 text-sm text-navy-700 hover:bg-slate-50">
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Dispute alert banner */}
      {disputeCount > 0 && (
        <button
          type="button"
          onClick={() => setDisputeFilter((v) => !v)}
          className={`w-full mb-4 flex items-center gap-3 rounded-card border px-4 py-3 text-left transition-colors ${disputeFilter ? "border-warning/40 bg-warning-bg" : "border-warning/20 bg-warning-bg/60 hover:bg-warning-bg"}`}
        >
          <AlertTriangle size={18} className="text-warning shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-semibold text-warning">
              {disputeCount} withdrawal dispute{disputeCount > 1 ? "s" : ""} raised by merchant{disputeCount > 1 ? "s" : ""}
            </span>
            <span className="ml-2 text-xs text-warning/80">
              {disputeFilter ? "— showing disputed only (click to clear)" : "— click to filter"}
            </span>
          </div>
        </button>
      )}

      {error && <div className="mb-4 rounded-control border border-red-200 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

      <TableContainer>
        <Table minWidth="700px">
          <Thead>
            <Th>ID</Th>
            <Th>Merchant</Th>
            <Th>Amount</Th>
            <Th>Destination</Th>
            <Th>UTR</Th>
            <Th>Agent</Th>
            <Th>Created</Th>
            <Th>Approved/Rejected</Th>
            <Th>Status</Th>
          </Thead>
          <tbody>
            {filtered.length === 0 ? (
              <TableEmptyRow colSpan={9}>No transactions</TableEmptyRow>
            ) : filtered.map((w) => (
              <Tr key={w.id} className={w.merchant_disputed_at ? "bg-warning-bg/40" : ""}>
                <Td className="font-mono text-xs">{w.id}</Td>
                <Td>
                  <div>{w.merchant_name}</div>
                  {w.merchant_disputed_at && (
                    <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-semibold text-warning">
                      <AlertTriangle size={9} /> Dispute: {w.merchant_dispute_reason?.slice(0, 40)}{(w.merchant_dispute_reason?.length ?? 0) > 40 ? "…" : ""}
                    </div>
                  )}
                </Td>
                <Td className="font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</Td>
                <Td className="text-xs">
                  {w.transaction_type === "upi" ? (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">UPI</div>
                      <div className="font-mono text-slate-700">{w.upi_id || "—"}</div>
                    </div>
                  ) : (
                    <div className="space-y-0.5 leading-tight">
                      <div className="font-semibold text-slate-700">{w.account_name || "—"}</div>
                      {w.bank_name && <div className="text-slate-500">{w.bank_name}</div>}
                      <div className="font-mono text-slate-600">A/C {w.account_number || "—"}</div>
                      <div className="font-mono text-slate-500">IFSC {w.ifsc_code || "—"}</div>
                    </div>
                  )}
                </Td>
                <Td className="font-mono text-xs">{w.utr_number || "—"}</Td>
                <Td className="text-xs">
                  {w.agent_name
                    ? w.agent_name
                    : w.sspay_order_id
                      ? (w.assigned_agent_name || "Auto")
                      : "—"}
                </Td>
                <Td className="text-xs text-slate-500">{formatDate(w.created_at)}</Td>
                <Td className="text-xs text-slate-500">{formatDate(w.cleared_or_rejected_date)}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <Badge status={w.status} />
                    <button
                      type="button"
                      onClick={() => checkStatus(w.id)}
                      disabled={checkingId === w.id}
                      title="Check Latest Status"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={checkingId === w.id ? "animate-spin" : ""} />
                    </button>
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableContainer>
    </div>
  );
}
