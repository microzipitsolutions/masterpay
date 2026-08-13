import { useEffect, useRef, useState } from "react";
import api from "../api";

// Alert when ₹2,00,000 is currently SITTING in a bank account — i.e. "left in bank"
// = today's deposits (used_amount) minus what's been withdrawn today. Using the
// balance-still-in-account (not gross used) means the alert clears once the agent
// withdraws the money, instead of staying triggered all day. A new payin raises
// "left in bank" and can re-trigger it. Alert only — nothing is auto-disabled.
const LIMIT = 200000;
// 20s, not 5s: this banner is mounted on every page for every user, so its poll
// rate multiplies across the whole logged-in user base, and an account that has
// already crossed the limit stays crossed.
//
// Deliberately not paused on a hidden tab (unlike the list screens): the point
// of the audible alert is to reach someone who is looking at something else.
const POLL_MS = 20000;

function collectedOf(account) {
  const used = Number(account.used_amount) || 0;
  const withdrawn = Number(account.withdrawn_today) || 0;
  return Math.max(used - withdrawn, 0);
}

function AccountLimitAlert() {
  const [overLimit, setOverLimit] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  // Account ids that were already over the limit on the previous poll — used so we
  // only beep on the *transition* into over-limit, not every 5s while it stays there.
  const prevOverIdsRef = useRef(new Set());
  const audioCtxRef = useRef(null);

  const unlockAudio = async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
    } catch (error) {
      console.error("[LIMIT] Unlock error:", error);
    }
  };

  // A sharp double beep (1300 Hz) so the limit alert is distinct from the
  // payin (900) / withdrawal (600) beeps.
  const playAlert = async () => {
    try {
      await unlockAudio();
      const audioCtx = audioCtxRef.current;
      const beepAt = (startOffset) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const t = audioCtx.currentTime + startOffset;
        oscillator.type = "square";
        oscillator.frequency.value = 1300;
        gainNode.gain.setValueAtTime(0.3, t);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(t);
        oscillator.stop(t + 0.25);
      };
      beepAt(0);
      beepAt(0.35);
    } catch (error) {
      console.error("[LIMIT] Play error:", error);
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
        const res = await api.get("/api/tracking/balance");
        const accounts = Array.isArray(res.data?.agentAccounts)
          ? res.data.agentAccounts
          : [];

        const over = accounts
          // Only alert for accounts still switched ON — an already-OFF account
          // that's over the limit has already been handled.
          .filter((a) => a.is_active)
          .map((a) => ({
            id: a.id,
            bank_name: a.bank_name,
            account_number: a.account_number,
            upi_id: a.upi_id,
            collected: collectedOf(a),
          }))
          .filter((a) => a.collected >= LIMIT);

        const prevIds = prevOverIdsRef.current;
        const newlyOver = over.some((a) => !prevIds.has(a.id));

        if (newlyOver) {
          await playAlert();
          setDismissed(false); // a fresh account crossed — re-show even if previously closed
        }

        prevOverIdsRef.current = new Set(over.map((a) => a.id));
        setOverLimit(over);
      } catch (error) {
        console.error("[LIMIT] Account check error:", error);
      }
    };

    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  if (overLimit.length === 0 || dismissed) return null;

  return (
    <div className="fixed left-1/2 top-6 z-[9999] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 rounded-2xl border-2 border-red-300 bg-white shadow-2xl">
      <div className="flex animate-pulse items-center justify-between rounded-t-2xl bg-red-600 px-5 py-3 text-white">
        <h3 className="text-base font-bold">⚠️ ₹2,00,000 Sitting in Account</h3>
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
          {overLimit.length === 1
            ? "₹2,00,000+ is sitting in this account — withdraw the funds (the alert clears once you do)."
            : `${overLimit.length} accounts have ₹2,00,000+ sitting in them — withdraw the funds (alert clears once you do).`}
        </p>
        {overLimit.map((a) => (
          <div
            key={a.id}
            className="rounded-lg border border-red-100 bg-red-50 px-3 py-2"
          >
            <p className="font-semibold text-slate-800">{a.bank_name || "—"}</p>
            <p className="font-mono text-xs text-slate-600">
              {a.account_number || a.upi_id || "—"}
            </p>
            <p className="mt-1 text-xs">
              <span className="font-semibold text-red-700">Left in bank:</span> ₹
              {Number(a.collected).toLocaleString("en-IN")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AccountLimitAlert;
