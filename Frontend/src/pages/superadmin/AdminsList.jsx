import { useEffect, useState } from "react";
import { Copy, Download, Pencil, X } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";
import { API_BASE_URL } from "../../config/apiConfig";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* noop */
        }
      }}
      className="ml-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
    >
      <Copy size={12} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function AdminsList() {
  const [admins, setAdmins] = useState([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", password: "", is_active: true });
  const [saving, setSaving] = useState(false);

  const fetchAdmins = async () => {
    try {
      const res = await api.get("/api/superadmin/admins");
      setAdmins(res.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load admins");
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCopyLogin = async (admin) => {
    const text = `username: ${admin.username}\npassword: ${admin.plain_password || ""}\nurl: ${window.location.origin}/login`;
    try {
      await navigator.clipboard.writeText(text);
      alert("Login credentials copied");
    } catch {
      alert("Could not copy");
    }
  };

  const downloadReport = async (admin) => {
    setDownloading(admin.id);
    try {
      const token = localStorage.getItem("rdpay_token") || "";
      const r = await fetch(`${API_BASE_URL}/api/superadmin/admins/${admin.id}/report`, {
        headers: { Authorization: `Bearer ${token}`, role: "super-admin" },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Failed to download report");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${admin.username}-${admin.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    } finally {
      setDownloading(null);
    }
  };

  const openEdit = (admin) => {
    setEditing(admin);
    setEditForm({ username: admin.username, password: "", is_active: !!admin.is_active });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.put(`/api/superadmin/admins/${editing.id}`, editForm);
      setEditing(null);
      await fetchAdmins();
    } catch (e2) {
      alert(e2?.response?.data?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admins</h1>
          <p className="text-sm text-slate-600 mt-1">Manage admin accounts, view credentials, download reports.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-bold">ID</th>
              <th className="text-left px-4 py-3 font-bold">Username</th>
              <th className="text-left px-4 py-3 font-bold">Password</th>
              <th className="text-left px-4 py-3 font-bold">Status</th>
              <th className="text-left px-4 py-3 font-bold">Created</th>
              <th className="text-right px-4 py-3 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-slate-500">No admins yet</td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">{admin.id}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono">{admin.username}</span>
                    <CopyButton text={admin.username} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono">{admin.plain_password || "—"}</span>
                    {admin.plain_password && <CopyButton text={admin.plain_password} />}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      admin.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {admin.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {admin.created_at ? new Date(admin.created_at).toLocaleString("en-GB") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyLogin(admin)}
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3 py-2"
                      >
                        Copy Login
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadReport(admin)}
                        disabled={downloading === admin.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 disabled:opacity-50"
                      >
                        <Download size={12} />
                        {downloading === admin.id ? "..." : "Report"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(admin)}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
          <form
            onSubmit={saveEdit}
            className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-6"
          >
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="absolute right-4 top-4 w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold mb-5">Edit Admin #{editing.id}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">New Password</label>
                <input
                  type="text"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Leave empty to keep current"
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="active"
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                <label htmlFor="active" className="text-sm text-slate-700">Active</label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </SuperAdminLayout>
  );
}
