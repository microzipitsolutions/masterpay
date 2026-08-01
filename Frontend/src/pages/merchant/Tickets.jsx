import { useEffect, useState } from "react";
import api from "../../api";
import MerchantLayout from "../../layouts/MerchantLayout";
import { AlertTriangle, CreditCard } from "lucide-react";

function StatusBadge({ status }) {
  const cls =
    status === "Resolved" ? "bg-green-100 text-green-700"
    : status === "In Process" ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function DisputeCard({ t, expandedId, setExpandedId, detailsMarker, icon: Icon, borderColor, bgColor, badgeColor, badgeText }) {
  const isExpanded = expandedId === t.id;
  const reason = t.issue?.split("\n\n---")[0] || "";
  const detailsBlock = t.issue?.includes(`--- ${detailsMarker} ---`)
    ? t.issue.split(`\n\n--- ${detailsMarker} ---\n`)[1]
    : null;

  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setExpandedId(isExpanded ? null : t.id)}
        className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 rounded-full ${badgeColor} px-2 py-0.5 text-[10px] font-semibold`}>
              <Icon size={9} /> {badgeText}
            </span>
            <span className="text-[10px] font-mono text-slate-400">Ticket #{t.id}</span>
          </div>
          <div className="text-sm font-semibold text-slate-800 truncate">{t.subject}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={t.status} />
          <span className="text-slate-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {isExpanded && (
        <div className={`border-t ${borderColor} px-5 py-4 space-y-3 text-sm`}>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Your Dispute Reason</div>
            <div className="text-slate-700 whitespace-pre-wrap">{reason}</div>
          </div>
          {detailsBlock && (
            <div className="rounded-lg bg-white border border-slate-200 px-4 py-3 text-xs font-mono text-slate-600 whitespace-pre-wrap">
              {detailsBlock}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Admin Reply</div>
            {t.admin_note
              ? <div className="rounded-lg bg-white border border-blue-200 px-4 py-3 text-slate-700">{t.admin_note}</div>
              : <div className="text-slate-400 italic text-xs">No reply yet — our team will respond shortly.</div>
            }
          </div>
          <div className="text-[11px] text-slate-400">
            Raised on {new Date(t.created_at).toLocaleString("en-GB")}
            {t.updated_at && t.updated_at !== t.created_at && (
              <> · Last updated {new Date(t.updated_at).toLocaleString("en-GB")}</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MerchantTickets() {
  const [tickets, setTickets] = useState([]);
  const [form, setForm] = useState({ subject: "", issue: "" });
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const loadTickets = async () => {
    const res = await api.get("/api/tickets");
    setTickets(Array.isArray(res.data) ? res.data : []);
  };

  useEffect(() => { loadTickets(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.issue) { alert("Subject and issue are required"); return; }
    try {
      setLoading(true);
      await api.post("/api/tickets", form);
      setForm({ subject: "", issue: "" });
      loadTickets();
    } catch (error) {
      alert(error?.response?.data?.message || "Could not create ticket");
    } finally {
      setLoading(false);
    }
  };

  const withdrawalDisputes = tickets.filter((t) => t.withdrawal_id != null);
  const payinDisputes = tickets.filter((t) => t.payin_id != null);
  const regularTickets = tickets.filter((t) => t.withdrawal_id == null && t.payin_id == null);
  const hasDisputes = withdrawalDisputes.length > 0 || payinDisputes.length > 0;

  return (
    <MerchantLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Support Tickets</h1>

        {/* New ticket form */}
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white border border-gray-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-700">Open a New Ticket</h2>
          <div>
            <label className="block text-sm font-semibold mb-2">Subject</label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm"
              placeholder="Enter ticket subject"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Issue</label>
            <textarea
              value={form.issue}
              onChange={(e) => setForm({ ...form, issue: e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm min-h-[100px]"
              placeholder="Explain your issue"
            />
          </div>
          <button disabled={loading} className="rounded-xl bg-[#2B7DE9] px-5 py-3 text-white font-semibold text-sm disabled:opacity-60">
            {loading ? "Creating..." : "Submit Ticket"}
          </button>
        </form>

        {/* Withdrawal Disputes */}
        {withdrawalDisputes.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              Withdrawal Disputes
            </h2>
            <div className="space-y-3">
              {withdrawalDisputes.map((t) => (
                <DisputeCard
                  key={t.id}
                  t={t}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  detailsMarker="Withdrawal Details"
                  icon={AlertTriangle}
                  borderColor="border-orange-200"
                  bgColor="bg-orange-50/40"
                  badgeColor="bg-orange-100 text-orange-700"
                  badgeText="Withdrawal Dispute"
                />
              ))}
            </div>
          </div>
        )}

        {/* PayIn Disputes */}
        {payinDisputes.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <CreditCard size={18} className="text-blue-500" />
              PayIn Disputes
            </h2>
            <div className="space-y-3">
              {payinDisputes.map((t) => (
                <DisputeCard
                  key={t.id}
                  t={t}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  detailsMarker="PayIn Transaction Details"
                  icon={CreditCard}
                  borderColor="border-blue-200"
                  bgColor="bg-blue-50/30"
                  badgeColor="bg-blue-100 text-blue-700"
                  badgeText="PayIn Dispute"
                />
              ))}
            </div>
          </div>
        )}

        {/* General tickets */}
        {(regularTickets.length > 0 || !hasDisputes) && (
          <div>
            {hasDisputes && (
              <h2 className="text-lg font-bold text-slate-800 mb-3">General Tickets</h2>
            )}
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm text-left">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 font-bold">#</th>
                    <th className="px-5 py-4 font-bold">Subject</th>
                    <th className="px-5 py-4 font-bold">Issue</th>
                    <th className="px-5 py-4 font-bold">Status</th>
                    <th className="px-5 py-4 font-bold">Admin Reply</th>
                    <th className="px-5 py-4 font-bold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {regularTickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-slate-400 italic">No general tickets.</td>
                    </tr>
                  ) : regularTickets.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-5 py-4 font-mono text-xs">{t.id}</td>
                      <td className="px-5 py-4">{t.subject}</td>
                      <td className="px-5 py-4 max-w-[200px] text-xs text-slate-600">{t.issue}</td>
                      <td className="px-5 py-4"><StatusBadge status={t.status} /></td>
                      <td className="px-5 py-4 text-xs text-slate-600">{t.admin_note || <span className="italic text-slate-400">—</span>}</td>
                      <td className="px-5 py-4 text-xs text-slate-500">{new Date(t.created_at).toLocaleString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </MerchantLayout>
  );
}
