import { useEffect, useState } from "react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";

function CreatePaymentProof() {
  const [accounts, setAccounts] = useState([]);
  const [formData, setFormData] = useState({
    utr_number: "",
    amount: "",
    account_id: "",
  });

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setFetching(true);
      const res = await api.get("/api/agent-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.log("Fetch accounts error:", error);
      setMessage(error?.response?.data?.message || "Could not fetch accounts");
    } finally {
      setFetching(false);
    }
  };

  const handleAccountSelect = (e) => {
    const selectedId = e.target.value;
    const selected = accounts.find((item) => String(item.id) === String(selectedId));

    setSelectedAccount(selected || null);

    setFormData((prev) => ({
      ...prev,
      account_id: selectedId,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!formData.utr_number) {
      setMessage("UTR Number is required");
      return;
    }

    if (!formData.amount) {
      setMessage("Amount is required");
      return;
    }

    const payload = {
      account_id: formData.account_id ? Number(formData.account_id) : undefined,
      utr_number: formData.utr_number.trim(),
      amount: Number(formData.amount),
    };

    try {
      setLoading(true);
      const res = await api.post("/api/payment-proof/verify", payload);

      setMessage(
        res.data?.recorded_for_review
          ? res.data.message ||
              "Recorded for admin review (UTR already exists with a different amount)."
          : "Payment proof matched. Transaction approved successfully."
      );

      setFormData({ utr_number: "", amount: "", account_id: "" });
      setSelectedAccount(null);

      setTimeout(() => {
        fetchAccounts();
      }, 500);
    } catch (error) {
      console.log("Verify request error:", error);
      setMessage(error?.response?.data?.message || "UTR or amount does not match");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AgentLayout>
      <div className="flex justify-center pt-4 sm:pt-8 px-3 sm:px-0">
        <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-4 sm:p-8 shadow-sm">
          <h1 className="mb-6 sm:mb-8 text-2xl sm:text-3xl font-bold text-gray-950">
            Payment Proof Form
          </h1>

          {message && (
            <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="font-semibold text-sm">
                UTR Number <span className="text-red-500">*</span>
              </label>
              <input
                value={formData.utr_number}
                onChange={(e) => setFormData({ ...formData, utr_number: e.target.value })}
                placeholder="UTR Number"
                required
                className="mt-2 h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div>
              <label className="font-semibold text-sm">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="Amount"
                required
                className="mt-2 h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div>
              <label className="font-semibold text-sm">
                Bank Account <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <select
                value={formData.account_id}
                onChange={handleAccountSelect}
                className="mt-2 h-12 w-full rounded-lg border border-gray-300 bg-white px-4 outline-none focus:border-[#2B7DE9]"
              >
                <option value="">
                  {fetching ? "Loading..." : "Any / blank — match by amount + UTR"}
                </option>

                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.bank_name || "Bank"} - {item.account_number || "-"}
                    {item.is_active === false ? " (OFF)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedAccount && (
              <div className="rounded-lg border border-[#dbe7f5] bg-[#eef3fb] px-4 py-3 text-sm text-[#2B7DE9]">
                <div className="font-semibold mb-1">Selected Account</div>
                <div>Bank: {selectedAccount.bank_name || "-"}</div>
                <div>Account: {selectedAccount.account_number || "-"}</div>
                <div>Holder: {selectedAccount.account_holder_name || "-"}</div>
                <div>IFSC: {selectedAccount.ifsc_code || "-"}</div>
              </div>
            )}

            <div className="flex justify-center pt-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-[#2B7DE9] px-8 py-3 font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Checking..." : "Save Payment Proof"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AgentLayout>
  );
}

export default CreatePaymentProof;
