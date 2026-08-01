import { useEffect, useRef, useState } from "react";
import api from "../api";

// Alert when an SSPay merchant wallet drops below ₹2,50,000 — admin needs to top it
// up so auto-payouts don't start failing. Polls all of this admin's SSPay-enabled
// merchants (server caches the SSPay calls). Live mode only — sandbox wallets report
// a null balance and are skipped. Alert only; nothing is auto-disabled.
const LIMIT = 250000;
const POLL_MS = 60000;

function WalletBalanceAlert() {
  const [low, setLow] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  // merchant_ids that were already low on the previous poll — so we only beep on the
  // transition into low, not every minute while it stays low.
  const prevLowIdsRef = useRef(new Set());
  const audioCtxRef = useRef(null);

  const unlockAudio = async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
    } catch (error) {
      console.error("[WALLET] Unlock error:", error);
    }
  };

  // A low triple beep (700 Hz) so it's distinct from the payin/withdrawal/limit beeps.
  const playAlert = async () => {
    try {
      await unlockAudio();
      const audioCtx = audioCtxRef.current;
      const beepAt = (startOffset) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const t = audioCtx.currentTime + startOffset;
        oscillator.type = "square";
        oscillator.frequency.value = 700;
        gainNode.gain.setValueAtTime(0.3, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(t);
        oscillator.stop(t + 0.22);
      };
      beepAt(0);
      beepAt(0.3);
      beepAt(0.6);
    } catch (error) {
      console.error("[WALLET] Play error:", error);
    }
  };

  useEffect(() => {
    const handleUserGesture = () => unlockAudio();
    window.addEventListener("click", handleUserGesture);
    window.addEventListener("keydown", handleUserGesture);
    return () => {
      window.removeEventListener("click", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get("/api/withdrawal/sspay-balances");
        const rows = Array.isArray(res.data) ? res.data : [];

        const lowOnes = rows
          // live balance present (sandbox returns null) and below the limit
          .filter((r) => r.ok && r.balance != null && Number(r.balance) < LIMIT)
          .map((r) => ({
            merchant_id: r.merchant_id,
            merchant_name: r.merchant_name,
            balance: Number(r.balance),
          }));

        const prevIds = prevLowIdsRef.current;
        const newlyLow = lowOnes.some((r) => !prevIds.has(r.merchant_id));
        if (newlyLow) {
          await playAlert();
          setDismissed(false);
        }

        prevLowIdsRef.current = new Set(lowOnes.map((r) => r.merchant_id));
        setLow(lowOnes);
      } catch (error) {
        console.error("[WALLET] balance check error:", error);
      }
    };

    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  if (low.length === 0 || dismissed) return null;

  return (
    <div className="fixed left-1/2 top-6 z-[9999] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 rounded-2xl border-2 border-red-300 bg-white shadow-2xl">
      <div className="flex animate-pulse items-center justify-between rounded-t-2xl bg-red-600 px-5 py-3 text-white">
        <h3 className="text-base font-bold">⚠️ SSPay wallet below ₹2,50,000</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-lg font-bold"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
        <p className="text-slate-600">
          {low.length === 1
            ? "This merchant's SSPay wallet is low — top it up so auto-payouts don't fail."
            : `${low.length} merchant wallets are low — top them up so auto-payouts don't fail.`}
        </p>
        {low.map((r) => (
          <div
            key={r.merchant_id}
            className="rounded-lg border border-red-100 bg-red-50 px-3 py-2"
          >
            <p className="font-semibold text-slate-800">{r.merchant_name || "—"}</p>
            <p className="mt-1 text-xs">
              <span className="font-semibold text-red-700">Balance:</span> ₹
              {r.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WalletBalanceAlert;
