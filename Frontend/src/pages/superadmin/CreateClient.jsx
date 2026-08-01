import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";

export default function CreateClient() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: "", domain_name: "", theme_color: "#2B7DE9", status: "Active",
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

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
    setError("");
    if (!form.company_name.trim() || !form.domain_name.trim())
      return setError("Company name and domain name are required.");

    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logoFile) fd.append("logo", logoFile);
      const res = await api.post("/api/superadmin/clients", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess(res.data);
    } catch (e2) {
      setError(e2?.response?.data?.message || "Could not create client");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SuperAdminLayout>
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Client Created!</h2>
            <p className="text-slate-600 text-sm mb-4">
              <strong>{success.company_name}</strong> is set up on <code className="bg-slate-100 px-1 rounded">{success.domain_name}</code>. DNS status is <strong>Pending</strong> — the admin must point their A record to <code className="bg-slate-100 px-1 rounded">157.245.245.53</code> and verify via their Domain Config page.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => navigate("/superadmin/clients")}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-indigo-700">
                View All Clients
              </button>
              <button onClick={() => { setSuccess(null); setForm({ company_name:"",domain_name:"",theme_color:"#2B7DE9",status:"Active" }); setLogoFile(null); setLogoPreview(null); }}
                className="border border-slate-200 text-slate-700 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-50">
                Create Another
              </button>
            </div>
          </div>
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Create Client</h1>
          <p className="text-sm text-slate-500 mt-1">Add a new tenant. Each client gets their own domain, branding, and isolated data.</p>
        </div>

        {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Branding */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wide border-b border-slate-100 pb-3">Client Branding</h2>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company Name *</label>
              <input value={form.company_name} onChange={e => set("company_name", e.target.value)}
                placeholder="e.g. FastPay" required
                className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Domain Name *</label>
              <input value={form.domain_name} onChange={e => set("domain_name", e.target.value)}
                placeholder="fastpay.com" required
                className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <p className="text-xs text-slate-400 mt-1">Enter the bare hostname (e.g. <code>pay.fastpay.com</code>). The admin can update this later from their Domain Config page.</p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Theme Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.theme_color} onChange={e => set("theme_color", e.target.value)}
                    className="h-11 w-14 rounded-lg border border-slate-300 cursor-pointer p-1" />
                  <input value={form.theme_color} onChange={e => set("theme_color", e.target.value)}
                    placeholder="#2B7DE9"
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
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Logo <span className="text-slate-400 font-normal">(optional — uses company initial if not set)</span></label>
              <div className="flex items-center gap-4">
                {logoPreview && <img src={logoPreview} alt="" className="h-14 w-14 rounded-lg object-contain border border-slate-200" />}
                <label className="cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition">
                  {logoFile ? logoFile.name : "Click to upload PNG/JPG"}
                  <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => navigate("/superadmin/clients")}
              className="border border-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
              {loading ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </SuperAdminLayout>
  );
}
