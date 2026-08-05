import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, CheckCircle2, XCircle, Loader2, UploadCloud, Trash2 } from "lucide-react";
import api from "../api";
import { fileUrl } from "../config/apiConfig";
import { isValidUpiFormat, buildUpiUri } from "../utils/upi";

const emptyForm = {
  usdt_wallet_address: "",
  usdt_network: "",
  usdt_label: "",
  usdt_rate: 1,
  bank_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_account_holder_name: "",
  bank_upi_id: "",
  is_active: true,
};

// Per-tenant deposit details Agents see when topping up. Admins manage
// their own tenant's config here; extraParams lets the super-admin variant
// (pages/superadmin/CompanyWalletConfigs.jsx) reuse this same form for an
// explicit client_id.
function CompanyWalletConfig({ extraParams = null, onSaved = null, title = "Company Deposit Details" }) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // UPI validation state: "idle" (untouched / just edited, not yet re-checked),
  // "checking" (backend round-trip in flight), "valid" (format confirmed by
  // the backend), "invalid" (format rejected). A previously-saved UPI ID is
  // trusted as "valid" on load without re-calling the backend — it could only
  // have been saved if it passed the same format check server-side.
  const [upiStatus, setUpiStatus] = useState("idle");
  const [upiMessage, setUpiMessage] = useState("");
  const [copiedUpi, setCopiedUpi] = useState(false);

  // QR image for the USDT wallet — a separate uploaded file, distinct from
  // the client-side-generated UPI QR preview above. qrFile = a newly chosen
  // file pending save; removeQr = user asked to clear the saved QR on save.
  const [qrFile, setQrFile] = useState(null);
  const [removeQr, setRemoveQr] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setMessage("");
      const res = await api.get("/api/admin/company-wallet-config", { params: extraParams || {} });
      setForm({ ...emptyForm, ...res.data });
      setUpiStatus(res.data?.bank_upi_id ? "valid" : "idle");
      setUpiMessage("");
      setQrFile(null);
      setRemoveQr(false);
    } catch (e) {
      if (e?.response?.status !== 404) {
        setMessageType("error");
        setMessage(e?.response?.data?.message || "Could not load deposit details");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(extraParams)]);

  const handleUpiChange = (value) => {
    setForm((f) => ({ ...f, bank_upi_id: value }));
    // Any edit invalidates the previous validation result — must re-validate
    // before it can be saved again (unless cleared, which is always allowed).
    setUpiStatus("idle");
    setUpiMessage("");
  };

  const validateUpi = async () => {
    const upiId = (form.bank_upi_id || "").trim();
    if (!upiId) {
      setUpiStatus("idle");
      setUpiMessage("");
      return;
    }
    // Instant client-side rejection for obviously malformed input — avoids a
    // round trip for the common case, backend is still authoritative below.
    if (!isValidUpiFormat(upiId)) {
      setUpiStatus("invalid");
      setUpiMessage("Invalid UPI ID format. Expected format: username@bank (e.g. name@okhdfcbank).");
      return;
    }
    try {
      setUpiStatus("checking");
      const res = await api.post("/api/admin/company-wallet-config/validate-upi", { upi_id: upiId });
      setUpiStatus(res.data?.valid ? "valid" : "invalid");
      setUpiMessage(res.data?.message || "");
    } catch (e) {
      setUpiStatus("invalid");
      setUpiMessage(e?.response?.data?.message || "Could not validate UPI ID");
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setMessage("");

    const upiId = (form.bank_upi_id || "").trim();
    // Deposit details must not be saved until UPI validation passes — mirrors
    // the same rule enforced authoritatively by PUT on the backend, so the
    // user gets the clear error before submitting rather than after.
    if (upiId && upiStatus !== "valid") {
      setMessageType("error");
      setMessage("Validate the UPI ID before saving (or clear it to skip UPI collection).");
      return;
    }

    // Network is mandatory whenever a USDT wallet address is entered — mirrors
    // the backend's authoritative check, surfaced here before the round trip.
    const usdtAddress = (form.usdt_wallet_address || "").trim();
    const usdtNetwork = (form.usdt_network || "").trim();
    if (usdtAddress && !usdtNetwork) {
      setMessageType("error");
      setMessage("USDT Network is required whenever a wallet address is entered.");
      return;
    }

    setSaving(true);
    try {
      // Always FormData (not JSON) so a QR file, when attached, travels in the
      // same request as the text fields.
      const body = new FormData();
      Object.entries({ ...form, ...(extraParams || {}) }).forEach(([key, value]) => {
        if (value !== null && value !== undefined) body.append(key, value);
      });
      if (qrFile) body.append("usdt_qr", qrFile);
      if (removeQr) body.append("remove_qr", "true");

      const res = await api.put("/api/admin/company-wallet-config", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessageType("success");
      setMessage("Deposit details saved.");
      setUpiStatus(upiId ? "valid" : "idle");
      setForm((f) => ({ ...f, usdt_qr_file_path: res.data?.usdt_qr_file_path ?? f.usdt_qr_file_path }));
      setQrFile(null);
      setRemoveQr(false);
      if (onSaved) onSaved();
    } catch (e2) {
      setMessageType("error");
      setMessage(e2?.response?.data?.message || "Could not save deposit details");
    } finally {
      setSaving(false);
    }
  };

  const copyUpiId = async () => {
    if (!form.bank_upi_id) return;
    try {
      await navigator.clipboard.writeText(form.bank_upi_id);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 1200);
    } catch {}
  };

  const upiPreviewUri =
    upiStatus === "valid" && form.bank_upi_id
      ? buildUpiUri({ upiId: form.bank_upi_id, payeeName: form.bank_account_holder_name })
      : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">{title}</h1>
      <p className="text-sm text-gray-500">
        Configure the USDT wallet and bank account Agents should send top-up funds to. Agents
        only ever see this tenant's details on their Top Up Funds page.
      </p>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            messageType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading...</p>
      ) : (
        <form onSubmit={save} className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-3">USDT Wallet</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Wallet Address</label>
                <input
                  value={form.usdt_wallet_address || ""}
                  onChange={(e) => setForm({ ...form, usdt_wallet_address: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Network <span className="text-red-500">*</span>
                  {(form.usdt_wallet_address || "").trim() && (
                    <span className="text-xs font-normal text-slate-400 ml-1">(required whenever a wallet address is set)</span>
                  )}
                </label>
                <input
                  value={form.usdt_network || ""}
                  onChange={(e) => setForm({ ...form, usdt_network: e.target.value })}
                  placeholder="e.g. TRC20, ERC20, BEP20"
                  className={`w-full h-11 rounded-lg border px-3 text-sm ${
                    (form.usdt_wallet_address || "").trim() && !(form.usdt_network || "").trim()
                      ? "border-red-400"
                      : "border-slate-300"
                  }`}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">USDT to INR Rate</label>
                <input
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  required
                  value={form.usdt_rate || ""}
                  onChange={(e) => setForm({ ...form, usdt_rate: e.target.value })}
                  placeholder="e.g. 102"
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">Current conversion rate used for new Agent USDT top-ups.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">QR Code (optional)</label>
                <div className="flex items-start gap-4">
                  {qrFile ? (
                    <img src={URL.createObjectURL(qrFile)} alt="New QR preview" className="w-24 h-24 object-contain rounded border border-slate-200" />
                  ) : form.usdt_qr_file_path && !removeQr ? (
                    <img src={fileUrl(form.usdt_qr_file_path)} alt="Current QR" className="w-24 h-24 object-contain rounded border border-slate-200" />
                  ) : (
                    <div className="w-24 h-24 rounded border border-dashed border-slate-300 flex items-center justify-center text-slate-300 text-xs text-center">
                      No QR uploaded
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50">
                      <UploadCloud size={14} /> {qrFile ? qrFile.name : "Upload QR image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          setQrFile(e.target.files?.[0] || null);
                          setRemoveQr(false);
                        }}
                      />
                    </label>
                    {(form.usdt_qr_file_path || qrFile) && (
                      <button
                        type="button"
                        onClick={() => { setQrFile(null); setRemoveQr(true); }}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600"
                      >
                        <Trash2 size={12} /> Remove QR
                      </button>
                    )}
                    <p className="text-[11px] text-slate-400">JPG, PNG, or WEBP, up to 3MB. Shown only on the Agent's Top Up Funds page.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Instructions (optional)</label>
                <textarea
                  rows={2}
                  value={form.usdt_label || ""}
                  onChange={(e) => setForm({ ...form, usdt_label: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Bank Transfer</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Bank Name</label>
                <input
                  value={form.bank_name || ""}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">IFSC Code</label>
                <input
                  value={form.bank_ifsc || ""}
                  onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Account Number</label>
                <input
                  value={form.bank_account_number || ""}
                  onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Account Holder Name</label>
                <input
                  value={form.bank_account_holder_name || ""}
                  onChange={(e) => setForm({ ...form, bank_account_holder_name: e.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-300 px-3 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">UPI ID (optional)</label>
                <div className="flex gap-2">
                  <input
                    value={form.bank_upi_id || ""}
                    onChange={(e) => handleUpiChange(e.target.value)}
                    onBlur={validateUpi}
                    placeholder="name@okhdfcbank"
                    className={`w-full h-11 rounded-lg border px-3 text-sm ${
                      upiStatus === "invalid"
                        ? "border-red-400"
                        : upiStatus === "valid"
                        ? "border-green-400"
                        : "border-slate-300"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={validateUpi}
                    disabled={upiStatus === "checking" || !form.bank_upi_id}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Validate
                  </button>
                </div>

                {upiStatus === "checking" && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Loader2 size={12} className="animate-spin" /> Validating...
                  </div>
                )}
                {upiStatus === "valid" && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 size={12} /> {upiMessage || "Format valid"}
                  </div>
                )}
                {upiStatus === "invalid" && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
                    <XCircle size={12} /> {upiMessage || "Invalid UPI ID"}
                  </div>
                )}

                {upiPreviewUri && (
                  <div className="mt-3 flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <QRCodeSVG value={upiPreviewUri} size={96} level="M" includeMargin={false} />
                    <div className="text-xs text-slate-600">
                      <p className="font-semibold text-slate-800 mb-1">QR preview</p>
                      <p>This is the QR Agents will see once you save. It always matches the UPI ID above — save again after any change to update it.</p>
                      <button
                        type="button"
                        onClick={copyUpiId}
                        className="mt-2 inline-flex items-center gap-1 text-[#1E88FF] font-semibold"
                      >
                        <Copy size={11} /> {copiedUpi ? "Copied" : "Copy UPI ID"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="cwc-active"
              type="checkbox"
              checked={form.is_active !== false}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <label htmlFor="cwc-active" className="text-sm">Active (visible to agents)</label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                saving ||
                (!!form.bank_upi_id && upiStatus !== "valid") ||
                (!!(form.usdt_wallet_address || "").trim() && !(form.usdt_network || "").trim())
              }
              className="rounded-lg bg-[#1E88FF] text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Deposit Details"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default CompanyWalletConfig;
