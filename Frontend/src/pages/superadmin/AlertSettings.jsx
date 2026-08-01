import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, Plus, Trash2, Send, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import SuperAdminLayout from "../../layouts/SuperAdminLayout";
import api from "../../api";
import { isValidEmailFormat } from "../../utils/email";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const pendingLabel = (mins) => `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;

const TABS = [
  { id: "settings", label: "Recipients & Settings" },
  { id: "log", label: "Delivery Log" },
  { id: "disputes", label: "Disputes" },
  { id: "overdue", label: "Overdue UTR" },
];

function Banner({ type, children }) {
  if (!children) return null;
  return (
    <div className={`rounded-lg px-4 py-3 text-sm font-medium ${type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
      {children}
    </div>
  );
}

function RecipientsAndSettings({ notify }) {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newEmailError, setNewEmailError] = useState("");
  const [adding, setAdding] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testingAll, setTestingAll] = useState(false);

  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [r, s] = await Promise.all([
        api.get("/api/superadmin/alert-recipients"),
        api.get("/api/superadmin/alert-settings"),
      ]);
      setRecipients(r.data || []);
      setSettings(s.data);
    } catch (e) {
      notify("error", e?.response?.data?.message || "Could not load alert configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addRecipient = async (e) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!isValidEmailFormat(email)) {
      setNewEmailError("Enter a valid email address");
      return;
    }
    setNewEmailError("");
    setAdding(true);
    try {
      await api.post("/api/superadmin/alert-recipients", { email });
      setNewEmail("");
      notify("success", `Added ${email} as an alert recipient.`);
      load();
    } catch (e2) {
      notify("error", e2?.response?.data?.message || "Could not add recipient");
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (r) => {
    try {
      await api.put(`/api/superadmin/alert-recipients/${r.id}`, { is_active: !r.is_active });
      load();
    } catch (e) {
      notify("error", e?.response?.data?.message || "Could not update recipient");
    }
  };

  const removeRecipient = async (r) => {
    if (!window.confirm(`Remove ${r.email} from alert recipients?`)) return;
    try {
      await api.delete(`/api/superadmin/alert-recipients/${r.id}`);
      notify("success", `Removed ${r.email}.`);
      load();
    } catch (e) {
      notify("error", e?.response?.data?.message || "Could not remove recipient");
    }
  };

  const sendTest = async (recipientId) => {
    setTestingId(recipientId ?? "all");
    if (recipientId) setTestingAll(false); else setTestingAll(true);
    try {
      const res = await api.post("/api/superadmin/alerts/test", recipientId ? { recipient_id: recipientId } : {});
      const results = res.data?.results || [];
      const failed = results.filter((r) => r.status === "failed");
      if (failed.length === 0) {
        notify("success", `Test email sent successfully to ${results.length} recipient(s).`);
      } else {
        notify("error", `${failed.length} of ${results.length} test email(s) failed: ${failed.map((f) => f.error).join("; ")}`);
      }
      load();
    } catch (e) {
      notify("error", e?.response?.data?.message || "Could not send test email");
    } finally {
      setTestingId(null);
      setTestingAll(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await api.put("/api/superadmin/alert-settings", settings);
      setSettings(res.data);
      notify("success", "Alert settings saved.");
    } catch (e2) {
      notify("error", e2?.response?.data?.message || "Could not save alert settings");
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Recipients</h2>
        <p className="text-xs text-slate-500 mb-4">
          Operational alerts (new disputes, overdue UTR submissions) are emailed to every active recipient below.
        </p>

        <form onSubmit={addRecipient} className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex-1">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setNewEmailError(""); }}
              placeholder="ops@example.com"
              className={`w-full h-11 rounded-lg border px-3 text-sm ${newEmailError ? "border-red-400" : "border-slate-300"}`}
            />
            {newEmailError && <p className="text-xs text-red-600 mt-1">{newEmailError}</p>}
          </div>
          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className="shrink-0 rounded-lg bg-[#2B7DE9] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#0b2a5b] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={16} /> {adding ? "Adding..." : "Add Recipient"}
          </button>
        </form>

        {recipients.length === 0 ? (
          <p className="text-sm text-slate-400">No alert recipients configured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-slate-50">
                  <th className="text-left px-4 py-2.5 font-bold">Email</th>
                  <th className="text-left px-4 py-2.5 font-bold">Status</th>
                  <th className="text-left px-4 py-2.5 font-bold">Last Sent</th>
                  <th className="text-left px-4 py-2.5 font-bold">Recent Failures (7d)</th>
                  <th className="text-left px-4 py-2.5 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 break-words [overflow-wrap:anywhere] max-w-[220px]">
                      <div className="flex items-center gap-2">
                        <Mail size={14} className="text-slate-400 shrink-0" />
                        {r.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(r)}
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${r.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {r.is_active ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.last_sent_at ? (
                        <span className="flex items-center gap-1">
                          {r.last_status === "sent" ? <CheckCircle2 size={12} className="text-green-600" /> : <XCircle size={12} className="text-red-600" />}
                          {fmtDate(r.last_sent_at)}
                        </span>
                      ) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.recent_failures > 0 ? (
                        <span className="text-red-600 font-semibold flex items-center gap-1"><AlertTriangle size={12} /> {r.recent_failures}</span>
                      ) : "0"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => sendTest(r.id)}
                          disabled={testingId === r.id}
                          className="text-[#2B7DE9] text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                        >
                          <Send size={12} /> {testingId === r.id ? "Sending..." : "Test"}
                        </button>
                        <button onClick={() => removeRecipient(r)} className="text-red-600 text-xs font-semibold flex items-center gap-1">
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {recipients.length > 0 && (
          <button
            onClick={() => sendTest(null)}
            disabled={testingAll}
            className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {testingAll ? "Sending..." : "Send Test Email to All Active Recipients"}
          </button>
        )}
      </div>

      {settings && (
        <form onSubmit={saveSettings} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-sm font-bold text-slate-800">Alert Rules</h2>

          <div className="flex items-center gap-2">
            <input
              id="dispute-alerts"
              type="checkbox"
              checked={settings.dispute_alerts_enabled}
              onChange={(e) => setSettings({ ...settings, dispute_alerts_enabled: e.target.checked })}
            />
            <label htmlFor="dispute-alerts" className="text-sm">Email recipients when a new dispute is raised anywhere on the platform</label>
          </div>

          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div className="flex items-center gap-2">
              <input
                id="overdue-alerts"
                type="checkbox"
                checked={settings.overdue_utr_alerts_enabled}
                onChange={(e) => setSettings({ ...settings, overdue_utr_alerts_enabled: e.target.checked })}
              />
              <label htmlFor="overdue-alerts" className="text-sm font-semibold">Email recipients about overdue UTR submissions</label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Overdue threshold (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={settings.overdue_utr_threshold_minutes}
                  onChange={(e) => setSettings({ ...settings, overdue_utr_threshold_minutes: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm"
                />
                <p className="text-[11px] text-slate-400 mt-1">Default 60 — how long a transaction can sit in UTR Submitted before the first alert.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Reminder interval (minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={settings.overdue_utr_reminder_interval_minutes}
                  onChange={(e) => setSettings({ ...settings, overdue_utr_reminder_interval_minutes: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  disabled={!settings.overdue_utr_reminder_enabled}
                />
                <p className="text-[11px] text-slate-400 mt-1">E.g. 360 (6h) or 720 (12h) — reminders repeat at this interval until resolved.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="reminder-enabled"
                type="checkbox"
                checked={settings.overdue_utr_reminder_enabled}
                onChange={(e) => setSettings({ ...settings, overdue_utr_reminder_enabled: e.target.checked })}
              />
              <label htmlFor="reminder-enabled" className="text-sm">Send repeat reminders while still unresolved</label>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="rounded-lg bg-[#2B7DE9] text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {savingSettings ? "Saving..." : "Save Alert Rules"}
          </button>
        </form>
      )}
    </div>
  );
}

function DeliveryLog({ notify }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = async () => {
    try {
      setLoading(true);
      const params = { page, limit: 25 };
      if (status) params.status = status;
      const res = await api.get("/api/superadmin/alert-logs", { params });
      setLogs(res.data?.data || []);
      setTotalPages(res.data?.totalPages || 1);
    } catch (e) {
      notify("error", e?.response?.data?.message || "Could not load delivery log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-800">Delivery Log</h2>
        <select
          value={status}
          onChange={(e) => { setPage(1); setStatus(e.target.value); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-400">No alert attempts logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 font-bold">Date</th>
                <th className="text-left px-4 py-2.5 font-bold">Event</th>
                <th className="text-left px-4 py-2.5 font-bold">Recipient</th>
                <th className="text-left px-4 py-2.5 font-bold">Related</th>
                <th className="text-left px-4 py-2.5 font-bold">Status</th>
                <th className="text-left px-4 py-2.5 font-bold">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(l.created_at)}</td>
                  <td className="px-4 py-3 text-xs">{l.event_type}</td>
                  <td className="px-4 py-3 text-xs break-words [overflow-wrap:anywhere] max-w-[200px]">{l.recipient}</td>
                  <td className="px-4 py-3 text-xs">{l.related_type ? `${l.related_type} #${l.related_id}` : "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${l.status === "sent" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600 break-words [overflow-wrap:anywhere] max-w-[240px]">{l.error_message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Previous</button>
          <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}

function DisputesMonitor({ notify, highlightId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get("/api/superadmin/alerts/disputes");
        setData(res.data);
      } catch (e) {
        notify("error", e?.response?.data?.message || "Could not load disputes");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => ([
    { key: "payin", title: "Pay-In Disputes (Checkout)", rows: data?.payin || [] },
    { key: "payin_merchant", title: "Pay-In Disputes (Merchant-Raised)", rows: data?.payin_merchant || [] },
    { key: "withdrawal", title: "Withdrawal Disputes", rows: data?.withdrawal || [] },
  ]), [data]);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <div key={s.key} className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">{s.title} ({s.rows.length})</h2>
          {s.rows.length === 0 ? (
            <p className="text-sm text-slate-400">None.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-slate-50">
                    <th className="text-left px-4 py-2.5 font-bold">Ref</th>
                    <th className="text-left px-4 py-2.5 font-bold">Client</th>
                    <th className="text-left px-4 py-2.5 font-bold">Merchant</th>
                    <th className="text-left px-4 py-2.5 font-bold">Amount</th>
                    <th className="text-left px-4 py-2.5 font-bold">UTR</th>
                    <th className="text-left px-4 py-2.5 font-bold">Disputed At</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => {
                    const isHighlighted = highlightId != null && String(r.id) === String(highlightId);
                    return (
                      <tr key={r.id} className={`border-b border-gray-100 ${isHighlighted ? "bg-yellow-50" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs break-words [overflow-wrap:anywhere]">{r.transaction_id || r.id}</td>
                        <td className="px-4 py-3 text-xs">{r.client_name || "-"}</td>
                        <td className="px-4 py-3 text-xs">{r.merchant_name || "-"}</td>
                        <td className="px-4 py-3 font-semibold text-xs">{money(r.amount)}</td>
                        <td className="px-4 py-3 font-mono text-xs break-words [overflow-wrap:anywhere]">{r.utr || "-"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(r.merchant_disputed_at || r.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function OverdueUtrMonitor({ notify, highlightId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api.get("/api/superadmin/alerts/overdue-utr");
        setRows(res.data || []);
      } catch (e) {
        notify("error", e?.response?.data?.message || "Could not load overdue UTR submissions");
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h2 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2"><Clock size={16} /> Overdue UTR Submissions</h2>
      <p className="text-xs text-slate-500 mb-4">Transactions currently past the configured threshold in UTR Submitted status, awaiting admin approval or rejection.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">None currently overdue.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-slate-50">
                <th className="text-left px-4 py-2.5 font-bold">Ref</th>
                <th className="text-left px-4 py-2.5 font-bold">Client</th>
                <th className="text-left px-4 py-2.5 font-bold">Merchant</th>
                <th className="text-left px-4 py-2.5 font-bold">Agent</th>
                <th className="text-left px-4 py-2.5 font-bold">Amount</th>
                <th className="text-left px-4 py-2.5 font-bold">UTR</th>
                <th className="text-left px-4 py-2.5 font-bold">Submitted</th>
                <th className="text-left px-4 py-2.5 font-bold">Pending For</th>
                <th className="text-left px-4 py-2.5 font-bold">Alerted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-gray-100 ${String(r.id) === String(highlightId) ? "bg-yellow-50" : ""}`}>
                  <td className="px-4 py-3 font-mono text-xs break-words [overflow-wrap:anywhere]">{r.transaction_id || r.id}</td>
                  <td className="px-4 py-3 text-xs">{r.client_name || "-"}</td>
                  <td className="px-4 py-3 text-xs">{r.merchant_name || "-"}</td>
                  <td className="px-4 py-3 text-xs">{r.agent_name || "-"}</td>
                  <td className="px-4 py-3 font-semibold text-xs">{money(r.amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs break-words [overflow-wrap:anywhere]">{r.utr_number || "-"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(r.utr_submitted_at)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-red-600">{pendingLabel(Number(r.pending_minutes || 0))}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.overdue_alert_sent_at ? <CheckCircle2 size={14} className="text-green-600" /> : <span className="text-slate-400">Pending scan</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AlertSettingsInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "settings";
  const [tab, setTab] = useState(initialTab);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState("");

  const notify = (type, message) => {
    setFeedbackType(type);
    setFeedback(message);
    if (type === "success") setTimeout(() => setFeedback(""), 4000);
  };

  const changeTab = (id) => {
    setTab(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", id);
      return next;
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Email Alert Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure who receives operational alerts (new disputes, overdue UTR submissions) across every client on the platform.
        </p>
      </div>

      <Banner type={feedbackType}>{feedback}</Banner>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${tab === t.id ? "border-[#2B7DE9] text-[#2B7DE9]" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "settings" && <RecipientsAndSettings notify={notify} />}
      {tab === "log" && <DeliveryLog notify={notify} />}
      {tab === "disputes" && <DisputesMonitor notify={notify} highlightId={searchParams.get("id")} />}
      {tab === "overdue" && <OverdueUtrMonitor notify={notify} highlightId={searchParams.get("id")} />}
    </div>
  );
}

export default function AlertSettings() {
  return (
    <SuperAdminLayout>
      <AlertSettingsInner />
    </SuperAdminLayout>
  );
}
