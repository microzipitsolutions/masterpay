import { useEffect, useMemo, useState } from "react";
import api from "../../api";

import AgentLayout from "../../layouts/AgentLayout";
import {
  PageHeader,
  SearchInput,
  Badge,
  TableContainer,
  Table,
  Thead,
  Th,
  Tr,
  Td,
  TableEmptyRow,
  TableSkeleton,
  Pagination,
  Modal,
  Button,
} from "../../components/ui";

// Rows per request. Matches the backend's LIST_MAX_LIMIT so a "Load more"
// costs one round trip per batch.
const PAGE_LIMIT = 500;

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB");
};

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

function Toolbar({
  search,
  setSearch,
  status,
  setStatus,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onExport,
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-navy-800 mb-2">
          Search
        </label>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-56" />
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-navy-800 mb-2">
          Select Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full sm:w-44 h-11 rounded-control border border-slate-200 bg-white px-4 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        >
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="UTR Submitted">UTR Submitted</option>
          <option value="Approved">Approved</option>
          <option value="Disputed">Disputed</option>
          <option value="Failed">Failed</option>
          <option value="Expired">Expired</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-navy-800 mb-2">
          Start Date
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full sm:w-auto h-11 rounded-control border border-slate-200 bg-white px-4 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        />
      </div>

      <div className="w-full sm:w-auto">
        <label className="block text-sm font-semibold text-navy-800 mb-2">
          End Date
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full sm:w-auto h-11 rounded-control border border-slate-200 bg-white px-4 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
        />
      </div>

      {onExport && (
        <Button variant="secondary" onClick={onExport}>
          Export ⬇
        </Button>
      )}
    </div>
  );
}

function downloadCsv(filename, rows) {
  if (!rows.length) return alert("No data to export");

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => `"${String(row[h] ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function Transactions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedPages, setLoadedPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [viewItem, setViewItem] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [rescueUtr, setRescueUtr] = useState("");

  // Fetched a page at a time rather than as one unbounded query. `load()`
  // resets to the newest page; `loadMore()` appends the next one, so older
  // records stay reachable without pulling the whole table up front.
  const fetchPage = async (page) => {
    const res = await api.get("/api/transactions", {
      params: { page, limit: PAGE_LIMIT },
    });
    return Array.isArray(res.data) ? res.data : [];
  };

  const load = async () => {
    try {
      setLoading(true);
      const batch = await fetchPage(1);
      setRows(batch);
      setLoadedPages(1);
      setHasMore(batch.length === PAGE_LIMIT);
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const nextPage = loadedPages + 1;
      const batch = await fetchPage(nextPage);
      setRows((previous) => [...previous, ...batch]);
      setLoadedPages(nextPage);
      setHasMore(batch.length === PAGE_LIMIT);
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.toLowerCase().trim();

    return rows
      .filter((item) => {
        const haystack = Object.values(item).join(" ").toLowerCase();

        if (term && !haystack.includes(term)) return false;

        if (status) {
          if (status === "true" || status === "false") {
            const boolStatus = status === "true";
            if (item.is_active !== boolStatus) return false;
          } else if ((item.status || item.transaction_status) !== status) {
            return false;
          }
        }

        const created = item.created_at ? new Date(item.created_at) : null;

        if (startDate && created && created < new Date(startDate)) return false;

        if (endDate && created) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (created > end) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
  }, [rows, search, status, startDate, endDate]);

  const disputedCount = useMemo(
    () => filteredRows.filter((t) => String(t.status) === "Disputed").length,
    [filteredRows]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRows, currentPage]);

  const openView = (item) => {
    setViewItem(item);
    setResolveError("");
    setRescueUtr("");
  };

  const resolveDispute = async (action) => {
    if (!viewItem) return;
    if (!window.confirm(`Are you sure you want to ${action} this dispute?`)) return;
    setResolving(true);
    setResolveError("");
    try {
      const res = await api.post(`/api/transactions/${viewItem.id}/resolve-dispute`, { action });
      if (!res.data?.success && res.data?.success !== undefined) {
        setResolveError(res.data.message || `Could not ${action} dispute`);
        return;
      }
      await load();
      setViewItem(null);
    } catch (e) {
      setResolveError(e?.response?.data?.message || e.message || "Network error");
    } finally {
      setResolving(false);
    }
  };

  const rescueTxn = async () => {
    if (!viewItem) return;
    const utr = rescueUtr.trim();
    if (!utr) {
      setResolveError("UTR is required");
      return;
    }
    if (!window.confirm(`Approve this ${viewItem.status} order with UTR ${utr}? This credits the merchant.`)) return;
    setResolving(true);
    setResolveError("");
    try {
      const res = await api.post(`/api/transactions/${viewItem.id}/rescue`, { utr_number: utr });
      if (!res.data?.success && res.data?.success !== undefined) {
        setResolveError(res.data.message || "Could not rescue this order");
        return;
      }
      await load();
      setViewItem(null);
      setRescueUtr("");
    } catch (e) {
      setResolveError(e?.response?.data?.message || e.message || "Network error");
    } finally {
      setResolving(false);
    }
  };

  return (
    <AgentLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <PageHeader title="Transactions List" />
            {disputedCount > 0 && (
              <button
                type="button"
                onClick={() => setStatus("Disputed")}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-info-bg px-3 py-1 text-xs font-semibold text-brand-blue-dark hover:brightness-95"
              >
                {disputedCount} dispute{disputedCount === 1 ? "" : "s"} awaiting review →
              </button>
            )}
          </div>

          <Toolbar
            search={search}
            setSearch={setSearch}
            status={status}
            setStatus={setStatus}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onExport={() =>
              downloadCsv(
                "transactions-list.csv",
                filteredRows.map((item) => ({
                  ID: item.id,
                  Amount: item.amount,
                  "UTR Number": item.utr_number || "-",
                  Agent: item.agent_name || "-",
                  "Bank Name": item.bank_name || "-",
                  "Account Number": item.account_number || "-",
                  "Created Date": formatDate(item.created_at),
                  "Approved Or Reject Date": formatDate(
                    item.approved_or_reject_date
                  ),
                  Status: item.status || "-",
                }))
              )
            }
          />
        </div>

        <TableContainer>
          <Table minWidth="1100px">
            <Thead>
              <Th>ID</Th>
              <Th>Amount</Th>
              <Th>UTR Number</Th>
              <Th>Agent</Th>
              <Th>Bank Name</Th>
              <Th>Account Number</Th>
              <Th>Created Date</Th>
              <Th>Approved Or Reject Date</Th>
              <Th>Status</Th>
              <Th>View</Th>
            </Thead>

            <tbody>
              {loading ? (
                <TableSkeleton rows={6} cols={10} />
              ) : filteredRows.length === 0 ? (
                <TableEmptyRow colSpan={10}>No records found.</TableEmptyRow>
              ) : (
                paginatedRows.map((item) => (
                  <Tr key={item.id}>
                    <Td className="font-mono text-xs">{item.id}</Td>
                    <Td className="font-semibold">{money(item.amount)}</Td>
                    <Td>{item.utr_number || "-"}</Td>
                    <Td>{item.agent_name || "-"}</Td>
                    <Td>{item.bank_name || "-"}</Td>
                    <Td>{item.account_number || "-"}</Td>
                    <Td className="text-xs text-slate-500">{formatDate(item.created_at)}</Td>
                    <Td className="text-xs text-slate-500">{formatDate(item.approved_or_reject_date)}</Td>
                    <Td><Badge status={item.status} /></Td>
                    <Td>
                      <button
                        onClick={() => openView(item)}
                        className="font-semibold text-brand-blue hover:underline cursor-pointer"
                      >
                        View All
                      </button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableContainer>

        {!loading && filteredRows.length > 0 && (
          <Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} />
        )}

        {/* Only the newest PAGE_LIMIT rows are fetched up front; older ones are
            pulled on demand so the initial load stays bounded. */}
        {!loading && hasMore && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "Loading…" : "Load older transactions"}
            </button>
          </div>
        )}

        <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Transaction Details" maxWidth="max-w-xl">
          {viewItem && (
            <>
              <div className="max-h-[430px] overflow-y-auto pr-3">
                <Row label="Amount" value={money(viewItem.amount)} />
                <Row label="UTR Number" value={viewItem.utr_number || "-"} />
                {viewItem.disputed_utr && (
                  <Row
                    label="Disputed UTR (customer-provided)"
                    value={viewItem.disputed_utr}
                    emphasize
                  />
                )}
                <Row label="Agent" value={viewItem.agent_name || "-"} />
                <Row label="Bank Name" value={viewItem.bank_name} />
                <Row label="Account Number" value={viewItem.account_number} />
                <Row label="Transaction Status" value={viewItem.status} />
                <Row
                  label="Created Date"
                  value={formatDate(viewItem.created_at)}
                />
                <Row
                  label="Approved Or Reject Date"
                  value={formatDate(viewItem.approved_or_reject_date)}
                />
              </div>

              {String(viewItem.status) === "Disputed" && (
                <div className="mt-6 rounded-control border border-brand-blue/20 bg-info-bg p-4">
                  <p className="text-sm text-brand-blue-dark">
                    The customer reports they paid with UTR{" "}
                    <span className="font-mono font-semibold">{viewItem.disputed_utr || "-"}</span>.
                    Verify it against the bank statement for account{" "}
                    <span className="font-mono">{viewItem.account_number}</span> at amount{" "}
                    <span className="font-semibold">{money(viewItem.amount)}</span>.
                  </p>
                  {resolveError && (
                    <div className="mt-3 text-xs text-danger">{resolveError}</div>
                  )}
                  <div className="mt-4 flex gap-3">
                    <Button variant="danger" className="flex-1" disabled={resolving} onClick={() => resolveDispute("reject")}>
                      Reject dispute
                    </Button>
                    <Button className="flex-1" loading={resolving} onClick={() => resolveDispute("approve")}>
                      Approve dispute
                    </Button>
                  </div>
                </div>
              )}

              {["Expired", "Failed", "Pending", "UTR Submitted"].includes(String(viewItem.status)) && (
                <div className="mt-6 rounded-control border border-brand-teal/25 bg-brand-teal-light p-4">
                  <p className="text-sm text-brand-teal-dark">
                    Customer paid but the order didn't match? Enter the UTR from the bank
                    credit for <span className="font-semibold">{money(viewItem.amount)}</span>
                    {viewItem.account_number ? (
                      <> on account <span className="font-mono">{viewItem.account_number}</span></>
                    ) : null}{" "}
                    to approve it and credit the merchant.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={rescueUtr}
                      onChange={(e) => setRescueUtr(e.target.value)}
                      placeholder="Bank UTR / reference no."
                      className="h-11 flex-1 rounded-control border border-brand-teal/30 px-3 font-mono text-sm outline-none"
                    />
                    <Button
                      loading={resolving}
                      disabled={!rescueUtr.trim()}
                      onClick={rescueTxn}
                    >
                      Approve with UTR
                    </Button>
                  </div>
                  {resolveError && (
                    <div className="mt-2 text-xs text-danger">{resolveError}</div>
                  )}
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <Button variant="secondary" onClick={() => setViewItem(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </Modal>
      </div>
    </AgentLayout>
  );
}

function Row({ label, value, emphasize = false }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
      <span className="font-semibold text-navy-900">{label}</span>
      <span className={`text-right ${emphasize ? "font-mono font-semibold text-brand-blue-dark" : "text-slate-600"}`}>{value || "-"}</span>
    </div>
  );
}

export default Transactions;
