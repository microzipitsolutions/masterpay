import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Plus, Pencil, CheckCircle, XCircle, Clock } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";

export default function ClientsList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    api.get("/api/superadmin/clients")
      .then((r) => setClients(r.data || []))
      .catch(() => setError("Could not load clients"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const toggleStatus = async (client) => {
    const newStatus = client.status === "Active" ? "Inactive" : "Active";
    try {
      const fd = new FormData();
      fd.append("company_name", client.company_name);
      fd.append("domain_name", client.domain_name);
      fd.append("theme_color", client.theme_color);
      fd.append("status", newStatus);
      await api.put(`/api/superadmin/clients/${client.id}`, fd);
      load();
    } catch {
      alert("Could not update status");
    }
  };

  function DomainStatusBadge({ status }) {
    if (!status) return null;
    const cfg = {
      "Active": { cls: "bg-green-50 text-green-700", Icon: CheckCircle },
      "Pending DNS Setup": { cls: "bg-amber-50 text-amber-700", Icon: Clock },
      "Verification Failed": { cls: "bg-red-50 text-red-700", Icon: XCircle },
    }[status] || { cls: "bg-slate-100 text-slate-500", Icon: Clock };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${cfg.cls}`}>
        <cfg.Icon size={10} />{status}
      </span>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 size={22} /> Clients
          </h1>
          <p className="text-slate-500 text-sm mt-1">Manage all tenants. Each client gets their own branding and data.</p>
        </div>
        <Link
          to="/superadmin/clients/create"
          className="flex items-center gap-2 brand-gradient text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:brightness-[1.06]"
        >
          <Plus size={16} /> New Client
        </Link>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}
      {loading ? (
        <div className="text-center py-20 text-slate-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Company</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Domain</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Theme</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Created</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No clients yet. <Link to="/superadmin/clients/create" className="text-indigo-600 font-semibold">Create one →</Link>
                  </td>
                </tr>
              )}
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="h-8 w-8 rounded object-contain border border-slate-100" />
                      ) : (
                        <div className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: c.theme_color }}>
                          {c.company_name.charAt(0)}
                        </div>
                      )}
                      <span className="font-semibold text-slate-800">{c.company_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-slate-600 font-mono text-xs">{c.domain_name}</span>
                    <div><DomainStatusBadge status={c.domain_status} /></div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-slate-200" style={{ backgroundColor: c.theme_color }} />
                      <span className="text-slate-400 text-xs font-mono">{c.theme_color}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.status === "Active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {c.status === "Active" ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/superadmin/clients/${c.id}/edit`)}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleStatus(c)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold ${c.status === "Active" ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}
                      >
                        {c.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SuperAdminLayout>
  );
}
