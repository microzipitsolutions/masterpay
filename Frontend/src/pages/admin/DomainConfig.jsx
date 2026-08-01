import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, XCircle, RefreshCw, Globe, Info, AlertTriangle } from "lucide-react";
import api from "../../api";
import { fileUrl } from "../../config/apiConfig";

const SERVER_IP = "157.245.245.53";

function StatusBadge({ status }) {
  if (!status) return null;
  const map = {
    "Active":               { cls: "bg-green-100 text-green-800 border-green-200",  Icon: CheckCircle },
    "Pending DNS Setup":    { cls: "bg-amber-100 text-amber-800 border-amber-200",  Icon: Clock },
    "Verification Failed":  { cls: "bg-red-100 text-red-800 border-red-200",        Icon: XCircle },
  };
  const { cls, Icon } = map[status] || { cls: "bg-slate-100 text-slate-700 border-slate-200", Icon: Clock };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${cls}`}>
      <Icon size={14} />
      {status}
    </span>
  );
}

export default function DomainConfig() {
  const [config, setConfig]         = useState(null);
  const [loadError, setLoadError]   = useState("");
  const [form, setForm]             = useState({ domain_name: "", company_name: "", theme_color: "#2B7DE9" });
  const [logoFile, setLogoFile]     = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [verifying, setVerifying]   = useState(false);
  const [saveError, setSaveError]   = useState("");
  const [success, setSuccess]       = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const r = await api.get("/api/admin/domain-config");
      const c = r.data;
      setConfig(c);
      setForm({
        domain_name:  c.domain_name  || "",
        company_name: c.company_name || "",
        theme_color:  c.theme_color  || "#2B7DE9",
      });
      if (c.logo_url) setLogoPreview(fileUrl(c.logo_url));
    } catch (err) {
      console.error("[DomainConfig] load error:", err);
      const msg = err?.response?.data?.message || err?.message || "Could not load domain configuration.";
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError(""); setSuccess(""); setVerifyResult(null);
    if (!form.company_name.trim()) return setSaveError("Company name is required.");
    if (!form.domain_name.trim())  return setSaveError("Domain name is required.");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("company_name", form.company_name.trim());
      fd.append("domain_name",  form.domain_name.trim());
      fd.append("theme_color",  form.theme_color);
      if (logoFile) fd.append("logo", logoFile);
      const res = await api.put("/api/admin/domain-config", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setConfig(res.data);
      setForm({
        domain_name:  res.data.domain_name  || "",
        company_name: res.data.company_name || "",
        theme_color:  res.data.theme_color  || "#2B7DE9",
      });
      setLogoFile(null);
      setSuccess("Settings saved successfully.");
    } catch (err) {
      console.error("[DomainConfig] save error:", err);
      setSaveError(err?.response?.data?.message || "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifyResult(null); setSaveError(""); setSuccess("");
    setVerifying(true);
    try {
      const res = await api.post("/api/admin/domain-config/verify");
      setVerifyResult(res.data);
      setConfig((prev) => ({ ...prev, domain_status: res.data.status }));
    } catch (err) {
      console.error("[DomainConfig] verify error:", err);
      setSaveError(err?.response?.data?.message || "Verification failed.");
    } finally {
      setVerifying(false);
    }
  };

  const domainChanged =
    config != null &&
    form.domain_name.trim().toLowerCase() !== (config.domain_name || "").toLowerCase();

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading domain configuration…
      </div>
    );
  }

  // ── Load error ─────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex gap-4 items-start">
          <AlertTriangle size={22} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 mb-1">Could not load domain configuration</p>
            <p className="text-sm text-red-700 mb-3">{loadError}</p>
            <button
              onClick={load}
              className="text-sm font-semibold text-red-700 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No config returned (edge case) ────────────────────────────────────────
  if (!config) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          No domain configuration found for your account. Contact support if this is unexpected.
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  const hostPart = form.domain_name.trim().split(".").length > 2
    ? form.domain_name.trim().split(".")[0]
    : "@";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Globe size={22} /> Domain Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Update your domain URL, company branding, and theme. Point your domain&apos;s A record to{" "}
          <strong className="text-slate-700">{SERVER_IP}</strong>, then verify to activate it.
        </p>
      </div>

      {saveError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* ── Branding ───────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">
            Branding
          </h2>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company Name *</label>
            <input
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              placeholder="Your Company"
              required
              className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Theme Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.theme_color}
                onChange={(e) => setForm((f) => ({ ...f, theme_color: e.target.value }))}
                className="h-11 w-14 rounded-lg border border-slate-300 cursor-pointer p-1"
              />
              <input
                value={form.theme_color}
                onChange={(e) => setForm((f) => ({ ...f, theme_color: e.target.value }))}
                placeholder="#2B7DE9"
                className="flex-1 h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Logo <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="flex items-center gap-4">
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-14 w-14 rounded-lg object-contain border border-slate-200"
                />
              )}
              <label className="cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition">
                {logoFile ? logoFile.name : "Click to upload PNG/JPG"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* ── Domain ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Domain</h2>
            {config.domain_status && config.domain_name && (
              <StatusBadge status={config.domain_status} />
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domain URL *</label>
            <input
              value={form.domain_name}
              onChange={(e) => setForm((f) => ({ ...f, domain_name: e.target.value }))}
              placeholder="pay.yourcompany.com"
              required
              className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="text-xs text-slate-400 mt-1">
              Enter without <code>https://</code> — e.g. <code>pay.yourcompany.com</code>
            </p>
          </div>

          {form.domain_name.trim() && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
                <Info size={16} />
                DNS Setup Instructions
              </div>
              <p className="text-sm text-indigo-800">
                Create an <strong>A record</strong> in your DNS provider pointing to our server:
              </p>
              <div className="rounded-lg bg-white border border-indigo-200 p-3 font-mono text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="font-bold text-slate-800">A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Name / Host</span>
                  <span className="font-bold text-slate-800">{hostPart}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Value / Points to</span>
                  <span className="font-bold text-indigo-700">{SERVER_IP}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">TTL</span>
                  <span className="font-bold text-slate-800">3600 (or Auto)</span>
                </div>
              </div>
              <p className="text-xs text-indigo-700">
                DNS changes typically propagate within 15 minutes to 48 hours. Once set, click{" "}
                <strong>Verify DNS</strong> below.
              </p>
            </div>
          )}

          {config.domain_name && !domainChanged && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={verifying ? "animate-spin" : ""} />
                {verifying ? "Checking DNS…" : "Verify DNS"}
              </button>
              {verifyResult && (
                <p className={`text-sm font-medium ${verifyResult.status === "Active" ? "text-green-700" : "text-red-700"}`}>
                  {verifyResult.status === "Active"
                    ? `Domain verified — resolves to ${SERVER_IP}`
                    : `Not yet pointing to ${SERVER_IP}. Resolved: ${verifyResult.resolved_ips?.join(", ") || "no A records found"}`}
                </p>
              )}
            </div>
          )}

          {domainChanged && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Save your changes first, then verify DNS to activate the new domain.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
