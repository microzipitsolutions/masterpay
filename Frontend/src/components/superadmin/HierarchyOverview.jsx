import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import api from "../../api";
import MetricInfoTooltip from "./MetricInfoTooltip";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const formatDate = (v) => {
  if (!v) return "Never";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function Metric({ label, value }) {
  return (
    <div className="text-right leading-tight">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className="font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function StatusDot({ active }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-red-400"}`} title={active ? "Active" : "Inactive"} />;
}

// One reusable expand-row primitive, copying the inline-expand pattern already
// used in pages/admin/MasterPayTestAdmin.jsx (toggle button + conditional
// children region) rather than a literal nested <table> (which doesn't nest
// well for a 3-level tree).
function NodeRow({ depth, label, subLabel, metrics, active, hasChildren, expanded, loading, onToggle, children }) {
  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-lg px-3 py-2.5 mb-1.5 bg-white hover:bg-slate-50 transition">
        <button
          onClick={onToggle}
          disabled={!hasChildren}
          className="flex items-center gap-2 text-left flex-1 min-w-0 disabled:cursor-default"
        >
          {hasChildren ? (
            expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {active !== undefined && <StatusDot active={active} />}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">{label}</div>
            {subLabel && <div className="text-xs text-slate-400 truncate">{subLabel}</div>}
          </div>
        </button>
        <div className="flex items-center gap-4 shrink-0">{metrics}</div>
      </div>
      {expanded && (loading ? <div className="text-xs text-slate-400 pl-6 pb-2">Loading...</div> : children)}
    </div>
  );
}

function AgentRow({ agent, depth }) {
  return (
    <NodeRow
      depth={depth}
      label={`${agent.name} (Agent)`}
      subLabel={`@${agent.username}`}
      active={agent.is_active}
      metrics={
        <>
          <Metric label="Pay-In Vol" value={money(agent.payin_volume)} />
          <Metric label="Net" value={money(agent.net)} />
          <Metric label="Pending" value={agent.pending_items} />
          <Metric label="Last Active" value={formatDate(agent.last_activity)} />
        </>
      }
      hasChildren={false}
    />
  );
}

function MerchantRow({ merchant, depth }) {
  return (
    <NodeRow
      depth={depth}
      label={`${merchant.name} (Merchant)`}
      subLabel={`@${merchant.username}`}
      active={merchant.is_active}
      metrics={
        <>
          <Metric label="Pay-In Vol" value={money(merchant.payin_volume)} />
          <Metric label="Commission" value={money(merchant.commission_earned)} />
          <Metric label="Net" value={money(merchant.net)} />
          <Metric label="Pending" value={merchant.pending_items} />
          <Metric label="Last Active" value={formatDate(merchant.last_activity)} />
        </>
      }
      hasChildren={false}
    />
  );
}

function AdminRow({ admin, depth }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { agents, merchants }

  const toggle = async () => {
    if (!expanded && data === null) {
      setLoading(true);
      try {
        const res = await api.get(`/api/superadmin/hierarchy/admins/${admin.admin_id}/agents-merchants`);
        setData(res.data || { agents: [], merchants: [] });
      } catch {
        setData({ agents: [], merchants: [] });
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  };

  return (
    <NodeRow
      depth={depth}
      label={`${admin.username} (Admin)`}
      active={admin.is_active}
      metrics={
        <>
          <Metric label="Pay-In Vol" value={money(admin.payin_volume)} />
          <Metric label="Commission" value={money(admin.commission_earned)} />
          <Metric label="Net" value={money(admin.net)} />
          <Metric label="Pending" value={admin.pending_items} />
          <Metric label="Last Active" value={formatDate(admin.last_activity)} />
        </>
      }
      hasChildren
      expanded={expanded}
      loading={loading}
      onToggle={toggle}
    >
      {data && data.agents.length === 0 && data.merchants.length === 0 ? (
        <div className="text-xs text-slate-400 pl-6 pb-2">No agents or merchants</div>
      ) : (
        <>
          {data?.agents.map((a) => <AgentRow key={`ag-${a.agent_id}`} agent={a} depth={depth + 1} />)}
          {data?.merchants.map((m) => <MerchantRow key={`me-${m.merchant_id}`} merchant={m} depth={depth + 1} />)}
        </>
      )}
    </NodeRow>
  );
}

function ClientRow({ client, depth }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [admins, setAdmins] = useState(null);

  const toggle = async () => {
    if (!expanded && admins === null) {
      setLoading(true);
      try {
        const key = client.client_id === null ? "null" : client.client_id;
        const res = await api.get(`/api/superadmin/hierarchy/clients/${key}/admins`);
        setAdmins(res.data?.admins || []);
      } catch {
        setAdmins([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  };

  return (
    <NodeRow
      depth={depth}
      label={client.company_name}
      subLabel={client.domain_name || "no domain"}
      active={client.status === "Active"}
      metrics={
        <>
          <Metric label="Admins" value={client.admin_count} />
          <Metric label="Pay-In Vol" value={money(client.payin_volume)} />
          <Metric label="Commission" value={money(client.commission_earned)} />
          <Metric label="Net" value={money(client.net)} />
          <Metric label="Pending" value={client.pending_items} />
          <Metric label="Last Active" value={formatDate(client.last_activity)} />
        </>
      }
      hasChildren
      expanded={expanded}
      loading={loading}
      onToggle={toggle}
    >
      {admins && admins.length === 0 ? (
        <div className="text-xs text-slate-400 pl-6 pb-2">No admins</div>
      ) : (
        admins?.map((a) => <AdminRow key={a.admin_id} admin={a} depth={depth + 1} />)
      )}
    </NodeRow>
  );
}

// Top level: Client → Admin → Agent/Merchant, each level lazily fetched on
// expand (progressive disclosure, never a full-tree upfront fetch). See
// GET /api/superadmin/hierarchy/* for the underlying grouped-aggregate
// queries — one query per level, never N+1 per row.
function HierarchyOverview() {
  const [clients, setClients] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/superadmin/hierarchy/clients");
      setClients(res.data?.clients || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load hierarchy");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-navy-900 flex items-center">
          Hierarchy Overview
          <MetricInfoTooltip formula="Each node's Pay-In Vol/Commission/Net are computed the same way as the top summary cards, scoped to that node and everything beneath it." />
        </h2>
        <button onClick={load} className="text-xs font-semibold text-[#1E88FF]">Refresh</button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-400 py-6">Loading...</div>
      ) : (
        <div>
          {clients?.map((c) => (
            <ClientRow key={c.client_id ?? "null"} client={c} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HierarchyOverview;
