import { useEffect, useState } from "react";
import { AlertOctagon, ShieldCheck } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";

function MaintenanceModeInner() {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [confirmingEnable, setConfirmingEnable] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/superadmin/maintenance-mode");
      setStatus(res.data);
      setMessage(res.data?.message || "");
    } catch (e) {
      setFeedbackType("error");
      setFeedback(e?.response?.data?.message || "Could not load maintenance status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (is_enabled) => {
    setSaving(true);
    setFeedback("");
    try {
      const res = await api.put("/api/superadmin/maintenance-mode", { is_enabled, message });
      setStatus(res.data);
      setFeedbackType("success");
      setFeedback(is_enabled ? "Maintenance mode enabled." : "Maintenance mode disabled.");
      setConfirmingEnable(false);
    } catch (e) {
      setFeedbackType("error");
      setFeedback(e?.response?.data?.message || "Could not update maintenance status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">Maintenance Mode</h1>
      <p className="text-sm text-gray-500">
        When enabled, new logins are blocked for every role except Super Admin, and new Pay-In sessions
        (both <code>POST /api/payins</code> and the hosted checkout flow) are rejected with a 503. Existing
        sessions, in-flight checkout pages, and sandbox/test-mode traffic are not affected.
      </p>

      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${feedbackType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {feedback}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-3">
            {status?.is_enabled ? (
              <AlertOctagon size={28} className="text-red-600" />
            ) : (
              <ShieldCheck size={28} className="text-green-600" />
            )}
            <div>
              <div className="text-lg font-bold text-slate-900">
                Currently {status?.is_enabled ? "ENABLED" : "Disabled"}
              </div>
              {status?.updated_at && (
                <div className="text-xs text-slate-400">
                  Last changed {new Date(status.updated_at).toLocaleString("en-GB")}
                  {status.updated_by_role ? ` by ${status.updated_by_role} #${status.updated_by_id}` : ""}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Message shown to blocked users</label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Platform is under maintenance. Please try again shortly."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {status?.is_enabled ? (
            <button
              onClick={() => toggle(false)}
              disabled={saving}
              className="rounded-lg bg-green-600 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Disable Maintenance Mode"}
            </button>
          ) : confirmingEnable ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm text-red-800 font-semibold">
                This will immediately block real logins and new Pay-Ins platform-wide. Are you sure?
              </p>
              <div className="flex gap-2">
                <button onClick={() => toggle(true)} disabled={saving} className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {saving ? "Enabling..." : "Yes, Enable Maintenance Mode"}
                </button>
                <button onClick={() => setConfirmingEnable(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingEnable(true)}
              className="rounded-lg bg-red-600 text-white px-5 py-2.5 text-sm font-semibold"
            >
              Enable Maintenance Mode
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MaintenanceMode() {
  return (
    <SuperAdminLayout>
      <MaintenanceModeInner />
    </SuperAdminLayout>
  );
}
