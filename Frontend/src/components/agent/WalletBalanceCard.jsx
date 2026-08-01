import { useEffect, useState } from "react";
import { Wallet, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../../api";

const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Per-agent wallet balance. Lives only inside the Top Up Funds section
// (TopUpWallet.jsx / TopUpHistory.jsx) — no "Wallet Balance" card is shown on
// the main Agent Dashboard or the Accounts page by design; those instead
// show "Settlement Remaining"/"Settlement Amount" derived from this same
// balance. `hideLinks` suppresses the self-referential "Top Up Funds"/
// "History" button when the card is already mounted on that respective page.
function WalletBalanceCard({ hideLinks } = {}) {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/api/agent/wallet");
      setBalance(Number(res.data?.available_balance || 0));
    } catch (e) {
      setError(e?.response?.data?.message || "Could not load wallet balance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="bg-white border border-[#d9e0ea] rounded-xl px-5 py-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[#eef3fb] text-[#2B7DE9] flex items-center justify-center">
          <Wallet size={22} />
        </div>
        <div>
          <p className="text-[13px] text-[#64748b] font-medium">Available Wallet Balance</p>
          {loading ? (
            <p className="text-lg text-slate-400">Loading...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <p className="text-2xl font-extrabold text-black">{money(balance)}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={load}
          className="w-9 h-9 rounded-full bg-[#f1f5f9] text-[#475569] flex items-center justify-center hover:bg-[#e2e8f0]"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
        {!hideLinks && (
          <>
            <Link
              to="/agent/wallet/top-up"
              className="rounded-lg bg-[#2B7DE9] text-white font-semibold px-4 py-2.5 text-sm hover:bg-[#0b2a5b]"
            >
              Top Up Funds
            </Link>
            <Link
              to="/agent/wallet/history"
              className="rounded-lg border border-slate-300 text-slate-700 font-semibold px-4 py-2.5 text-sm hover:bg-slate-50"
            >
              History
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default WalletBalanceCard;
