import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";

export default function EditClient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: "", domain_name: "", theme_color: "#2B7DE9", status: "Active" });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [domainStatus, setDomainStatus] = useState(null);

  useEffect(() => {
    api.get(`/api/superadmin/clients/${id}`)
      .then(r => {
        const c = r.data;
        setForm({ company_name: c.company_name, domain_name: c.domain_name || "", theme_color: c.theme_color, status: c.status });
        setDomainStatus(c.domain_status || null);
        if (c.logo_url) setLogoPreview(c.logo_url);
      })
      .catch(() => setError("Could not load client"))
      .finally(() => setLoading(false));
  }, [id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logoFile) fd.append("logo", logoFile);
      await api.put(`/api/superadmin/clients/${id}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      navigate("/superadmin/clients");
    } catch (e2) {
      setError(e2?.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SuperAdminLayout><div className="text-center py-20 text-slate-400">Loading...</div></SuperAdminLayout>;

  return (
    <SuperAdminLayout>
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Edit Client</h1>
          <p className="text-sm text-slate-500 mt-1">Update branding and settings.</p>
        </div>

        {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company Name *</label>
            <input value={form.company_name} onChange={e => set("company_name", e.target.value)} required
              className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domain Name *</label>
            <input value={form.domain_name} onChange={e => set("domain_name", e.target.value)}
              placeholder="e.g. pay.example.com" required
              className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500" />
            {domainStatus && form.domain_name && (
              <div className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                domainStatus === "Active" ? "bg-green-50 text-green-700" :
                domainStatus === "Pending DNS Setup" ? "bg-amber-50 text-amber-700" :
                "bg-red-50 text-red-700"
              }`}>
                {domainStatus === "Active" ? <CheckCircle size={12} /> :
                 domainStatus === "Pending DNS Setup" ? <Clock size={12} /> :
                 <XCircle size={12} />}
                {domainStatus}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Theme Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.theme_color} onChange={e => set("theme_color", e.target.value)}
                  className="h-11 w-14 rounded-lg border border-slate-300 cursor-pointer p-1" />
                <input value={form.theme_color} onChange={e => set("theme_color", e.target.value)}
                  className="flex-1 h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Logo</label>
            <div className="flex items-center gap-4">
              {logoPreview && <img src={logoPreview} alt="" className="h-14 w-14 rounded-lg object-contain border border-slate-200" />}
              <label className="cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition">
                {logoFile ? logoFile.name : "Click to change logo"}
                <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
              </label>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => navigate("/superadmin/clients")}
              className="border border-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </SuperAdminLayout>
  );
}
