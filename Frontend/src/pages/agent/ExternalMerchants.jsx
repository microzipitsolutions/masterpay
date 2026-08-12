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
        if (active) setError(requestError?.response?.data?.message || "Could not load Pay-In transactions");
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
  return <AgentLayout><div className="space-y-6"><PageHeader title="Pay-In Transactions" subtitle="TrustPay Pay-In transactions assigned directly to you" />
    {error && <div className="rounded-control bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{merchants.map(m => <div key={m.id} className="rounded-card border border-slate-200 bg-white p-4"><div className="font-semibold text-navy-900">{m.external_merchant_name}</div><div className="mt-1 text-xs text-slate-500">{m.external_merchant_code || m.external_merchant_id} · {m.tenant_id}</div><div className="mt-3 text-sm">{m.transactions?.length || 0} transaction(s)</div></div>)}</div>
    <TableContainer>
      <Table minWidth="860px" className="table-fixed">
        <Thead>
          <Th className="w-[14%] px-3">Merchant</Th>
          <Th className="w-[17%] px-3 whitespace-normal">TrustPay Transaction</Th>
          <Th className="w-[17%] px-3 whitespace-normal">MasterPay Ref</Th>
          <Th className="w-[10%] px-3" align="right">Amount</Th>
          <Th className="w-[11%] px-3">Status</Th>
          <Th className="w-[11%] px-3">UTR</Th>
          <Th className="w-[8%] px-3">Proof</Th>
          <Th className="w-[12%] px-3">Received</Th>
        </Thead>
        <tbody>
          {loading ? <TableSkeleton cols={8} rows={5} /> : rows.length === 0 ? <TableEmptyRow colSpan={8}>No external merchant transactions assigned</TableEmptyRow> : rows.map((t) => (
            <Tr key={t.id}>
              <Td className="px-3 align-top font-medium text-navy-900 break-words">{t.merchant.external_merchant_name}</Td>
              <Td className="px-3 align-top font-mono text-xs break-all leading-5">{t.external_transaction_id || "-"}</Td>
              <Td className="px-3 align-top font-mono text-xs break-all leading-5">{t.transaction_id || "-"}</Td>
              <Td className="px-3 align-top whitespace-nowrap font-semibold" align="right">₹{Number(t.amount || 0).toLocaleString("en-IN")}</Td>
              <Td className="px-3 align-top"><Badge>{t.status}</Badge></Td>
              <Td className="px-3 align-top font-mono text-xs break-all">{t.utr_number || "-"}</Td>
              <Td className="px-3 align-top">{t.payment_proof ? <a className="font-semibold text-brand-blue underline underline-offset-2" href={t.payment_proof} target="_blank" rel="noreferrer">Download</a> : "-"}</Td>
              <Td className="px-3 align-top text-xs leading-5 text-slate-500">{t.created_at ? new Date(t.created_at).toLocaleString("en-GB") : "-"}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </TableContainer>
  </div></AgentLayout>;
}
