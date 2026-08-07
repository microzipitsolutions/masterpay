import { useEffect, useMemo, useState } from "react";
import api from "../../api";
import AgentLayout from "../../layouts/AgentLayout";
import { PageHeader, TableContainer, Table, Thead, Th, Tr, Td, Badge, TableEmptyRow, TableSkeleton } from "../../components/ui";

export default function ExternalMerchants() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => api.get("/api/agent/external-merchants")
      .then((response) => {
        if (!active) return;
        setMerchants(Array.isArray(response.data) ? response.data : []);
        setError("");
      })
      .catch((requestError) => {
        if (active) setError(requestError?.response?.data?.message || "Could not load Pay-In requests");
      })
      .finally(() => { if (active) setLoading(false); });
    load();
    const timer = window.setInterval(load, 5000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, []);
  const rows = useMemo(() => merchants.flatMap(m => (m.transactions || []).map(t => ({ ...t, merchant: m }))), [merchants]);
  return <AgentLayout><div className="space-y-6"><PageHeader title="Pay-In Requests" subtitle="TrustPay Pay-Ins assigned directly to you" />
    {error && <div className="rounded-control bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{merchants.map(m => <div key={m.id} className="rounded-card border border-slate-200 bg-white p-4"><div className="font-semibold text-navy-900">{m.external_merchant_name}</div><div className="mt-1 text-xs text-slate-500">{m.external_merchant_code || m.external_merchant_id} · {m.tenant_id}</div><div className="mt-3 text-sm">{m.transactions?.length || 0} transaction(s)</div></div>)}</div>
    <TableContainer><Table><Thead><Tr><Th>Merchant</Th><Th>TrustPay Transaction</Th><Th>MasterPay Ref</Th><Th>Amount</Th><Th>Status</Th><Th>UTR</Th><Th>Proof</Th><Th>Received</Th></Tr></Thead><tbody>
      {loading ? <TableSkeleton columns={8} rows={5} /> : rows.length === 0 ? <TableEmptyRow colSpan={8} message="No external merchant transactions assigned" /> : rows.map(t => <Tr key={t.id}><Td>{t.merchant.external_merchant_name}</Td><Td>{t.external_transaction_id}</Td><Td>{t.transaction_id}</Td><Td>₹{Number(t.amount || 0).toLocaleString("en-IN")}</Td><Td><Badge>{t.status}</Badge></Td><Td>{t.utr_number || "-"}</Td><Td>{t.payment_proof ? <a className="text-brand-blue underline" href={t.payment_proof} target="_blank" rel="noreferrer">Download</a> : "-"}</Td><Td>{t.created_at ? new Date(t.created_at).toLocaleString("en-GB") : "-"}</Td></Tr>)}</tbody></Table></TableContainer>
  </div></AgentLayout>;
}
