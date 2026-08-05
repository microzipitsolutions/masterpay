import { useEffect, useState } from "react";
import { X, Pencil } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";
import CompanyWalletConfig from "../CompanyWalletConfig";

function SuperAdminCompanyWalletConfigsInner() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingClient, setEditingClient] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/admin/company-wallet-configs");
      setRows(res.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load deposit configs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Company Wallet Configs</h1>
      <p className="text-sm text-gray-500">
        Per-tenant USDT wallet and bank details Agents see when topping up. Each client company
        manages its own — edit here as platform owner if a tenant hasn't configured theirs yet.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-slate-700">
            <tr>
              <th className="px-5 py-4 font-semibold">Client</th>
              <th className="px-5 py-4 font-semibold">Domain</th>
              <th className="px-5 py-4 font-semibold">USDT Wallet</th>
              <th className="px-5 py-4 font-semibold">Bank</th>
              <th className="px-5 py-4 font-semibold">Status</th>
              <th className="px-5 py-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No clients found.</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.client_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-800">{row.company_name}</td>
                  <td className="px-5 py-4 text-slate-500">{row.domain_name}</td>
                  <td className="px-5 py-4 font-mono text-xs break-words [overflow-wrap:anywhere] max-w-[200px]">{row.usdt_wallet_address || "-"}</td>
                  <td className="px-5 py-4 text-xs break-words [overflow-wrap:anywhere]">{row.bank_name || "-"}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        row.configured ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {row.configured ? "Configured" : "Not configured"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setEditingClient(row)}
                      className="inline-flex items-center gap-1 rounded brand-gradient text-white text-xs font-semibold px-3 py-1.5"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setEditingClient(null)}
              className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center"
            >
              <X size={18} />
            </button>
            <CompanyWalletConfig
              key={editingClient.client_id}
              extraParams={{ client_id: editingClient.client_id }}
              title={`Deposit Details — ${editingClient.company_name}`}
              onSaved={() => {
                load();
                setEditingClient(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminCompanyWalletConfigs() {
  return (
    <SuperAdminLayout>
      <SuperAdminCompanyWalletConfigsInner />
    </SuperAdminLayout>
  );
}
