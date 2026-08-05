import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import MerchantLayout from "../../layouts/MerchantLayout";
import { API_BASE_URL } from "../../config/apiConfig";

function buildUpiUri({ upiId, payeeName, amount, note, ref }) {
  if (!upiId) return "";
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName) params.set("pn", payeeName);
  if (amount) params.set("am", String(amount));
  params.set("cu", "INR");
  if (note) params.set("tn", note);
  if (ref) params.set("tr", ref);
  return `upi://pay?${params.toString()}`;
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(value));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
      className="ml-2 text-xs font-medium text-[#1E88FF] hover:text-[#0b2a5b] underline"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center">
        <span className="font-medium text-gray-900 text-sm break-all">{value}</span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function CreatePayin() {
  const navigate = useNavigate();
  const API_URL = API_BASE_URL;

  const [formData, setFormData] = useState({
    amount: "",
    webhook_url: "",
    unique_id: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [createdPayin, setCreatedPayin] = useState(null);

  const decodeToken = (token) => {
    try {
      if (!token) return null;
      const payload = token.split(".")[1];
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  };

  const getLoggedInUser = () => {
    try {
      const storedUser = localStorage.getItem("rdpay_user");
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser?.id) return parsedUser;
      }
      const token = localStorage.getItem("rdpay_token");
      const decodedToken = decodeToken(token);
      if (decodedToken) {
        return {
          id: decodedToken.userId,
          role: decodedToken.role,
          merchantId: decodedToken.merchantId,
        };
      }
      return null;
    } catch {
      const token = localStorage.getItem("rdpay_token");
      const decodedToken = decodeToken(token);
      if (decodedToken) {
        return {
          id: decodedToken.userId,
          role: decodedToken.role,
          merchantId: decodedToken.merchantId,
        };
      }
      return null;
    }
  };

  const getMerchantId = () => {
    try {
      const viewAs = JSON.parse(localStorage.getItem("rdpay_view_as") || "null");
      if (viewAs?.role === "merchant") return viewAs.id;
    } catch {
      /* fall through */
    }
    const userInfo = JSON.parse(localStorage.getItem("rdpay_user_info") || "{}");
    if (userInfo?.id || userInfo?.merchantId || userInfo?.merchant_id) {
      return userInfo.id || userInfo.merchantId || userInfo.merchant_id;
    }
    const user = getLoggedInUser();
    if (!user) return null;
    if (user.role === "merchant") return user.id || user.merchantId || null;
    return user.merchantId || user.merchant_id || null;
  };

  const getAuthHeaders = () => {
    const user = getLoggedInUser();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("rdpay_token") || ""}`,
      role: user?.role || "",
      userid: user?.id || "",
    };
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setCreatedPayin(null);

    const amount = Number(formData.amount);
    const merchantId = getMerchantId();

    if (!amount || amount <= 0) {
      setMessage("Valid amount is required");
      return;
    }
    if (!merchantId) {
      setMessage("Merchant ID not found. Please logout and login again.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/payins`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount,
          webhook_url: formData.webhook_url || "",
          unique_id: formData.unique_id || "",
          merchant_id: Number(merchantId),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not create payin");

      setCreatedPayin(data);
      setFormData({ amount: "", webhook_url: "", unique_id: "" });
    } catch (error) {
      setMessage(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleNewPayin = () => {
    setCreatedPayin(null);
    setMessage("");
  };

  const upiUri = createdPayin
    ? buildUpiUri({
        upiId: createdPayin.upi_id,
        payeeName: createdPayin.account_holder_name,
        amount: createdPayin.amount,
        note: createdPayin.unique_id || createdPayin.transaction_id,
        ref: createdPayin.transaction_id,
      })
    : "";

  return (
    <MerchantLayout>
      <div className="flex justify-center pt-4 sm:pt-8 px-3 sm:px-0">
        <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-8 shadow-sm">
          <h1 className="mb-6 sm:mb-8 text-2xl sm:text-3xl font-bold text-gray-950">Payin Form</h1>

          {message && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {message}
            </div>
          )}

          {!createdPayin && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="Amount"
                  required
                  className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Webhook Url</label>
                <input
                  type="text"
                  name="webhook_url"
                  value={formData.webhook_url}
                  onChange={handleChange}
                  placeholder="Webhook Url"
                  className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">Unique Id</label>
                <input
                  type="text"
                  name="unique_id"
                  value={formData.unique_id}
                  onChange={handleChange}
                  placeholder="Unique Id"
                  className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                />
              </div>

              <div className="rounded-lg border border-[#dbe7f5] bg-[#e8f3ff] px-4 py-3 text-sm text-[#0b2a5b]">
                After creating payin, the system will automatically select an active agent bank account connected to this merchant, and show the QR code + bank details below.
              </div>

              <div className="flex justify-center pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#1E88FF] px-8 py-3 text-sm font-semibold text-white hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Saving..." : "Save Payin"}
                </button>
              </div>
            </form>
          )}

          {createdPayin && (
            <div>
              <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                Payin created successfully — share these details with the customer
              </div>

              <div className="mb-5 flex items-center justify-between rounded-lg bg-[#0b2a5b] px-5 py-4 text-white">
                <div>
                  <div className="text-xs uppercase tracking-wide opacity-80">Amount to collect</div>
                  <div className="text-xs opacity-70">Ref: {createdPayin.transaction_id}</div>
                </div>
                <div className="text-2xl font-bold">₹{Number(createdPayin.amount).toLocaleString("en-IN")}</div>
              </div>

              {createdPayin.upi_id && upiUri && (
                <>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">Scan & Pay with any UPI app</h3>
                  <div className="flex justify-center mb-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200">
                      <QRCodeSVG value={upiUri} size={200} level="M" includeMargin={false} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-center">
                    <span className="text-xs text-gray-500">UPI ID:</span>
                    <span className="ml-1 font-mono text-xs text-gray-900">{createdPayin.upi_id}</span>
                    <CopyButton value={createdPayin.upi_id} />
                  </div>
                  <a
                    href={upiUri}
                    className="mt-3 block w-full text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-sm py-2 rounded-lg transition sm:hidden"
                  >
                    Open UPI App
                  </a>

                  <div className="my-5 flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 uppercase tracking-wide">or pay by bank transfer</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </>
              )}

              <div className="bg-gray-50 rounded-xl px-4 py-2">
                <DetailRow label="Bank" value={createdPayin.bank_name} />
                <DetailRow label="Account holder" value={createdPayin.account_holder_name} />
                <DetailRow label="Account number" value={createdPayin.account_number} />
                <DetailRow label="IFSC" value={createdPayin.ifsc_code} />
                <DetailRow label="UPI ID" value={createdPayin.upi_id} />
              </div>

              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                <button
                  type="button"
                  onClick={handleNewPayin}
                  className="rounded-lg border border-slate-200 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Create another payin
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/merchant/transactions")}
                  className="rounded-lg bg-[#1E88FF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#0b2a5b]"
                >
                  Go to transactions
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </MerchantLayout>
  );
}

export default CreatePayin;
