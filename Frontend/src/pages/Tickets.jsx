import { Fragment, useEffect, useState } from "react";
import api from "../api";
import { AlertTriangle, CreditCard, X } from "lucide-react";

function StatusBadge({ status }) {
  const cls =
    status === "Resolved" ? "bg-green-100 text-green-700"
    : status === "In Process" ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [replyTicket, setReplyTicket] = useState(null); // ticket being replied to
  const [replyNote, setReplyNote] = useState("");
  const [replyStatus, setReplyStatus] = useState("Open");
  const [replying, setReplying] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const loadTickets = async () => {
    const res = await api.get("/api/tickets");
    setTickets(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => { loadTickets(); }, []);

  const openReply = (ticket) => {
    setReplyTicket(ticket);
    setReplyNote(ticket.admin_note || "");
    setReplyStatus(ticket.status);
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!["Open", "In Process", "Resolved"].includes(replyStatus)) return;
    setReplying(true);
    try {
      await api.put(`/api/tickets/${replyTicket.id}/status`, {
        status: replyStatus,
        admin_note: replyNote,
      });
      setReplyTicket(null);
      loadTickets();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not update ticket");
    } finally {
      setReplying(false);
    }
  };

  const filtered = tickets.filter((t) => !statusFilter || t.status === statusFilter);
  const disputeCount = tickets.filter(
    (t) => (t.withdrawal_id != null || t.payin_id != null) && t.status === "Open",
  ).length;

  return (
    <div className="px-2 py-2 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Merchant Tickets</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-11 w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">All Status</option>
          <option value="Open">Open</option>
          <option value="In Process">In Process</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>

      {/* Dispute alert */}
      {disputeCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <AlertTriangle size={18} className="text-orange-600 shrink-0" />
          <span className="text-sm font-semibold text-orange-800">
            {disputeCount} open dispute{disputeCount > 1 ? "s" : ""} (withdrawal or PayIn) — please review and reply.
          </span>
        </div>
      )}

      <div className="bg-white rounded-card border border-slate-200 shadow-card overflow-x-auto">
        <table className="min-w-full min-w-[760px] text-sm text-left">
          <thead className="border-b bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold">#</th>
              <th className="px-4 py-3 font-bold">Merchant</th>
              <th className="px-4 py-3 font-bold">Subject / Type</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Admin Reply</th>
              <th className="px-4 py-3 font-bold">Created</th>
              <th className="px-4 py-3 font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-slate-400 italic">No tickets found.</td>
              </tr>
            ) : filtered.map((ticket) => (
              <Fragment key={ticket.id}>
                <tr
                  className={`border-b border-slate-100 ${ticket.withdrawal_id ? "bg-orange-50/30" : ticket.payin_id ? "bg-blue-50/30" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs">{ticket.id}</td>
                  <td className="px-4 py-3 text-sm">
                    {ticket.merchant_name || ticket.merchant_username || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {ticket.withdrawal_id && (
                        <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                          <AlertTriangle size={9} /> Withdrawal Dispute
                        </div>
                      )}
                      {ticket.payin_id && (
                        <div className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          <CreditCard size={9} /> PayIn Dispute
                        </div>
                      )}
                      <div className="text-sm text-slate-700 font-medium">{ticket.subject}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={ticket.status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px]">
                    {ticket.admin_note || <span className="italic text-slate-400">No reply yet</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(ticket.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                        className="text-xs text-[#1E88FF] underline"
                      >
                        {expandedId === ticket.id ? "Hide" : "View"}
                      </button>
                      <button
                        onClick={() => openReply(ticket)}
                        className="rounded-lg bg-[#1E88FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0b2a5b]"
                      >
                        Reply
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === ticket.id && (
                  <tr className="border-b border-slate-100">
                    <td colSpan={7} className="px-6 py-4 bg-slate-50">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Issue / Reason</div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap mb-3">
                        {ticket.issue?.split("\n\n---")[0]}
                      </div>
                      {ticket.issue?.includes("--- Withdrawal Details ---") && (
                        <div className="rounded-lg bg-white border border-slate-200 px-4 py-3 text-xs font-mono text-slate-600 whitespace-pre-wrap">
                          {ticket.issue?.split("\n\n--- Withdrawal Details ---\n")[1]}
                        </div>
                      )}
                      {ticket.issue?.includes("--- PayIn Transaction Details ---") && (
                        <div className="rounded-lg bg-white border border-slate-200 px-4 py-3 text-xs font-mono text-slate-600 whitespace-pre-wrap">
                          {ticket.issue?.split("\n\n--- PayIn Transaction Details ---\n")[1]}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reply Modal */}
      {replyTicket && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <form onSubmit={submitReply} className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <button type="button" onClick={() => setReplyTicket(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
              <X size={18} />
            </button>
            <h2 className="text-lg font-bold mb-1">Reply to Ticket #{replyTicket.id}</h2>
            <p className="text-xs text-slate-500 mb-4 font-mono truncate">{replyTicket.subject}</p>

            {replyTicket.withdrawal_id && (
              <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs flex items-center gap-2">
                <AlertTriangle size={12} className="text-orange-600 shrink-0" />
                <span className="text-orange-700 font-semibold">Withdrawal Dispute</span>
              </div>
            )}
            {replyTicket.payin_id && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs flex items-center gap-2">
                <CreditCard size={12} className="text-blue-600 shrink-0" />
                <span className="text-blue-700 font-semibold">PayIn Dispute</span>
              </div>
            )}

            <div className="mb-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Merchant's Issue</div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap max-h-[120px] overflow-y-auto">
                {replyTicket.issue?.split("\n\n---")[0]}
              </div>
              {replyTicket.issue?.includes("--- Withdrawal Details ---") && (
                <div className="mt-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-mono text-slate-600 whitespace-pre-wrap">
                  {replyTicket.issue?.split("\n\n--- Withdrawal Details ---\n")[1]}
                </div>
              )}
              {replyTicket.issue?.includes("--- PayIn Transaction Details ---") && (
                <div className="mt-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs font-mono text-slate-600 whitespace-pre-wrap">
                  {replyTicket.issue?.split("\n\n--- PayIn Transaction Details ---\n")[1]}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={replyStatus}
                onChange={(e) => setReplyStatus(e.target.value)}
                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="Open">Open</option>
                <option value="In Process">In Process</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Reply / Admin Note</label>
              <textarea
                value={replyNote}
                onChange={(e) => setReplyNote(e.target.value)}
                rows={4}
                placeholder="Write your reply to the merchant..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setReplyTicket(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={replying} className="rounded-lg bg-[#1E88FF] text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
                {replying ? "Saving..." : "Save Reply"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Tickets;
