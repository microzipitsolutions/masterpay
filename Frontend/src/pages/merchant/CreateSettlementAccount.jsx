import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MerchantLayout from "../../layouts/MerchantLayout";
import { API_BASE_API_URL } from "../../config/apiConfig";

const API_BASE_URL = API_BASE_API_URL;
const IFSC_API_URL = "https://ifsc.razorpay.com";

function getStoredUser() {
  const rawUser = localStorage.getItem("rdpay_user");

  try {
    return rawUser ? JSON.parse(rawUser) : {};
  } catch {
    return { username: rawUser };
  }
}

function CreateSettlementAccount() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();

  const [merchantId, setMerchantId] = useState("");
  const [findingMerchant, setFindingMerchant] = useState(true);
  const [loading, setLoading] = useState(false);
  const [validatingIfsc, setValidatingIfsc] = useState(false);
  const [ifscValid, setIfscValid] = useState(false);
  const [bankName, setBankName] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const [formData, setFormData] = useState({
    account_number: "",
    ifsc_code: "",
    account_holder_name: "",
    upi_id: "",
    max_payment_limit: "",
    min_transaction_amount: "0",
    is_active: true,
  });

  const token = localStorage.getItem("rdpay_token");

  useEffect(() => {
    const findLoggedInMerchant = async () => {
      try {
        setFindingMerchant(true);
        setMessage("");

        const viewAs = JSON.parse(
  localStorage.getItem("rdpay_view_as") || "{}"
);

const directMerchantId =
  viewAs?.id ||
  viewAs?.merchant_id ||
  viewAs?.merchantId ||
  storedUser?.merchantId ||
  storedUser?.merchant_id ||
  storedUser?.id ||
  localStorage.getItem("merchantId") ||
  localStorage.getItem("rdpay_merchant_id");


      if (
  directMerchantId &&
  (
    viewAs?.role === "merchant" ||
    storedUser?.role === "merchant" ||
    storedUser?.role === "Merchant" ||
    storedUser?.user_type === "merchant"
  )
) {
          setMerchantId(directMerchantId);
          localStorage.setItem("rdpay_merchant_id", directMerchantId);
          return;
        }

        const currentUsername =
          storedUser?.username ||
          storedUser?.name ||
          localStorage.getItem("username");

        const response = await fetch(`${API_BASE_URL}/merchants`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const merchants = await response.json();

        if (!response.ok) {
          throw new Error(merchants.message || "Could not fetch merchant");
        }

        const matchedMerchant = merchants.find(
          (merchant) =>
            merchant.username === currentUsername ||
            merchant.name === currentUsername ||
            String(merchant.id) === String(directMerchantId)
        );

        if (!matchedMerchant) {
          setMessageType("error");
          setMessage("Merchant not found. Please login again.");
          return;
        }

        setMerchantId(matchedMerchant.id);
        localStorage.setItem("rdpay_merchant_id", matchedMerchant.id);
      } catch (error) {
        setMessageType("error");
        setMessage(error.message || "Could not find merchant.");
      } finally {
        setFindingMerchant(false);
      }
    };

    findLoggedInMerchant();
  }, []);

  const validateIfscCode = async (ifscCode) => {
    const cleanIfsc = ifscCode.trim().toUpperCase();

    setIfscValid(false);
    setBankName("");

    if (!cleanIfsc) return;

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      setMessageType("error");
      setMessage("Invalid IFSC format.");
      return;
    }

    try {
      setValidatingIfsc(true);
      setMessage("");

      const response = await fetch(`${IFSC_API_URL}/${cleanIfsc}`);
      const data = await response.json();

      if (!response.ok || !data?.BANK) {
        throw new Error("Invalid IFSC code. Please enter a valid IFSC.");
      }

      setIfscValid(true);
      setBankName(data.BANK);

      setMessageType("success");
      setMessage(`Valid IFSC. Bank detected: ${data.BANK}`);
    } catch (error) {
      setIfscValid(false);
      setBankName("");
      setMessageType("error");
      setMessage(error.message || "Invalid IFSC code.");
    } finally {
      setValidatingIfsc(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "ifsc_code") {
      setFormData((prev) => ({
        ...prev,
        ifsc_code: value.toUpperCase(),
      }));

      setIfscValid(false);
      setBankName("");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleIfscBlur = () => {
    validateIfscCode(formData.ifsc_code);
  };

  const handleToggle = () => {
    setFormData((prev) => ({
      ...prev,
      is_active: !prev.is_active,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!merchantId) {
      setMessageType("error");
      setMessage("Merchant ID not found. Please login again.");
      return;
    }

    if (
      !formData.account_number.trim() ||
      !formData.ifsc_code.trim() ||
      !formData.account_holder_name.trim() ||
      !formData.upi_id.trim() ||
      !formData.max_payment_limit ||
      !formData.min_transaction_amount
    ) {
      setMessageType("error");
      setMessage("Please fill all required fields.");
      return;
    }

    if (!ifscValid || !bankName) {
      setMessageType("error");
      setMessage("Please enter a valid IFSC code first.");
      return;
    }

    if (Number(formData.max_payment_limit) <= 0) {
      setMessageType("error");
      setMessage("Max payment limit must be greater than 0.");
      return;
    }

    if (Number(formData.min_transaction_amount) < 0) {
      setMessageType("error");
      setMessage("Min transaction amount cannot be negative.");
      return;
    }

    if (
      Number(formData.min_transaction_amount) >
      Number(formData.max_payment_limit)
    ) {
      setMessageType("error");
      setMessage("Min transaction amount cannot be greater than max limit.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_BASE_URL}/settlement-accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          merchant_id: Number(merchantId),
          bank_name: bankName,
          account_number: formData.account_number.trim(),
          ifsc_code: formData.ifsc_code.trim().toUpperCase(),
          account_holder_name: formData.account_holder_name.trim(),
          upi_id: formData.upi_id.trim(),
          max_payment_limit: Number(formData.max_payment_limit),
          min_transaction_amount: Number(formData.min_transaction_amount),
          is_active: formData.is_active,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not create settlement account");
      }

      setMessageType("success");
      setMessage("Settlement account created successfully.");

      setFormData({
        account_number: "",
        ifsc_code: "",
        account_holder_name: "",
        upi_id: "",
        max_payment_limit: "",
        min_transaction_amount: "0",
        is_active: true,
      });

      setIfscValid(false);
      setBankName("");

      setTimeout(() => {
        navigate("/merchant/settlement-accounts");
      }, 700);
    } catch (error) {
      setMessageType("error");
      setMessage(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MerchantLayout>
      <div className="min-h-[calc(100vh-80px)] bg-[#f5f7fb] px-3 sm:px-6 py-4 sm:py-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-gray-100 bg-white p-4 sm:p-8 shadow-sm">
          <h1 className="mb-6 sm:mb-8 text-2xl sm:text-3xl font-bold text-gray-900">
            Account Form
          </h1>

          {message && (
            <div
              className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
                messageType === "success"
                  ? "bg-green-50 text-green-700"
                  : messageType === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-[#eef3fb] text-[#0b2a5b]"
              }`}
            >
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Account Number <span className="text-red-500">*</span>
              </label>

              <input
                name="account_number"
                value={formData.account_number}
                onChange={handleChange}
                placeholder="Account Number"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                IFSC Code <span className="text-red-500">*</span>
              </label>

              <input
                name="ifsc_code"
                value={formData.ifsc_code}
                onChange={handleChange}
                onBlur={handleIfscBlur}
                placeholder="IFSC Code"
                className={`w-full rounded-lg border px-4 py-3 text-sm uppercase outline-none focus:border-[#2B7DE9] ${
                  formData.ifsc_code && ifscValid
                    ? "border-green-400"
                    : formData.ifsc_code && !ifscValid
                    ? "border-gray-300"
                    : "border-gray-300"
                }`}
              />

              {validatingIfsc && (
                <p className="mt-2 text-xs font-medium text-[#2B7DE9]">
                  Checking IFSC...
                </p>
              )}

              {ifscValid && bankName && (
                <p className="mt-2 text-xs font-semibold text-green-700">
                  Bank Name: {bankName}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Account Holder Name <span className="text-red-500">*</span>
              </label>

              <input
                name="account_holder_name"
                value={formData.account_holder_name}
                onChange={handleChange}
                placeholder="Account Holder Name"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                UPI ID <span className="text-red-500">*</span>
              </label>

              <input
                name="upi_id"
                value={formData.upi_id}
                onChange={handleChange}
                placeholder="UPI ID"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Max Payment Limit <span className="text-red-500">*</span>
              </label>

              <input
                type="number"
                name="max_payment_limit"
                value={formData.max_payment_limit}
                onChange={handleChange}
                placeholder="Max Payment Limit"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                Min Transaction Amount <span className="text-red-500">*</span>
              </label>

              <input
                type="number"
                name="min_transaction_amount"
                value={formData.min_transaction_amount}
                onChange={handleChange}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#2B7DE9]"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggle}
                className={`relative h-7 w-14 rounded-full transition ${
                  formData.is_active ? "bg-[#2B7DE9]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                    formData.is_active ? "left-8" : "left-1"
                  }`}
                />
              </button>

              <span className="text-sm font-medium text-gray-800">
                Is Active
              </span>
            </div>

            <div className="flex justify-center pt-5">
              <button
                type="submit"
                disabled={loading || findingMerchant || validatingIfsc}
                className="rounded-lg bg-[#2B7DE9] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#0b2a5b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {findingMerchant
                  ? "Finding Merchant..."
                  : validatingIfsc
                  ? "Checking IFSC..."
                  : loading
                  ? "Saving..."
                  : "Save Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MerchantLayout>
  );
}

export default CreateSettlementAccount;