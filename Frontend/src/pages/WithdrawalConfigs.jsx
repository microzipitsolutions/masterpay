import { useEffect, useMemo, useState } from "react";
import { Copy, Pencil, Plus, RefreshCw, X } from "lucide-react";
import api from "../api";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} }} className="ml-2 text-xs text-[#2B7DE9]">
      <Copy size={11} className="inline" /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function WithdrawalConfigs() {
  const [configs, setConfigs] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ merchant_id: "", max_payment_limit: 0, max_available_limit: 0, commission_percent: 0, is_active: true, agent_ids: [], regenerate_api_key: false });
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState({}); // merchant_id -> { loading, data, error }

  const checkBalance = async (merchantId) => {
    setBalances((b) => ({ ...b, [merchantId]: { loading: true } }));
    try {
      const r = await api.get(`/api/withdrawal/configs/${merchantId}/sspay-balance`);
      setBalances((b) => ({ ...b, [merchantId]: { loading: false, data: r.data } }));
    } catch (e) {
      setBalances((b) => ({ ...b, [merchantId]: { loading: false, error: e?.response?.data?.message || "Failed" } }));
    }
  };

  const fetchAll = async () => {
    try {
      const [c, m, a] = await Promise.all([api.get("/api/withdrawal/configs"), api.get("/api/merchants"), api.get("/api/agents")]);
      setConfigs(c.data || []); setMerchants(m.data || []); setAgents(a.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load");
    }
  };
  useEffect(() => { fetchAll(); }, []);

  const unconfigured = useMemo(() => {
    const ids = new Set(configs.map((c) => c.merchant_id));
    return merchants.filter((m) => !ids.has(m.id));
  }, [merchants, configs]);

  const openNew = () => {
    setEditing({ isNew: true });
    setForm({ merchant_id: "", max_payment_limit: 0, max_available_limit: 0, commission_percent: 0, is_active: true, agent_ids: [], regenerate_api_key: false, sspay_api_key: "", sspay_enabled: false, payout_provider: "a24h", firstpay_api_key: "", survey_api_key: "" });
  };
  const openEdit = (cfg) => {
    setEditing(cfg);
    setForm({
      merchant_id: cfg.merchant_id,
      max_payment_limit: Number(cfg.max_payment_limit || 0),
      max_available_limit: Number(cfg.max_available_limit || 0),
      commission_percent: Number(cfg.commission_percent || 0),
      is_active: cfg.is_active,
      agent_ids: cfg.assigned_agent_ids || [],
      regenerate_api_key: false,
      sspay_api_key: cfg.sspay_api_key || "",
      sspay_enabled: !!cfg.sspay_enabled,
      payout_provider: cfg.payout_provider || "a24h",
      firstpay_api_key: cfg.firstpay_api_key || "",
      survey_api_key: cfg.survey_api_key || "",
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing?.isNew) {
        if (!form.merchant_id) { alert("Select merchant"); setSaving(false); return; }
        await api.post("/api/withdrawal/configs", form);
      } else {
        await api.put(`/api/withdrawal/configs/${editing.merchant_id}`, form);
      }
      setEditing(null);
      fetchAll();
    } catch (e2) {
      alert(e2?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (id) => {
    setForm((f) => ({ ...f, agent_ids: f.agent_ids.includes(id) ? f.agent_ids.filter((x) => x !== id) : [...f.agent_ids, id] }));
  };

  return (
    <div className="px-2 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Withdrawal Configs</h1>
        <button onClick={openNew} disabled={unconfigured.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#2B7DE9] text-white font-semibold px-4 py-2.5 hover:bg-[#0b2a5b] disabled:opacity-50">
          <Plus size={16} /> Add Merchant Config
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-bold">Merchant</th>
              <th className="text-left px-4 py-3 font-bold">Max Payment</th>
              <th className="text-left px-4 py-3 font-bold">Available</th>
              <th className="text-left px-4 py-3 font-bold">Commission %</th>
              <th className="text-left px-4 py-3 font-bold">API Key</th>
              <th className="text-left px-4 py-3 font-bold">Assigned Agents</th>
              <th className="text-left px-4 py-3 font-bold">SSPay</th>
              <th className="text-left px-4 py-3 font-bold">Active</th>
              <th className="text-right px-4 py-3 font-bold">Action</th>
            </tr>
          </thead>
          <tbody>
            {configs.length === 0 ? (
              <tr><td colSpan="9" className="text-center py-8 text-slate-500">No configs yet</td></tr>
            ) : configs.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3"><strong>{c.merchant_name}</strong><div className="text-xs text-slate-500">@{c.merchant_username}</div></td>
                <td className="px-4 py-3">₹{Number(c.max_payment_limit).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">₹{Number(c.max_available_limit).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">{c.commission_percent}%</td>
                <td className="px-4 py-3"><span className="font-mono text-xs">{(c.api_key || "").substring(0, 12)}…</span><CopyButton text={c.api_key} /></td>
                <td className="px-4 py-3 text-xs">
                  {(c.assigned_agent_ids || []).map((aid) => agents.find((a) => a.id === aid)?.name || aid).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const prov = c.payout_provider || "a24h";
                    const provKey = prov === "firstpay" ? c.firstpay_api_key : prov === "survey" ? c.survey_api_key : c.sspay_api_key;
                    const provLabel = prov === "firstpay" ? "FirstPay" : prov === "survey" ? "Survey" : "A24H";
                    return provKey ? (
                    <div className="space-y-1.5">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${c.sspay_enabled ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>{c.sspay_enabled ? `Auto · ${provLabel}` : `Key set · ${provLabel}`}</span>
                      <div>
                        <button
                          type="button"
                          onClick={() => checkBalance(c.merchant_id)}
                          disabled={balances[c.merchant_id]?.loading}
                          className="inline-flex items-center gap-1 rounded border border-indigo-200 text-indigo-700 text-[11px] font-semibold px-2 py-1 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          <RefreshCw size={10} className={balances[c.merchant_id]?.loading ? "animate-spin" : ""} />
                          {balances[c.merchant_id]?.loading ? "Checking…" : "Check balance"}
                        </button>
                        {(() => {
                          const b = balances[c.merchant_id];
                          if (!b || b.loading) return null;
                          if (b.error) return <div className="text-[11px] text-red-600 mt-0.5">{b.error}</div>;
                          const d = b.data || {};
                          if (d.mode === "sandbox" || d.balance == null)
                            return <div className="text-[11px] text-slate-500 mt-0.5">Sandbox — no real balance</div>;
                          return (
                            <div className="text-[11px] text-slate-700 mt-0.5">
                              <span className="font-semibold text-emerald-700">₹{Number(d.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                              {d.mode ? <span className="text-slate-400"> ({d.mode})</span> : null}
                              {(d.min > 0 || d.max > 0) && (
                                <div className="text-slate-400">min ₹{Number(d.min).toLocaleString("en-IN")} · max ₹{Number(d.max).toLocaleString("en-IN")}</div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-500">Manual</span>
                  );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${c.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{c.is_active ? "Yes" : "No"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 rounded bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5"><Pencil size={12} /> Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="relative w-full max-w-lg rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <button type="button" onClick={() => setEditing(null)} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"><X size={18} /></button>
            <h2 className="text-xl font-bold mb-5">{editing.isNew ? "New Merchant Config" : `Edit Config: ${editing.merchant_name}`}</h2>

            <div className="space-y-4">
              {editing.isNew && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Merchant</label>
                  <select value={form.merchant_id} onChange={(e) => setForm({ ...form, merchant_id: Number(e.target.value) })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" required>
                    <option value="">Select…</option>
                    {unconfigured.map((m) => <option key={m.id} value={m.id}>{m.name} (@{m.username})</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Max Payment Limit</label>
                  <input type="number" value={form.max_payment_limit} onChange={(e) => setForm({ ...form, max_payment_limit: Number(e.target.value) })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Available Limit</label>
                  <input type="number" value={form.max_available_limit} onChange={(e) => setForm({ ...form, max_available_limit: Number(e.target.value) })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Commission %</label>
                <input type="number" step="0.01" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: Number(e.target.value) })} className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Agents (agents under these agents can pick)</label>
                <div className="border border-slate-300 rounded-lg p-2 max-h-40 overflow-y-auto">
                  {agents.length === 0 ? <div className="text-xs text-slate-500 p-2">No agents</div> : agents.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer">
                      <input type="checkbox" checked={form.agent_ids.includes(a.id)} onChange={() => toggleAgent(a.id)} />
                      <span className="text-sm">{a.name} <span className="text-xs text-slate-500">(@{a.username})</span></span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input id="active" type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <label htmlFor="active" className="text-sm">Active</label>
              </div>
              {!editing.isNew && (
                <div className="flex items-center gap-2">
                  <input id="regen" type="checkbox" checked={form.regenerate_api_key} onChange={(e) => setForm({ ...form, regenerate_api_key: e.target.checked })} />
                  <label htmlFor="regen" className="text-sm flex items-center gap-1"><RefreshCw size={12} /> Regenerate API Key (invalidates current key)</label>
                </div>
              )}

              <div className="border-t border-slate-200 pt-4 mt-2">
                <div className="text-sm font-semibold text-slate-800 mb-2">SSPay Auto-Payout (bank withdrawals only)</div>
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-900 mb-3">
                  When enabled, bank-account withdrawal requests are sent automatically to SSPay's payout API. SSPay
                  pays from this merchant's wallet, returns the UTR, then the merchant approves to mark Cleared.
                  UPI withdrawals stay in the manual agent queue.
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Payout Provider</label>
                  <select
                    value={form.payout_provider}
                    onChange={(e) => setForm({ ...form, payout_provider: e.target.value })}
                    className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm bg-white"
                  >
                    <option value="a24h">A24H (default — current live provider)</option>
                    <option value="firstpay">FirstPay (Gopay)</option>
                    <option value="survey">Survey (Suivrepay)</option>
                  </select>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Auto-payout uses the API key for the selected provider. Switching only affects new payouts.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">A24H API Key</label>
                  <input
                    type="text"
                    value={form.sspay_api_key}
                    onChange={(e) => setForm({ ...form, sspay_api_key: e.target.value })}
                    placeholder="sspay_sk_..."
                    className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    Use <code>sspay_sk_test_...</code> for sandbox or <code>sspay_sk_...</code> for live.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">FirstPay API Key</label>
                  <input
                    type="text"
                    value={form.firstpay_api_key}
                    onChange={(e) => setForm({ ...form, firstpay_api_key: e.target.value })}
                    placeholder="firstpay_sk_..."
                    className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    Only used when Payout Provider is <strong>FirstPay</strong>.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Survey API Key</label>
                  <input
                    type="text"
                    value={form.survey_api_key}
                    onChange={(e) => setForm({ ...form, survey_api_key: e.target.value })}
                    placeholder="firstpay_sk_..."
                    className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    Only used when Payout Provider is <strong>Survey</strong> (srv.firstpay.online).
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <input id="sspay-enabled" type="checkbox" checked={form.sspay_enabled} onChange={(e) => setForm({ ...form, sspay_enabled: e.target.checked })} />
                  <label htmlFor="sspay-enabled" className="text-sm">Enable auto-payout via SSPay</label>
                </div>

                {editing && !editing.isNew && (
                  <div className="rounded bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-900 mt-2">
                    <span className="font-semibold">Webhook URL (auto-configured on every payout — no need to paste in SSPay dashboard):</span><br/>
                    <code className="break-all">{`${window.location.origin}/api/withdrawal/sspay-webhook/${editing.merchant_id}`}</code>
                    <div className="mt-1 text-emerald-700">
                      Our backend passes this URL with each <code>/public/payout</code> call, so SSPay sends callbacks directly to us for this merchant. You can leave the SSPay wallet's default webhook empty.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-[#2B7DE9] text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
