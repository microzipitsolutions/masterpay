// import { useEffect, useMemo, useState } from "react";
// import api from "../api";

// function maskAccountNumber(value) {
//   const text = String(value || "");
//   if (!text) return "-";
//   const last4 = text.slice(-4);
//   return `${"*".repeat(Math.max(text.length - 4, 4))}${last4}`;
// }

// function CreateSettlement() {
//   // Tab: "merchant" = existing admin→merchant flow, "agent" = new admin→agent flow
//   const [tab, setTab] = useState("merchant");

//   // --- Merchant settlement state ---
//   const [formData, setFormData] = useState({ amount: "", account: "" });
//   const [accounts, setAccounts] = useState([]);
//   const [loadingAccounts, setLoadingAccounts] = useState(true);
//   const [saving, setSaving] = useState(false);
//   const [message, setMessage] = useState("");
//   const [messageType, setMessageType] = useState("");

//   // --- Agent settlement state ---
//   const [agentAmount, setAgentAmount] = useState("");
//   const [agentId, setAgentId] = useState("");
//   const [agents, setAgents] = useState([]);
//   const [loadingAgents, setLoadingAgents] = useState(true);
//   const [agentSaving, setAgentSaving] = useState(false);
//   const [agentMessage, setAgentMessage] = useState("");
//   const [agentMessageType, setAgentMessageType] = useState("");

//   const [merchantId, setMerchantId] = useState("");
// const [merchants, setMerchants] = useState([]);
// const [loadingMerchants, setLoadingMerchants] = useState(true);

//   const selectedAccount = useMemo(
//     () => accounts.find((a) => String(a.id) === String(formData.account)),
//     [accounts, formData.account]
//   );

//   useEffect(() => {
//     const fetchSettlementAccounts = async () => {
//       try {
//         setLoadingAccounts(true);
//         const res = await api.get("/api/settlement-accounts");
//         const data = Array.isArray(res.data) ? res.data : [];
//         setAccounts(data.filter((item) => item.is_active === true));
//       } catch (error) {
//         setMessageType("error");
//         setMessage(error?.response?.data?.message || error?.message || "Could not fetch settlement accounts");
//       } finally {
//         setLoadingAccounts(false);
//       }
//     };
//     fetchSettlementAccounts();
//   }, []);

//   useEffect(() => {
//     const fetchAgents = async () => {
//       try {
//         setLoadingAgents(true);
//         const res = await api.get("/api/agents");
//         setAgents(Array.isArray(res.data) ? res.data : []);
//       } catch (error) {
//         setAgentMessageType("error");
//         setAgentMessage(error?.response?.data?.message || error?.message || "Could not fetch agents");
//       } finally {
//         setLoadingAgents(false);
//       }
//     };
//     fetchAgents();
//   }, []);

  

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setMessage("");

//     if (!formData.amount || Number(formData.amount) <= 0) {
//       setMessageType("error");
//       setMessage("Please enter a valid amount.");
//       return;
//     }
//     if (!formData.account) {
//       setMessageType("error");
//       setMessage("Please select a settlement account.");
//       return;
//     }
//     if (!selectedAccount) {
//       setMessageType("error");
//       setMessage("Selected account not found.");
//       return;
//     }
//     if (Number(formData.amount) < Number(selectedAccount.min_transaction_amount || 0)) {
//       setMessageType("error");
//       setMessage(`Minimum transaction amount is ${selectedAccount.min_transaction_amount}.`);
//       return;
//     }
//     if (Number(formData.amount) > Number(selectedAccount.max_payment_limit || 0)) {
//       setMessageType("error");
//       setMessage(`Maximum payment limit is ${selectedAccount.max_payment_limit}.`);
//       return;
//     }

//     try {
//       setSaving(true);
//       const payload = { amount: Number(formData.amount), settlement_account_id: selectedAccount.id };
//       await api.post("/api/admin/settlement-transactions", payload);
//       setMessageType("success");
//       setMessage("Settlement transaction created successfully.");
//       setFormData({ amount: "", account: "" });
//     } catch (error) {
//       setMessageType("error");
//       setMessage(error?.response?.data?.message || error?.message || "Could not create settlement transaction");
//     } finally {
//       setSaving(false);
//     }
//   };

//   const handleAgentSubmit = async (e) => {
//     e.preventDefault();
//     setAgentMessage("");

//     if (!agentAmount || Number(agentAmount) <= 0) {
//       setAgentMessageType("error");
//       setAgentMessage("Please enter a valid amount.");
//       return;
//     }
//     if (!agentId) {
//       setAgentMessageType("error");
//       setAgentMessage("Please select an agent.");
//       return;
//     }

//     try {
//       setAgentSaving(true);
//       await api.post("/api/admin/agent-settlement-transactions", {
//         amount: Number(agentAmount),
//         agent_id: Number(agentId),
//       });
//       setAgentMessageType("success");
//       setAgentMessage("Agent settlement transaction created successfully.");
//       setAgentAmount("");
//       setAgentId("");
//     } catch (error) {
//       setAgentMessageType("error");
//       setAgentMessage(error?.response?.data?.message || error?.message || "Could not create agent settlement transaction");
//     } finally {
//       setAgentSaving(false);
//     }
//   };

//   return (
//     <div className="flex justify-center pt-8">
//       <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow">
//         <h1 className="mb-4 text-3xl font-bold">Create Settlement</h1>

//         {/* Tab toggle */}
//         <div className="mb-6 flex gap-2">
   
   
//         </div>

//         {/* ── Merchant Settlement Form ── */}
//         {tab === "merchant" && (
//           <>
//             {message && (
//               <div className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${messageType === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
//                 {message}
//               </div>
//             )}
//             <form onSubmit={handleSubmit} className="space-y-6">
//               <div>
//                 <label className="text-sm font-semibold">Amount <span className="text-red-500">*</span></label>
//                 <input
//                   type="number"
//                   placeholder="Amount"
//                   value={formData.amount}
//                   onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
//                   className="mt-2 h-12 w-full rounded-lg border px-4 outline-none focus:border-[#1E88FF]"
//                 />
//               </div>
//               <div>
//                 <label className="text-sm font-semibold">Select Settlement Account <span className="text-red-500">*</span></label>
//                 <select
//                   value={formData.account}
//                   onChange={(e) => setFormData({ ...formData, account: e.target.value })}
//                   disabled={loadingAccounts}
//                   className="mt-2 h-12 w-full rounded-lg border bg-white px-4 outline-none focus:border-[#1E88FF] disabled:cursor-not-allowed disabled:bg-gray-100"
//                 >
//                   <option value="">{loadingAccounts ? "Loading accounts..." : "Select Option"}</option>
//                   {accounts.map((account) => (
//                     <option key={account.id} value={account.id}>
//                       ID {account.id} - {account.bank_name || "Bank"} - {maskAccountNumber(account.account_number)}
//                     </option>
//                   ))}
//                 </select>
//                 {!loadingAccounts && accounts.length === 0 && (
//                   <p className="mt-2 text-xs font-medium text-red-600">No active settlement accounts found for this admin.</p>
//                 )}
//               </div>
//               <div className="flex justify-center pt-4">
//                 <button
//                   type="submit"
//                   disabled={saving || loadingAccounts}
//                   className="rounded-lg bg-[#1E88FF] px-8 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
//                 >
//                   {saving ? "Saving..." : "Save Settlement"}
//                 </button>
//               </div>
//             </form>
//           </>
//         )}

       
//       </div>
//     </div>
//   );
// }

// export default CreateSettlement;


import { useEffect, useMemo, useState } from "react";
import api from "../api";

function maskAccountNumber(value) {
  const text = String(value || "");
  if (!text) return "-";
  const last4 = text.slice(-4);
  return `${"*".repeat(Math.max(text.length - 4, 4))}${last4}`;
}

function CreateSettlement() {
  const [tab, setTab] = useState("merchant");

  // --- Merchant settlement state ---
  const [formData, setFormData] = useState({ amount: "", account: "" });
  const [settlementDate, setSettlementDate] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // --- Agent settlement state ---
  const [agentAmount, setAgentAmount] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentMessageType, setAgentMessageType] = useState("");

  // --- Merchant dropdown state ---
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);

  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === String(formData.account)),
    [accounts, formData.account]
  );

  const merchantAccounts = accounts.filter(
    (account) => String(account.merchant_id) === String(merchantId)
  );

  useEffect(() => {
    const fetchSettlementAccounts = async () => {
      try {
        setLoadingAccounts(true);

        const res = await api.get("/api/settlement-accounts");

        const data = Array.isArray(res.data) ? res.data : [];

        setAccounts(data.filter((item) => item.is_active === true));
      } catch (error) {
        setMessageType("error");
        setMessage(
          error?.response?.data?.message ||
            error?.message ||
            "Could not fetch settlement accounts"
        );
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchSettlementAccounts();
  }, []);

  useEffect(() => {
    const fetchMerchants = async () => {
      try {
        setLoadingMerchants(true);

        const res = await api.get("/api/merchants");

        setMerchants(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        setMessageType("error");
        setMessage(
          error?.response?.data?.message ||
            error?.message ||
            "Could not fetch merchants"
        );
      } finally {
        setLoadingMerchants(false);
      }
    };

    fetchMerchants();
  }, []);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoadingAgents(true);

        const res = await api.get("/api/agents");

        setAgents(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        setAgentMessageType("error");
        setAgentMessage(
          error?.response?.data?.message ||
            error?.message ||
            "Could not fetch agents"
        );
      } finally {
        setLoadingAgents(false);
      }
    };

    fetchAgents();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage("");

    if (!formData.amount || Number(formData.amount) <= 0) {
      setMessageType("error");
      setMessage("Please enter a valid amount.");
      return;
    }

    if (!merchantId) {
      setMessageType("error");
      setMessage("Please select a merchant.");
      return;
    }

    if (!formData.account) {
      setMessageType("error");
      setMessage("Please select a settlement account.");
      return;
    }

    if (!selectedAccount) {
      setMessageType("error");
      setMessage("Selected account not found.");
      return;
    }

    if (
      Number(formData.amount) >
      Number(selectedAccount.max_payment_limit || 0)
    ) {
      setMessageType("error");
      setMessage(
        `Maximum payment limit is ${selectedAccount.max_payment_limit}.`
      );
      return;
    }

    try {
      setSaving(true);

      const payload = {
        amount: Number(formData.amount),
        settlement_account_id: selectedAccount.id,
        settlement_date: settlementDate || undefined,
      };

      await api.post("/api/admin/settlement-transactions", payload);

      setMessageType("success");
      setMessage("Settlement transaction created successfully.");

      setFormData({
        amount: "",
        account: "",
      });

      setSettlementDate("");
      setMerchantId("");
    } catch (error) {
      setMessageType("error");
      setMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Could not create settlement transaction"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAgentSubmit = async (e) => {
    e.preventDefault();

    setAgentMessage("");

    if (!agentAmount || Number(agentAmount) <= 0) {
      setAgentMessageType("error");
      setAgentMessage("Please enter a valid amount.");
      return;
    }

    if (!agentId) {
      setAgentMessageType("error");
      setAgentMessage("Please select an agent.");
      return;
    }

    try {
      setAgentSaving(true);

      await api.post("/api/admin/agent-settlement-transactions", {
        amount: Number(agentAmount),
        agent_id: Number(agentId),
      });

      setAgentMessageType("success");
      setAgentMessage(
        "Agent settlement transaction created successfully."
      );

      setAgentAmount("");
      setAgentId("");
    } catch (error) {
      setAgentMessageType("error");
      setAgentMessage(
        error?.response?.data?.message ||
          error?.message ||
          "Could not create agent settlement transaction"
      );
    } finally {
      setAgentSaving(false);
    }
  };

  return (
    <div className="flex justify-center pt-8">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow">
        <h1 className="mb-4 text-3xl font-bold">
          Create Settlement
        </h1>

        <div className="mb-6 flex gap-2"></div>

        {tab === "merchant" && (
          <>
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

            <form
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <div>
                <label className="text-sm font-semibold">
                  Amount <span className="text-red-500">*</span>
                </label>

                <input
                  type="number"
                  placeholder="Amount"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      amount: e.target.value,
                    })
                  }
                  className="mt-2 h-12 w-full rounded-lg border px-4 outline-none focus:border-[#1E88FF]"
                />
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Settlement Date
                </label>

                <input
                  type="date"
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="mt-2 h-12 w-full rounded-lg border px-4 outline-none focus:border-[#1E88FF]"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional — leave blank to use today's date.
                </p>
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Select Merchant{" "}
                  <span className="text-red-500">*</span>
                </label>

                <select
                  value={merchantId}
                  onChange={(e) => {
                    setMerchantId(e.target.value);

                    setFormData({
                      ...formData,
                      account: "",
                    });
                  }}
                  disabled={loadingMerchants}
                  className="mt-2 h-12 w-full rounded-lg border bg-white px-4 outline-none focus:border-[#1E88FF]"
                >
                  <option value="">
                    {loadingMerchants
                      ? "Loading merchants..."
                      : "Select Merchant"}
                  </option>

                  {merchants.map((merchant) => (
                    <option
                      key={merchant.id}
                      value={merchant.id}
                    >
                      {merchant.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold">
                  Select Settlement Account{" "}
                  <span className="text-red-500">*</span>
                </label>

                <select
                  value={formData.account}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      account: e.target.value,
                    })
                  }
                  disabled={loadingAccounts || !merchantId}
                  className="mt-2 h-12 w-full rounded-lg border bg-white px-4 outline-none focus:border-[#1E88FF] disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  <option value="">
                    {!merchantId
                      ? "Select merchant first"
                      : loadingAccounts
                      ? "Loading accounts..."
                      : "Select Settlement Account"}
                  </option>

                  {merchantAccounts.map((account) => (
                    <option
                      key={account.id}
                      value={account.id}
                    >
                      {account.bank_name || "Bank"} -{" "}
                      {maskAccountNumber(
                        account.account_number
                      )}{" "}
                      -{" "}
                      {account.account_holder_name || ""}
                    </option>
                  ))}
                </select>

                {merchantId &&
                  !loadingAccounts &&
                  merchantAccounts.length === 0 && (
                    <p className="mt-2 text-xs font-medium text-red-600">
                      No active settlement accounts found
                      for this merchant.
                    </p>
                  )}
              </div>

              <div className="flex justify-center pt-4">
                <button
                  type="submit"
                  disabled={saving || loadingAccounts}
                  className="rounded-lg bg-[#1E88FF] px-8 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Settlement"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default CreateSettlement;