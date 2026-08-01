import { useEffect, useState } from "react";
import { Copy, UploadCloud } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";
import { fileUrl } from "../../config/apiConfig";
import { buildUpiUri } from "../../utils/upi";
import WalletBalanceCard from "../../components/agent/WalletBalanceCard";

function CopyButton({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      className="ml-2 text-xs text-[#2B7DE9]"
    >
      <Copy size={11} className="inline" /> {copied ? "Copied" : label}
    </button>
  );
}

function TopUpWallet() {
  const [method, setMethod] = useState("USDT");
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [amount, setAmount] = useState("");
  const [usdtTxHash, setUsdtTxHash] = useState("");
  const [bankUtr, setBankUtr] = useState("");
  const [proofFile, setProofFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const loadConfig = async () => {
    try {
      setLoadingConfig(true);
      setConfigError("");
      const res = await api.get("/api/agent/company-wallet-config");
      setConfig(res.data);
    } catch (e) {
      setConfigError(
        e?.response?.data?.message ||
          "Deposit details are not configured for your account yet — contact your admin"
      );
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const resetForm = () => {
    setAmount("");
    setUsdtTxHash("");
    setBankUtr("");
    setProofFile(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!amount || Number(amount) <= 0) {
      setMessageType("error");
      setMessage("Enter a valid amount greater than 0");
      return;
    }
    if (method === "USDT" && !config?.usdt_network) {
      setMessageType("error");
      setMessage("USDT network is not configured for your account yet — contact your admin");
      return;
    }
    if (method === "USDT" && !usdtTxHash.trim()) {
      setMessageType("error");
      setMessage("Transaction hash is required for USDT top-ups");
      return;
    }
    if (method === "BANK_TRANSFER" && !bankUtr.trim()) {
      setMessageType("error");
      setMessage("UTR number is required for bank transfer top-ups");
      return;
    }
    if (!proofFile) {
      setMessageType("error");
      setMessage("Payment proof is required");
      return;
    }

    const form = new FormData();
    form.append("method", method);
    form.append("amount", amount);
    if (method === "USDT") form.append("usdt_tx_hash", usdtTxHash.trim());
    else form.append("bank_utr", bankUtr.trim());
    form.append("proof", proofFile);

    try {
      setSubmitting(true);
      await api.post("/api/agent/topups", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessageType("success");
      setMessage("Top-up request submitted. Your admin will review it shortly.");
      resetForm();
    } catch (e) {
      setMessageType("error");
      setMessage(e?.response?.data?.message || "Could not submit top-up request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AgentLayout>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-8 bg-[#f8fafc] min-h-screen">
        <h1 className="text-2xl sm:text-3xl font-bold text-black mb-6">Top Up Funds</h1>

        <WalletBalanceCard hideLinks />

        {message && (
          <div
            className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
              messageType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deposit details */}
          <div className="bg-white border border-[#d9e0ea] rounded-xl p-6 min-w-0">
            <h2 className="text-lg font-bold text-black mb-4">Company Deposit Details</h2>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMethod("USDT")}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${
                  method === "USDT" ? "bg-[#2B7DE9] text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                USDT
              </button>
              <button
                type="button"
                onClick={() => setMethod("BANK_TRANSFER")}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${
                  method === "BANK_TRANSFER" ? "bg-[#2B7DE9] text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Bank Transfer
              </button>
            </div>

            {loadingConfig ? (
              <p className="text-sm text-slate-500">Loading deposit details...</p>
            ) : configError ? (
              <p className="text-sm text-red-600">{configError}</p>
            ) : method === "USDT" ? (
              <div className="space-y-3 text-sm">
                {config?.usdt_qr_file_path && (
                  <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <img
                      src={fileUrl(config.usdt_qr_file_path)}
                      alt="Company USDT deposit QR code"
                      className="w-40 h-40 object-contain rounded"
                    />
                    <p className="text-xs text-slate-500 text-center">
                      Scan to get the wallet address — this QR is not your payment proof. You must still
                      upload your own proof and transaction hash below after sending.
                    </p>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Wallet Address</span>
                  <div className="font-mono break-words [overflow-wrap:anywhere] font-semibold text-black">
                    {config?.usdt_wallet_address || "-"}
                    <CopyButton text={config?.usdt_wallet_address} />
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Network</span>
                  <div className="font-semibold text-black break-words [overflow-wrap:anywhere]">
                    {config?.usdt_network || (
                      <span className="text-red-600 text-xs font-normal">
                        Not configured — contact your admin before topping up via USDT
                      </span>
                    )}
                  </div>
                </div>
                {config?.usdt_label && (
                  <div className="text-xs text-slate-500 border-t border-slate-100 pt-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                    {config.usdt_label}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-500">Bank Name</span>
                  <div className="font-semibold text-black break-words [overflow-wrap:anywhere]">{config?.bank_name || "-"}</div>
                </div>
                <div>
                  <span className="text-slate-500">Account Number</span>
                  <div className="font-mono font-semibold text-black break-words [overflow-wrap:anywhere]">
                    {config?.bank_account_number || "-"}
                    <CopyButton text={config?.bank_account_number} />
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">IFSC Code</span>
                  <div className="font-semibold text-black break-words [overflow-wrap:anywhere]">{config?.bank_ifsc || "-"}</div>
                </div>
                <div>
                  <span className="text-slate-500">Account Holder</span>
                  <div className="font-semibold text-black break-words [overflow-wrap:anywhere]">{config?.bank_account_holder_name || "-"}</div>
                </div>
                {config?.bank_upi_id && (
                  <div>
                    <span className="text-slate-500">UPI ID</span>
                    <div className="font-semibold text-black break-words [overflow-wrap:anywhere]">
                      {config.bank_upi_id}
                      <CopyButton text={config.bank_upi_id} label="Copy UPI ID" />
                    </div>

                    <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <QRCodeSVG
                        value={buildUpiUri({ upiId: config.bank_upi_id, payeeName: config.bank_account_holder_name })}
                        size={160}
                        level="M"
                        includeMargin={false}
                      />
                      <p className="text-xs text-slate-500 text-center">
                        Scan with any UPI app, or copy the UPI ID above
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit form */}
          <div className="bg-white border border-[#d9e0ea] rounded-xl p-6 min-w-0">
            <h2 className="text-lg font-bold text-black mb-4">Submit Top-Up Details</h2>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Amount Deposited</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-12 rounded-lg border border-slate-300 px-4 outline-none focus:border-[#2B7DE9]"
                  placeholder="0.00"
                />
              </div>

              {method === "USDT" ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Transaction Hash</label>
                  <input
                    type="text"
                    value={usdtTxHash}
                    onChange={(e) => setUsdtTxHash(e.target.value)}
                    className="w-full h-12 rounded-lg border border-slate-300 px-4 outline-none focus:border-[#2B7DE9] font-mono text-sm"
                    placeholder="0x..."
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">UTR Number</label>
                  <input
                    type="text"
                    value={bankUtr}
                    onChange={(e) => setBankUtr(e.target.value)}
                    className="w-full h-12 rounded-lg border border-slate-300 px-4 outline-none focus:border-[#2B7DE9]"
                    placeholder="UTR / reference number"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Payment Proof</label>
                <label className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-4 cursor-pointer hover:bg-slate-50">
                  <UploadCloud size={20} className="text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-600 min-w-0 break-words [overflow-wrap:anywhere]">
                    {proofFile ? proofFile.name : "Click to upload screenshot / PDF (max 10MB)"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || !!configError || (method === "USDT" && !config?.usdt_network)}
                className="w-full rounded-lg bg-[#2B7DE9] text-white font-semibold px-4 py-3 text-sm hover:bg-[#0b2a5b] disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Top-Up Request"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AgentLayout>
  );
}

export default TopUpWallet;
