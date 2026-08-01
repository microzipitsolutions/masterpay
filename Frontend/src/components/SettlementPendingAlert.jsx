import { useEffect, useRef, useState } from "react";
import api from "../api";

// Alerts a merchant when they have settlement transactions waiting for their
// approval. A pending settlement is one that has a UTR (so it's actionable) and
// whose status is not yet Approved/Rejected — exactly the rows that show
// Approve/Reject buttons on the Settlement Transactions page.
const POLL_MS = 5000;
const SETTLEMENT_PAGE = "/merchant/settlement-transactions";

function isPending(row) {
  const hasUtr = String(row.utr_number || "").trim() !== "";
  const status = String(row.transaction_status || "Pending").toLowerCase();
  const settled = status === "approved" || status === "rejected";
  return hasUtr && !settled;
}

function SettlementPendingAlert() {
  const [pending, setPending] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  // Ids pending on the previous poll — so we only beep when a *new* settlement
  // arrives, not every 5s while the same ones sit unapproved.
  const prevPendingIdsRef = useRef(new Set());
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
      console.error("[SETTLEMENT] Unlock error:", error);
    }
  };

  // 750 Hz so it's distinct from payin (900) / withdrawal (600) beeps.
  const playAlert = async () => {
    try {
      await unlockAudio();
      const audioCtx = audioCtxRef.current;
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 750;
      gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (error) {
      console.error("[SETTLEMENT] Play error:", error);
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
        const res = await api.get("/api/settlement-transactions");
        const rows = Array.isArray(res.data) ? res.data : [];
        const pendingRows = rows.filter(isPending);

        const prevIds = prevPendingIdsRef.current;
        const newlyPending = pendingRows.some((r) => !prevIds.has(r.id));

        if (newlyPending) {
          await playAlert();
          setDismissed(false); // a fresh settlement arrived — re-show even if closed
        }

        prevPendingIdsRef.current = new Set(pendingRows.map((r) => r.id));
        setPending(pendingRows);
      } catch (error) {
        console.error("[SETTLEMENT] Pending check error:", error);
      }
    };

    check();
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  if (pending.length === 0 || dismissed) return null;

  const onPage = window.location.pathname === SETTLEMENT_PAGE;

  return (
    <div className="fixed left-1/2 top-6 z-[9999] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 rounded-2xl border-2 border-amber-300 bg-white shadow-2xl">
      <div className="flex items-center justify-between rounded-t-2xl bg-amber-500 px-5 py-3 text-white">
        <h3 className="text-base font-bold">⏳ Settlement Approval Pending</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-lg font-bold"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
        <p>
          You have{" "}
          <span className="font-bold text-amber-700">{pending.length}</span>{" "}
          settlement{pending.length === 1 ? "" : "s"} waiting for your approval.
        </p>
        {!onPage && (
          <a
            href={SETTLEMENT_PAGE}
            className="block w-full rounded-lg bg-amber-500 px-4 py-2.5 text-center font-semibold text-white hover:bg-amber-600"
          >
            Review &amp; Approve
          </a>
        )}
      </div>
    </div>
  );
}

export default SettlementPendingAlert;
