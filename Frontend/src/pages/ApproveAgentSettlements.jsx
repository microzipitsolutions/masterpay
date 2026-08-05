import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { inLocalDateRange } from "../utils/dateRange";

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
    second: "2-digit",
  });
};

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

function StatusBadge({ value }) {
  const v = value || "Pending";

  const cls =
    v === "Approved"
      ? "bg-green-100 text-green-700"
      : v === "Rejected"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls}`}
    >
      {v}
    </span>
  );
}

function ApproveAgentSettlements() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [updatingId, setUpdatingId] = useState(null);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [notesMap, setNotesMap] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      setMessage("");

      const res = await api.get(
        "/api/admin/agent-created-settlements"
      );

      const data = Array.isArray(res.data)
        ? res.data
        : [];

      setRows(data);

      const map = {};

      data.forEach((row) => {
        map[row.id] = row.notes || "";
      });

      setNotesMap(map);
    } catch (error) {
      setMessageType("error");

      setMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Could not load data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatus = async (id, status) => {
    setMessage("");

    try {
      setUpdatingId(id);

      await api.put(
        `/api/admin/agent-created-settlements/${id}/status`,
        {
          transaction_status: status,
          notes: notesMap[id] || "",
        }
      );

      setMessageType("success");

      setMessage(
        `Settlement ${status.toLowerCase()} successfully.`
      );

      load();
    } catch (error) {
      setMessageType("error");

      setMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Could not update status"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();

    return rows.filter((row) => {
      if (term) {
        const hay = [
          row.id,
          row.amount,
          row.agent_name,
          row.transaction_status,
        ]
          .join(" ")
          .toLowerCase();

        if (!hay.includes(term)) return false;
      }

      const st = row.transaction_status || "Pending";

      if (statusFilter && st !== statusFilter)
        return false;

      if (!inLocalDateRange(row.created_at, startDate, endDate)) return false;

      return true;
    });
  }, [rows, search, statusFilter, startDate, endDate]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-navy-900">
        Approve Settlement Transactions
      </h1>

      <p className="text-sm text-gray-500">
        Settlement requests submitted by agents.
      </p>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            messageType === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Search
          </label>

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Agent name, amount..."
            className="w-full sm:w-60 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Status
          </label>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
            className="w-full sm:w-44 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          >
            <option value="">All</option>

            <option value="Pending">
              Pending
            </option>

            <option value="Approved">
              Approved
            </option>

            <option value="Rejected">
              Rejected
            </option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            From
          </label>

          <input
            type="date"
            value={startDate}
            onChange={(e) =>
              setStartDate(e.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            To
          </label>

          <input
            type="date"
            value={endDate}
            onChange={(e) =>
              setEndDate(e.target.value)
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1E88FF]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-700">
            <tr>
              <th className="px-5 py-4 font-semibold">
                ID
              </th>

              <th className="px-5 py-4 font-semibold">
                Agent
              </th>

              <th className="px-5 py-4 font-semibold">
                Amount
              </th>

              <th className="px-5 py-4 font-semibold">
                Submitted On
              </th>

              <th className="px-5 py-4 font-semibold">
                Approved / Rejected On
              </th>

              <th className="px-5 py-4 font-semibold">
                Status
              </th>

              <th className="px-5 py-4 font-semibold">
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-slate-400"
                >
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-10 text-center text-slate-400"
                >
                  No settlement requests found.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const isPending =
                  (row.transaction_status ||
                    "Pending") === "Pending";

                const isUpdating =
                  updatingId === row.id;

                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {row.id}
                    </td>

                    <td className="px-5 py-4">
                      {row.agent_name || "-"}
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {money(row.amount)}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {formatDate(row.created_at)}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {formatDate(
                        row.approved_or_reject_date
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge
                        value={
                          row.transaction_status
                        }
                      />
                    </td>

                    <td className="px-5 py-4">
                      {isPending ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            rows={2}
                            value={
                              notesMap[row.id] || ""
                            }
                            onChange={(e) =>
                              setNotesMap((prev) => ({
                                ...prev,
                                [row.id]:
                                  e.target.value,
                              }))
                            }
                            placeholder="Add notes..."
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E88FF]"
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                handleStatus(
                                  row.id,
                                  "Approved"
                                )
                              }
                              disabled={isUpdating}
                              className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {isUpdating
                                ? "..."
                                : "Approve"}
                            </button>

                            <button
                              onClick={() =>
                                handleStatus(
                                  row.id,
                                  "Rejected"
                                )
                              }
                              disabled={isUpdating}
                              className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                            >
                              {isUpdating
                                ? "..."
                                : "Reject"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-xs whitespace-pre-wrap text-slate-500">
                            {row.notes || "-"}
                          </div>

                          <span className="text-xs text-slate-400">
                            —
                          </span>
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
    </div>
  );
}

export default ApproveAgentSettlements;