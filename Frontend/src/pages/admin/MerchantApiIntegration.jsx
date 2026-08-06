import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import api from "../../api";
import { PageHeader, Card, Modal, Badge, Button } from "../../components/ui";

// Admin/Super Admin-only page for onboarding external platforms (e.g.
// TrustPay) as ordinary MasterPay merchants: view masked Pay-In/Pay-Out
// credential status, reveal/regenerate them deliberately, manage the webhook
// signing secret + optional domain allowlist, enable/disable the
// integration, and test webhook connectivity. Entirely separate from the
// normal Merchants / Withdrawal Configs pages — nothing here changes those
// flows.

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unsupported/denied — ignore */
        }
      }}
      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline"
    >
      <Copy size={12} /> {copied ? "Copied" : "Copy"}
    </button>
  );
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

// A masked credential row: shows the masked value, a Reveal toggle (fetches
// the real value only on demand), a Copy button (of whatever is currently
// shown), and an optional Regenerate action gated by an explicit confirm step.
function CredentialRow({ label, masked, configured, credential, merchantId, onRegenerated, regenerateHint }) {
  const [revealed, setRevealed] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");

  const reveal = async () => {
    setError("");
    setRevealing(true);
    try {
      const r = await api.post(`/api/admin/merchant-integrations/${merchantId}/reveal`, { credential });
      setRevealed(r.data.value);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not reveal credential");
    } finally {
      setRevealing(false);
    }
  };

  const regenerate = async () => {
    setError("");
    setRegenerating(true);
    try {
      const r = await api.post(`/api/admin/merchant-integrations/${merchantId}/regenerate`, { credential, confirm: true });
      setRevealed(r.data.value);
      setConfirmingRegen(false);
      onRegenerated?.();
    } catch (e) {
      setError(e?.response?.data?.message || "Could not regenerate credential");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-control border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-navy-900">{label}</p>
        {!configured && <Badge tone="neutral">Not configured</Badge>}
      </div>

      {configured && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="rounded bg-slate-50 px-2.5 py-1.5 text-xs font-mono text-navy-800 break-all">
              {revealed || masked}
            </code>
            {!revealed ? (
              <button type="button" onClick={reveal} disabled={revealing} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline disabled:opacity-50">
                <Eye size={12} /> {revealing ? "Revealing…" : "Reveal"}
              </button>
            ) : (
              <button type="button" onClick={() => setRevealed(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:underline">
                <EyeOff size={12} /> Hide
              </button>
            )}
            <CopyButton text={revealed || null} />
          </div>

          <div className="mt-3">
            {!confirmingRegen ? (
              <button type="button" onClick={() => setConfirmingRegen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline">
                <RefreshCw size={12} /> Regenerate
              </button>
            ) : (
              <div className="rounded-lg bg-danger-bg border border-red-200 p-3">
                <p className="text-xs text-danger flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={13} /> This immediately invalidates the current value.
                </p>
                {regenerateHint && <p className="mt-1 text-[11px] text-danger/80">{regenerateHint}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={regenerate}
                    disabled={regenerating}
                    className="rounded-lg bg-danger text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    {regenerating ? "Regenerating…" : "Yes, regenerate"}
                  </button>
                  <button type="button" onClick={() => setConfirmingRegen(false)} className="rounded-lg border border-slate-300 text-xs font-semibold px-3 py-1.5">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!configured && regenerateHint && <p className="mt-2 text-xs text-slate-400">{regenerateHint}</p>}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

function IntegrationDetail({ merchantId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [domainsInput, setDomainsInput] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.get(`/api/admin/merchant-integrations/${merchantId}`);
      setDetail(r.data);
      setDomainsInput((r.data.allowed_webhook_domains || []).join(", "));
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load integration detail");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId]);

  const toggleEnabled = async () => {
    setSaving(true);
    try {
      await api.put(`/api/admin/merchant-integrations/${merchantId}`, {
        is_enabled: !detail.is_enabled,
        allowed_webhook_domains: detail.allowed_webhook_domains || [],
      });
      await load();
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.message || "Could not update integration");
    } finally {
      setSaving(false);
    }
  };

  const saveDomains = async () => {
    setSaving(true);
    try {
      const domains = domainsInput.split(",").map((d) => d.trim()).filter(Boolean);
      await api.put(`/api/admin/merchant-integrations/${merchantId}`, {
        is_enabled: detail.is_enabled,
        allowed_webhook_domains: domains,
      });
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || "Could not save allowlist");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.post(`/api/admin/merchant-integrations/${merchantId}/test-connectivity`, { webhook_url: testUrl });
      setTestResult(r.data);
    } catch (e) {
      setTestResult({ ok: false, error: e?.response?.data?.message || "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={detail ? `Integration — ${detail.name}` : "Integration"} maxWidth="max-w-2xl">
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error && !detail ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <div className="space-y-5">
          {error && <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-xs text-danger">{error}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={detail.is_active ? "success" : "danger"}>{detail.is_active ? "Merchant Active" : "Merchant Inactive"}</Badge>
            <Badge tone={detail.agent_linked ? "success" : "danger"}>
              {detail.agent_linked ? `Agent: ${detail.agent_name || detail.agent_id}` : "Not linked to an agent"}
            </Badge>
            <Badge tone={detail.is_enabled ? "success" : "neutral"}>
              {detail.is_enabled ? "Integration Enabled" : "Integration Disabled"}
            </Badge>
          </div>

          {!detail.agent_linked && (
            <div className="rounded-lg border border-amber-200 bg-warning-bg px-3 py-2 text-xs text-warning flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Every Pay-In checkout call for this merchant will fail with "Merchant is not linked to an agent" until an
              agent is assigned via the normal Merchant edit screen.
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={saving}
              className={`inline-flex items-center gap-2 rounded-control px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                detail.is_enabled ? "bg-danger-bg text-danger" : "bg-success-bg text-success"
              }`}
            >
              {detail.is_enabled ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
              {detail.is_enabled ? "Disable Integration" : "Enable Integration"}
            </button>
            <p className="mt-1 text-[11px] text-slate-400">
              Disabling blocks Pay-In and Pay-Out API calls for this merchant only — every other merchant is unaffected.
            </p>
          </div>

          <div className="space-y-3">
            <CredentialRow
              label="Pay-In API Key (merchants.api_key)"
              masked={detail.payin_key_masked}
              configured={!!detail.payin_key_masked}
              credential="payin_key"
              merchantId={merchantId}
              onRegenerated={load}
              regenerateHint="Used by TrustPay's x-api-key header on POST /api/payin/checkout/create."
            />
            <CredentialRow
              label="Pay-Out API Key (withdrawal_merchant_configs.api_key)"
              masked={detail.payout_key_masked}
              configured={detail.payout_configured}
              credential="payout_key"
              merchantId={merchantId}
              onRegenerated={load}
              regenerateHint={
                detail.payout_configured
                  ? "Used by TrustPay's api-key header on POST /api/withdrawal/payout-create."
                  : "Not configured yet — set this up on the Withdrawal Configs page first, then it can be managed here."
              }
            />
            <CredentialRow
              label="Webhook Signing Secret"
              masked={detail.webhook_secret_configured ? "••••••••••••••••" : null}
              configured={detail.webhook_secret_configured}
              credential="webhook_secret"
              merchantId={merchantId}
              onRegenerated={load}
              regenerateHint="Independent 256-bit secret used to sign X-MasterPay-Signature on every webhook — never reused from either API key."
            />
          </div>

          <div className="rounded-control border border-slate-200 p-4">
            <p className="text-sm font-semibold text-navy-900">Allowed Webhook Domains (optional)</p>
            <p className="mt-1 text-xs text-slate-400">
              Comma-separated hostnames, e.g. <code>hooks.trustpay.example, *.trustpay.example</code>. Leave blank for no
              restriction (default).
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={domainsInput}
                onChange={(e) => setDomainsInput(e.target.value)}
                placeholder="hooks.trustpay.example"
                className="flex-1 h-10 rounded-lg border border-slate-300 px-3 text-sm font-mono"
              />
              <Button size="sm" variant="secondary" onClick={saveDomains} disabled={saving}>
                Save
              </Button>
            </div>
          </div>

          <div className="rounded-control border border-slate-200 p-4">
            <p className="text-sm font-semibold text-navy-900 flex items-center gap-1.5">
              <Zap size={14} /> Test Webhook Connectivity
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Sends a signed <code>integration.test</code> ping (if a webhook secret is configured) to the URL below.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://trustpay.example/hooks/masterpay"
                className="flex-1 h-10 rounded-lg border border-slate-300 px-3 text-sm font-mono"
              />
              <Button size="sm" onClick={runTest} disabled={testing || !testUrl}>
                {testing ? "Testing…" : "Test"}
              </Button>
            </div>
            {testResult && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${testResult.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
                {testResult.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
                <div>
                  {testResult.ok ? (
                    <span>Reachable — HTTP {testResult.status} in {testResult.latency_ms}ms {testResult.signed ? "(signed)" : "(unsigned — no webhook secret configured)"}</span>
                  ) : (
                    <span>{testResult.error || `HTTP ${testResult.status}`}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-100 pt-3">
            <p>Integration created: {fmtDate(detail.integration_created_at)}</p>
            <p>Last updated: {fmtDate(detail.integration_updated_at)}</p>
            <p>Webhook secret generated: {fmtDate(detail.webhook_secret_created_at)} · last regenerated: {fmtDate(detail.webhook_secret_regenerated_at)}</p>
            <p>Pay-In key last regenerated here: {fmtDate(detail.payin_key_regenerated_at)}</p>
            <p>Pay-Out key last regenerated here: {fmtDate(detail.payout_key_regenerated_at)}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function MerchantApiIntegration() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api.get("/api/admin/merchant-integrations");
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load merchant integrations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="px-2 py-2">
      <PageHeader
        title="Merchant API Integration"
        subtitle="Onboard external platforms (e.g. TrustPay) as MasterPay merchants — masked credentials, webhook signing, and connectivity testing."
        className="mb-6"
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-danger-bg px-4 py-3 text-sm text-danger">{error}</div>}

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50/95 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-bold">Merchant</th>
                <th className="text-left px-4 py-3 font-bold">Agent</th>
                <th className="text-left px-4 py-3 font-bold">Pay-In Key</th>
                <th className="text-left px-4 py-3 font-bold">Pay-Out</th>
                <th className="text-left px-4 py-3 font-bold">Webhook Secret</th>
                <th className="text-left px-4 py-3 font-bold">Integration</th>
                <th className="text-right px-4 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-400">No merchants found</td></tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.merchant_id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-3">
                      <strong className="text-navy-900">{m.name}</strong>
                      <div className="text-xs text-slate-500">@{m.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      {m.agent_linked ? (
                        <span className="text-slate-700">{m.agent_name || m.agent_id}</span>
                      ) : (
                        <Badge tone="danger">Not linked</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.payin_key_masked}</td>
                    <td className="px-4 py-3">
                      {m.payout_configured ? (
                        <span className="font-mono text-xs text-slate-600">{m.payout_key_masked}</span>
                      ) : (
                        <Link to="/withdrawal/configs" className="text-xs text-brand-blue hover:underline">
                          Configure →
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={m.webhook_secret_configured ? "success" : "neutral"}>
                        {m.webhook_secret_configured ? "Configured" : "Not set"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={m.is_enabled ? "success" : "neutral"}>{m.is_enabled ? "Enabled" : "Disabled"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(m.merchant_id)}
                        className="inline-flex items-center gap-1 rounded brand-gradient text-white text-xs font-semibold px-3 py-1.5"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <IntegrationDetail merchantId={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}
