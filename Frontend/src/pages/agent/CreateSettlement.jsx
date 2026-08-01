import { useState } from "react";
import AgentLayout from "../../layouts/AgentLayout";
import api from "../../api";

function CreateSettlement() {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!amount || Number(amount) <= 0) {
      setMessageType("error");
      setMessage("Please enter a valid amount greater than 0.");
      return;
    }

    try {
      setSaving(true);
    const storedUser = JSON.parse(localStorage.getItem("rdpay_user_info") || "{}");

await api.post("/api/agent/settlement-transactions", {
  amount: Number(amount),
  agent_id: Number(storedUser.agentId || storedUser.agent_id || storedUser.id),
});
      setMessageType("success");
      setMessage("Settlement request submitted successfully. Waiting for admin approval.");
      setAmount("");
    } catch (error) {
      setMessageType("error");
      setMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Could not submit settlement request"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AgentLayout>
      <div className="flex justify-center px-3 sm:px-0 pt-4 sm:pt-8">
        <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-5 sm:p-8 shadow">
          <h1 className="mb-2 text-3xl font-bold">Create Settlement</h1>
          <p className="mb-6 text-sm text-gray-500">
            Submit a settlement request to your admin. The request will be pending until approved or rejected.
          </p>

          {message && (
            <div
              className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
                messageType === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-sm font-semibold">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                placeholder="Enter amount"
                value={amount}
                min="1"
                onChange={(e) => setAmount(e.target.value)}
                className="mt-2 h-12 w-full rounded-lg border px-4 outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div className="flex justify-center pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto rounded-lg bg-[#2B7DE9] px-8 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Submitting..." : "Submit Settlement Request"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AgentLayout>
  );
}

export default CreateSettlement;
