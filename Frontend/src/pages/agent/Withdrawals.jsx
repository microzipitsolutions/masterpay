import { useEffect, useMemo, useState } from "react";
import { X, Send } from "lucide-react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";

function StatusPill({ status }) {
  const styles = {
    pending: "bg-amber-100 text-amber-700",
    picked: "bg-blue-100 text-blue-700",
    utr_submitted: "bg-indigo-100 text-indigo-700",
    cleared: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  const label = { pending: "Pending", picked: "Picked", utr_submitted: "UTR Submitted", cleared: "Cleared", rejected: "Rejected" };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || "bg-gray-100 text-gray-700"}`}>{label[status] || status}</span>;
}
function formatDate(d) { return d ? new Date(d).toLocaleString("en-GB") : "—"; }

export default function AgentWithdrawals() {
  const [list, setList] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending");
  const [pickConfirm, setPickConfirm] = useState(null);
  const [picking, setPicking] = useState(false);
  const [utrModal, setUtrModal] = useState(null);
  const [utrForm, setUtrForm] = useState({ utr_number: "", notes: "" });
  const [submittingUtr, setSubmittingUtr] = useState(false);

  const fetchList = async () => {
    try { const r = await api.get("/api/withdrawal/transactions"); setList(r.data || []); }
    catch (e) { setError(e?.response?.data?.message || "Could not load"); }
  };
  useEffect(() => { fetchList(); const i = setInterval(fetchList, 7000); return () => clearInterval(i); }, []);

  const filtered = useMemo(() => {
    if (tab === "pending") return list.filter((w) => w.status === "pending");
    if (tab === "mine") return list.filter((w) => w.status !== "pending");
    return list;
  }, [list, tab]);

  const pick = async () => {
    if (!pickConfirm) return;
    setPicking(true);
    try {
      await api.post(`/api/withdrawal/transactions/${pickConfirm.id}/pick`);
      setPickConfirm(null);
      fetchList();
    } catch (e) {
      alert(e?.response?.data?.message || "Pick failed");
    } finally {
      setPicking(false);
    }
  };

  const submitUtr = async (e) => {
    e.preventDefault();
    if (!utrModal) return;
    if (!utrForm.utr_number.trim()) { alert("UTR required"); return; }
    setSubmittingUtr(true);
    try {
      await api.post(`/api/withdrawal/transactions/${utrModal.id}/submit-utr`, utrForm);
      setUtrModal(null); setUtrForm({ utr_number: "", notes: "" });
      fetchList();
    } catch (e) {
      alert(e?.response?.data?.message || "Submit failed");
    } finally {
      setSubmittingUtr(false);
    }
  };

  return (
    <AgentLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">Withdrawals</h1>

        <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button onClick={() => setTab("pending")} className={`px-4 py-2 rounded text-sm font-semibold ${tab === "pending" ? "bg-[#2B7DE9] text-white" : "text-slate-700"}`}>Pending Pool ({list.filter(w => w.status === "pending").length})</button>
          <button onClick={() => setTab("mine")} className={`px-4 py-2 rounded text-sm font-semibold ${tab === "mine" ? "bg-[#2B7DE9] text-white" : "text-slate-700"}`}>My Picked & History</button>
          <button onClick={() => setTab("all")} className={`px-4 py-2 rounded text-sm font-semibold ${tab === "all" ? "bg-[#2B7DE9] text-white" : "text-slate-700"}`}>All</button>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[750px] text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-bold">ID</th>
                <th className="text-left px-4 py-3 font-bold">Merchant</th>
                <th className="text-left px-4 py-3 font-bold">Amount</th>
                <th className="text-left px-4 py-3 font-bold">Destination</th>
                <th className="text-left px-4 py-3 font-bold">UTR</th>
                <th className="text-left px-4 py-3 font-bold">Agent</th>
                <th className="text-left px-4 py-3 font-bold">Created</th>
                <th className="text-left px-4 py-3 font-bold">Status</th>
                <th className="text-right px-4 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan="9" className="text-center py-8 text-slate-500">No transactions</td></tr>
              ) : filtered.map((w) => (
                <tr key={w.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs">{w.id}</td>
                  <td className="px-4 py-3">{w.merchant_name}</td>
                  <td className="px-4 py-3 font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-xs">
                    {w.status === "pending" ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        {w.transaction_type} · hidden until picked
                      </span>
                    ) : w.transaction_type === "upi" ? (
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
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{w.utr_number || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {w.agent_name
                      ? w.agent_name
                      : w.sspay_order_id
                        ? (w.assigned_agent_name || "Auto")
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(w.created_at)}</td>
                  <td className="px-4 py-3"><StatusPill status={w.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {w.status === "pending" && (
                      <button onClick={() => setPickConfirm(w)} className="rounded bg-[#2B7DE9] text-white text-xs font-semibold px-3 py-1.5 hover:bg-[#0b2a5b]">Pick</button>
                    )}
                    {w.status === "picked" && (
                      <button onClick={() => { setUtrModal(w); setUtrForm({ utr_number: "", notes: "" }); }} className="inline-flex items-center gap-1 rounded bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5">
                        <Send size={12} /> Submit UTR
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pickConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="relative w-full max-w-md rounded-2xl bg-white p-6 text-center">
              <button onClick={() => setPickConfirm(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
              <h2 className="text-xl font-bold mb-2">Pick Transaction</h2>
              <p className="text-sm text-slate-600 mb-6">Are you sure you want to pick this transaction?</p>
              <div className="bg-slate-50 rounded-lg p-3 text-left text-xs space-y-1 mb-5">
                <div><span className="text-slate-500">Merchant:</span> <strong>{pickConfirm.merchant_name}</strong></div>
                <div><span className="text-slate-500">Amount:</span> <strong>₹{Number(pickConfirm.amount).toLocaleString("en-IN")}</strong></div>
                <div><span className="text-slate-500">Type:</span> {pickConfirm.transaction_type}</div>
                <div className="text-[10px] text-slate-400 italic pt-1">Destination details will be revealed after you pick.</div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPickConfirm(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancel</button>
                <button onClick={pick} disabled={picking} className="flex-1 rounded-lg bg-[#2B7DE9] text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{picking ? "Picking..." : "Confirm"}</button>
              </div>
            </div>
          </div>
        )}

        {utrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <form onSubmit={submitUtr} className="relative w-full max-w-md rounded-2xl bg-white p-6">
              <button type="button" onClick={() => setUtrModal(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
              <h2 className="text-xl font-bold mb-2">Submit UTR</h2>
              <p className="text-sm text-slate-600 mb-4">For ₹{Number(utrModal.amount).toLocaleString("en-IN")} to {utrModal.merchant_name}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">UTR Number</label>
                  <input value={utrForm.utr_number} onChange={(e) => setUtrForm({ ...utrForm, utr_number: e.target.value })} className="w-full h-11 rounded-lg border border-slate-300 px-3 font-mono text-sm" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Notes (optional)</label>
                  <textarea value={utrForm.notes} onChange={(e) => setUtrForm({ ...utrForm, notes: e.target.value })} className="w-full h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setUtrModal(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={submittingUtr} className="rounded-lg bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">{submittingUtr ? "Submitting..." : "Submit"}</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AgentLayout>
  );
}
