import { useEffect, useMemo, useState } from "react";
import MerchantLayout from "../../layouts/MerchantLayout";
import api from "../../api";

function getStoredUser() {
  const rawUser = localStorage.getItem("rdpay_user");
  try {
    return rawUser ? JSON.parse(rawUser) : {};
  } catch {
    return { username: rawUser };
  }
}

function getViewAs() {
  try {
    return JSON.parse(localStorage.getItem("rdpay_view_as") || "{}");
  } catch {
    return {};
  }
}

function SettlementAccountsList() {
  const storedUser = getStoredUser();

  const [accounts, setAccounts] = useState([]);
  const [merchantId, setMerchantId] = useState("");
  const [merchantName, setMerchantName] = useState("");

  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);

  const [editForm, setEditForm] = useState({
    ifsc_code: "",
    account_number: "",
    account_holder_name: "",
    upi_id: "",
    max_payment_limit: "",
    min_transaction_amount: "",
    is_active: true,
  });

  const money = (value) => {
    return `₹ ${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      setMessage("");

      // When an admin uses "View As Merchant", rdpay_view_as holds { role, id }.
      // Use that ID directly instead of trying to match the admin's own username
      // against the merchants list (which always fails and throws "Merchant not found").
      const viewAs = getViewAs();
      const viewAsMerchantId =
        viewAs?.role === "merchant" && viewAs?.id ? String(viewAs.id) : null;

      let matchedMerchant = null;

      if (viewAsMerchantId) {
        // View-as mode: merchant ID is already known; fetch list only for the name.
        // api automatically attaches viewrole/viewid headers via its interceptor.
        const merchantsRes = await api.get("/api/merchants");
        const merchantsData = merchantsRes.data || [];
        matchedMerchant = merchantsData.find(
          (m) => String(m.id) === viewAsMerchantId
        ) || { id: viewAsMerchantId, name: `Merchant #${viewAsMerchantId}` };
      } else {
        // Normal merchant login: match by username or stored IDs.
        const currentUsername =
          storedUser?.username ||
          storedUser?.name ||
          localStorage.getItem("username");

        const merchantsRes = await api.get("/api/merchants");
        const merchantsData = merchantsRes.data || [];

        matchedMerchant = merchantsData.find(
          (m) =>
            m.username === currentUsername ||
            m.name === currentUsername ||
            String(m.id) === String(storedUser?.id) ||
            String(m.id) === String(storedUser?.merchantId) ||
            String(m.id) === String(localStorage.getItem("rdpay_merchant_id"))
        );

        if (!matchedMerchant) throw new Error("Merchant not found");
      }

      setMerchantId(matchedMerchant.id);
      setMerchantName(matchedMerchant.name);

      // api sends viewrole/viewid headers in view-as mode, so the backend scopes
      // settlement accounts to the viewed merchant automatically.
      const accountsRes = await api.get("/api/settlement-accounts");
      const accountsData = accountsRes.data || [];

      const merchantAccounts = accountsData.filter(
        (item) => String(item.merchant_id) === String(matchedMerchant.id)
      );

      setAccounts(merchantAccounts);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const statusMatch = !status || String(account.is_active) === status;

      const startMatch =
        !startDate || new Date(account.created_at) >= new Date(startDate);

      const endMatch =
        !endDate || new Date(account.created_at) <= new Date(endDate + "T23:59:59.999");

      return statusMatch && startMatch && endMatch;
    });
  }, [accounts, status, startDate, endDate]);

  const openEditModal = (account) => {
    setMessage("");
    setMessageType("");
    setEditingAccountId(account.id);

    setEditForm({
      ifsc_code: account.ifsc_code || "",
      account_number: account.account_number || "",
      account_holder_name: account.account_holder_name || "",
      upi_id: account.upi_id || "",
      max_payment_limit: account.max_payment_limit || "",
      min_transaction_amount: account.min_transaction_amount || "",
      is_active: Boolean(account.is_active),
    });

    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditingAccountId(null);

    setEditForm({
      ifsc_code: "",
      account_number: "",
      account_holder_name: "",
      upi_id: "",
      max_payment_limit: "",
      min_transaction_amount: "",
      is_active: true,
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;

    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditToggle = () => {
    setEditForm((prev) => ({
      ...prev,
      is_active: !prev.is_active,
    }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    if (!editingAccountId) return;

    setEditLoading(true);
    setMessage("");
    setMessageType("");

    try {
      if (
        !editForm.ifsc_code ||
        !editForm.account_number ||
        !editForm.account_holder_name ||
        !editForm.max_payment_limit ||
        !editForm.min_transaction_amount
      ) {
        throw new Error("Please fill all required fields.");
      }

      const payload = {
        merchant_id: merchantId,
        ifsc_code: editForm.ifsc_code,
        account_number: editForm.account_number,
        account_holder_name: editForm.account_holder_name,
        upi_id: editForm.upi_id,
        max_payment_limit: Number(editForm.max_payment_limit),
        min_transaction_amount: Number(editForm.min_transaction_amount),
        is_active: editForm.is_active,
      };

      const response = await api.put(
        `/api/settlement-accounts/${editingAccountId}`,
        payload
      );
      const data = response.data;

      setAccounts((prev) =>
        prev.map((item) =>
          item.id === editingAccountId
            ? {
                ...item,
                ...data,
              }
            : item
        )
      );

      setMessageType("success");
      setMessage("Settlement account updated successfully.");
      closeEditModal();
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this settlement account?"
    );

    if (!confirmDelete) return;

    try {
      const response = await api.delete(`/api/settlement-accounts/${id}`);
      const data = response.data;

      setAccounts((prev) => prev.filter((item) => item.id !== id));

      setMessageType("success");
      setMessage("Settlement account deleted successfully.");
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    }
  };

  return (
    <MerchantLayout>
      <div className="min-h-[calc(100vh-80px)] bg-white px-3 sm:px-8 py-4 sm:py-10">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-900">
              Settlement Accounts List
            </h1>

            {merchantName && (
              <p className="mt-2 text-sm text-gray-500">
                Showing accounts under{" "}
                <span className="font-semibold text-gray-800">
                  {merchantName}
                </span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Select Status
              </label>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-12 w-full sm:w-60 rounded-lg border border-slate-200 bg-white px-4 text-sm text-gray-600 outline-none focus:border-[#1E88FF]"
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Start Date
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-12 w-full sm:w-56 rounded-lg border border-slate-200 bg-white px-4 text-sm text-gray-600 outline-none focus:border-[#1E88FF]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                End Date
              </label>

              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-12 w-full sm:w-56 rounded-lg border border-slate-200 bg-white px-4 text-sm text-gray-600 outline-none focus:border-[#1E88FF]"
              />
            </div>
          </div>
        </div>

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

        <div className="overflow-x-auto rounded-card border border-slate-200 shadow-card bg-white">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-left">
                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  ID
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Bank Name
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  IFSC Code
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Account Number
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Account Holder Name
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  UPI ID
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Max Limit
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Min Amount
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Status
                </th>

                <th className="px-6 py-5 text-sm font-bold text-gray-900">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="px-6 py-8 text-sm text-gray-500">
                    Loading accounts...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan="10"
                    className="px-6 py-8 text-sm font-medium text-gray-500"
                  >
                    No settlement accounts found.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account, index) => (
                  <tr
                    key={account.id}
                    className="border-b border-gray-100 last:border-b-0"
                  >
                    <td className="px-6 py-6 text-sm text-gray-900">
                      {index + 1}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {account.bank_name || "-"}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {account.ifsc_code || "-"}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {account.account_number || "-"}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {account.account_holder_name || "-"}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {account.upi_id || "-"}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {money(account.max_payment_limit)}
                    </td>

                    <td className="px-6 py-6 text-sm text-gray-900">
                      {money(account.min_transaction_amount)}
                    </td>

                    <td className="px-6 py-6">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          account.is_active
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {account.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-6 py-6">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(account)}
                          className="rounded-lg bg-[#e8f3ff] px-4 py-2 text-sm font-medium text-[#0b2a5b]"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(account.id)}
                          className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
            <div className="w-full sm:max-w-[620px] rounded-t-2xl sm:rounded-2xl bg-white p-7 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-extrabold tracking-tight text-navy-900">
                  Edit Settlement Account
                </h2>

                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-full bg-gray-100 px-3 py-2 text-gray-600"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdate}>
                <div className="grid grid-cols-1 gap-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      IFSC Code <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="text"
                      name="ifsc_code"
                      value={editForm.ifsc_code}
                      onChange={handleEditChange}
                      className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Account Number <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="text"
                      name="account_number"
                      value={editForm.account_number}
                      onChange={handleEditChange}
                      className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Account Holder Name{" "}
                      <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="text"
                      name="account_holder_name"
                      value={editForm.account_holder_name}
                      onChange={handleEditChange}
                      className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      UPI ID
                    </label>

                    <input
                      type="text"
                      name="upi_id"
                      value={editForm.upi_id}
                      onChange={handleEditChange}
                      className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Max Payment Limit <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="number"
                      name="max_payment_limit"
                      value={editForm.max_payment_limit}
                      onChange={handleEditChange}
                      className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Min Transaction Amount{" "}
                      <span className="text-red-500">*</span>
                    </label>

                    <input
                      type="number"
                      name="min_transaction_amount"
                      value={editForm.min_transaction_amount}
                      onChange={handleEditChange}
                      className="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm outline-none focus:border-[#1E88FF]"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleEditToggle}
                      className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${
                        editForm.is_active ? "bg-[#1E88FF]" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
                          editForm.is_active ? "translate-x-7" : "translate-x-1"
                        }`}
                      />
                    </button>

                    <span className="text-sm font-medium text-gray-900">
                      Is Active
                    </span>
                  </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-gray-700"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={editLoading}
                    className="rounded-lg bg-[#1E88FF] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {editLoading ? "Updating..." : "Update Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MerchantLayout>
  );
}

export default SettlementAccountsList;