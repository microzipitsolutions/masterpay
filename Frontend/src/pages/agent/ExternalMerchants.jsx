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
  const rows = useMemo(() => merchants.flatMap(m => m.transactions || []), [merchants]);
  return <AgentLayout><div className="space-y-6"><PageHeader title="Pay-In Transactions" subtitle="TrustPay Pay-In transactions assigned directly to you" />
    {error && <div className="rounded-control bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <TableContainer>
      <Table minWidth="860px" className="table-fixed">
        <Thead>
          <Th className="w-[20%] px-3 whitespace-normal">TrustPay Transaction</Th>
          <Th className="w-[20%] px-3 whitespace-normal">MasterPay Ref</Th>
          <Th className="w-[12%] px-3" align="right">Amount</Th>
          <Th className="w-[12%] px-3">Status</Th>
          <Th className="w-[12%] px-3">UTR</Th>
          <Th className="w-[10%] px-3">Proof</Th>
          <Th className="w-[14%] px-3">Received</Th>
        </Thead>
        <tbody>
          {loading ? <TableSkeleton cols={7} rows={5} /> : rows.length === 0 ? <TableEmptyRow colSpan={7}>No external merchant transactions assigned</TableEmptyRow> : rows.map((t) => (
            <Tr key={t.id}>
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
