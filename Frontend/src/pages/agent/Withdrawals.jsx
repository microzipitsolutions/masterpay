import { useEffect, useMemo, useState } from "react";
import { Send, Copy, Check } from "lucide-react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";
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
  Modal,
  Button,
} from "../../components/ui";

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(String(value));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy"
      className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// Structured, agent-facing destination card. Only ever renders fields the API
// already sends for this withdrawal (upi_id / account_name / bank_name /
// account_number / ifsc_code) — no internal ids or DB-only fields — and hides
// any field that is blank rather than showing an empty row.
function DestinationCard({ w }) {
  if (!w) return null;
  const rows = w.transaction_type === "upi"
    ? [{ label: "UPI ID", value: w.upi_id }]
    : [
        { label: "Account Holder Name", value: w.account_name },
        { label: "Bank Name", value: w.bank_name },
        { label: "Account Number", value: w.account_number, mono: true },
        { label: "IFSC", value: w.ifsc_code, mono: true },
      ];
  const visible = rows.filter((r) => r.value);
  if (visible.length === 0) return null;
  return (
    <div className="rounded-control border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {w.transaction_type === "upi" ? "UPI Details" : "Bank Details"}
      </div>
      {visible.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-xs">
          <span className="text-slate-500">{r.label}</span>
          <span className="flex items-center font-semibold text-navy-900">
            <span className={r.mono ? "font-mono" : ""}>{r.value}</span>
            <CopyButton value={r.value} />
          </span>
        </div>
      ))}
    </div>
  );
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
        <PageHeader title="Withdrawals" className="mb-4" />

        <div className="mb-4 inline-flex rounded-control border border-slate-200 bg-white p-1">
          <button onClick={() => setTab("pending")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === "pending" ? "brand-gradient text-white" : "text-navy-700 hover:bg-slate-50"}`}>Pending Pool ({list.filter(w => w.status === "pending").length})</button>
          <button onClick={() => setTab("mine")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === "mine" ? "brand-gradient text-white" : "text-navy-700 hover:bg-slate-50"}`}>My Picked & History</button>
          <button onClick={() => setTab("all")} className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === "all" ? "brand-gradient text-white" : "text-navy-700 hover:bg-slate-50"}`}>All</button>
        </div>

        {error && <div className="mb-4 rounded-control border border-red-200 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

        <TableContainer>
          <Table minWidth="750px">
            <Thead>
              <Th>ID</Th>
              <Th>Amount</Th>
              <Th>UTR</Th>
              <Th>Agent</Th>
              <Th>Created</Th>
              <Th>Approved/Rejected</Th>
              <Th>Status</Th>
              <Th align="right">Action</Th>
            </Thead>
            <tbody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={8}>No transactions</TableEmptyRow>
              ) : filtered.map((w) => (
                <Tr key={w.id}>
                  <Td className="font-mono text-xs">{w.id}</Td>
                  <Td className="font-semibold">₹{Number(w.amount).toLocaleString("en-IN")}</Td>
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
                  <Td><Badge status={w.status} /></Td>
                  <Td align="right">
                    {w.status === "pending" && (
                      <Button size="sm" onClick={() => setPickConfirm(w)}>Pick</Button>
                    )}
                    {w.status === "picked" && (
                      <Button size="sm" variant="secondary" icon={Send} onClick={() => { setUtrModal(w); setUtrForm({ utr_number: "", notes: "" }); }}>Submit UTR</Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>

        <Modal open={!!pickConfirm} onClose={() => setPickConfirm(null)} title="Pick Transaction" maxWidth="max-w-md">
          {pickConfirm && (
            <>
              <p className="text-sm text-slate-600 mb-6">Are you sure you want to pick this transaction?</p>
              <div className="bg-slate-50 rounded-control border border-slate-200 p-3 text-left text-xs space-y-1 mb-5">
                <div><span className="text-slate-500">Amount:</span> <strong className="text-navy-900">₹{Number(pickConfirm.amount).toLocaleString("en-IN")}</strong></div>
                <div><span className="text-slate-500">Type:</span> {pickConfirm.transaction_type}</div>
                <div className="text-[10px] text-slate-400 italic pt-1">Destination details will be revealed after you pick.</div>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setPickConfirm(null)}>Cancel</Button>
                <Button className="flex-1" loading={picking} onClick={pick}>Confirm</Button>
              </div>
            </>
          )}
        </Modal>

        <Modal open={!!utrModal} onClose={() => setUtrModal(null)} title="Submit UTR" maxWidth="max-w-md">
          {utrModal && (
            <form onSubmit={submitUtr}>
              <p className="text-sm text-slate-600 mb-4">For ₹{Number(utrModal.amount).toLocaleString("en-IN")}</p>
              <div className="mb-4">
                <DestinationCard w={utrModal} />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">UTR Number</label>
                  <input value={utrForm.utr_number} onChange={(e) => setUtrForm({ ...utrForm, utr_number: e.target.value })} className="w-full h-11 rounded-control border border-slate-200 px-3 font-mono text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">Notes (optional)</label>
                  <textarea value={utrForm.notes} onChange={(e) => setUtrForm({ ...utrForm, notes: e.target.value })} className="w-full h-20 rounded-control border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15" />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setUtrModal(null)}>Cancel</Button>
                <Button type="submit" loading={submittingUtr}>Submit</Button>
              </div>
            </form>
          )}
        </Modal>
      </div>
    </AgentLayout>
  );
}
