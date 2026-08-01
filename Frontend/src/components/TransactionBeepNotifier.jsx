import { useEffect, useRef, useState } from "react";
import api from "../api";

function formatDate(dateValue) {
  if (!dateValue) return "--";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function TransactionBeepNotifier() {
  const [payinNotification, setPayinNotification] = useState(null);
  const [withdrawalNotification, setWithdrawalNotification] = useState(null);

  const lastPayinIdRef = useRef(localStorage.getItem("rdpay_last_transaction_id"));
  const lastWithdrawalIdRef = useRef(localStorage.getItem("rdpay_last_withdrawal_id"));

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
      console.error("[BEEP] Unlock error:", error);
    }
  };

  // freq = pitch in Hz. Payins use 900, withdrawals use 600 so they sound distinct.
  const playBeep = async (freq = 900) => {
    try {
      await unlockAudio();
      const audioCtx = audioCtxRef.current;
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (error) {
      console.error("[BEEP] Play error:", error);
    }
  };

  useEffect(() => {
    const handleUserClick = () => {
      unlockAudio();
    };
    window.addEventListener("click", handleUserClick);
    window.addEventListener("keydown", handleUserClick);
    return () => {
      window.removeEventListener("click", handleUserClick);
      window.removeEventListener("keydown", handleUserClick);
    };
  }, []);

  // Payin polling
  useEffect(() => {
    const checkPayins = async () => {
      try {
        // Only the newest row is needed to detect a new payin — fetch 1, not the
        // whole table (was re-downloading thousands of rows every few seconds).
        const res = await api.get("/api/transactions?page=1&limit=1");
        const transactions = Array.isArray(res.data) ? res.data : [];
        if (transactions.length === 0) return;

        const latest = [...transactions].sort((a, b) => {
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        })[0];

        const latestId = String(latest.id);
        const oldId = lastPayinIdRef.current;

        if (!oldId) {
          lastPayinIdRef.current = latestId;
          localStorage.setItem("rdpay_last_transaction_id", latestId);
          return;
        }

        if (latestId !== oldId) {
          lastPayinIdRef.current = latestId;
          localStorage.setItem("rdpay_last_transaction_id", latestId);

          await playBeep(900);
          setPayinNotification({
            id: latest.id,
            amount: latest.amount,
            utr: latest.utr_number,
            status: latest.status,
            created_at: latest.created_at,
            merchant: latest.merchant_name || latest.merchant_name || "",
          });
          setTimeout(() => setPayinNotification(null), 6000);
        }
      } catch (error) {
        console.error("[BEEP] Payin check error:", error);
      }
    };

    checkPayins();
    const interval = setInterval(checkPayins, 5000);
    return () => clearInterval(interval);
  }, []);

  // Withdrawal polling
  useEffect(() => {
    const checkWithdrawals = async () => {
      try {
        const res = await api.get("/api/withdrawal/transactions?page=1&limit=1");
        const withdrawals = Array.isArray(res.data) ? res.data : [];
        if (withdrawals.length === 0) return;

        const latest = [...withdrawals].sort((a, b) => {
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        })[0];

        const latestId = String(latest.id);
        const oldId = lastWithdrawalIdRef.current;

        if (!oldId) {
          lastWithdrawalIdRef.current = latestId;
          localStorage.setItem("rdpay_last_withdrawal_id", latestId);
          return;
        }

        if (latestId !== oldId) {
          lastWithdrawalIdRef.current = latestId;
          localStorage.setItem("rdpay_last_withdrawal_id", latestId);

          await playBeep(600);
          setWithdrawalNotification({
            id: latest.id,
            amount: latest.amount,
            transaction_type: latest.transaction_type,
            destination:
              latest.transaction_type === "upi"
                ? latest.upi_id
                : `${latest.account_name || ""} · ${latest.account_number || ""}`,
            status: latest.status,
            created_at: latest.created_at,
            merchant: latest.merchant_name || "",
          });
          setTimeout(() => setWithdrawalNotification(null), 6000);
        }
      } catch (error) {
        console.error("[BEEP] Withdrawal check error:", error);
      }
    };

    checkWithdrawals();
    const interval = setInterval(checkWithdrawals, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {payinNotification && (
        <div className="fixed right-3 top-3 sm:right-6 sm:top-6 z-[9999] w-[calc(100%-1.5rem)] max-w-[360px] rounded-2xl border border-blue-200 bg-white shadow-2xl">
          <div className="rounded-t-2xl bg-blue-600 px-5 py-3 text-white flex items-center justify-between">
            <h3 className="text-base font-bold">New Payin Received</h3>
            <button onClick={() => setPayinNotification(null)} className="text-lg font-bold">×</button>
          </div>
          <div className="space-y-1 px-5 py-4 text-sm text-slate-700">
            {payinNotification.merchant && (
              <p><span className="font-semibold">Merchant:</span> {payinNotification.merchant}</p>
            )}
            <p>
              <span className="font-semibold">Amount:</span> ₹
              {Number(payinNotification.amount || 0).toLocaleString("en-IN")}
            </p>
            <p><span className="font-semibold">UTR:</span> {payinNotification.utr || "-"}</p>
            <p><span className="font-semibold">Status:</span> {payinNotification.status || "-"}</p>
            <p><span className="font-semibold">Created:</span> {formatDate(payinNotification.created_at)}</p>
          </div>
        </div>
      )}

      {withdrawalNotification && (
        <div
          className={`fixed right-3 sm:right-6 z-[9999] w-[calc(100%-1.5rem)] max-w-[360px] rounded-2xl border border-purple-200 bg-white shadow-2xl ${
            payinNotification ? "top-[260px] sm:top-[270px]" : "top-3 sm:top-6"
          }`}
        >
          <div className="rounded-t-2xl bg-purple-600 px-5 py-3 text-white flex items-center justify-between">
            <h3 className="text-base font-bold">New Withdrawal Request</h3>
            <button onClick={() => setWithdrawalNotification(null)} className="text-lg font-bold">×</button>
          </div>
          <div className="space-y-1 px-5 py-4 text-sm text-slate-700">
            {withdrawalNotification.merchant && (
              <p><span className="font-semibold">Merchant:</span> {withdrawalNotification.merchant}</p>
            )}
            <p>
              <span className="font-semibold">Amount:</span> ₹
              {Number(withdrawalNotification.amount || 0).toLocaleString("en-IN")}
            </p>
            <p>
              <span className="font-semibold">Type:</span>{" "}
              <span className="uppercase">{withdrawalNotification.transaction_type}</span>
            </p>
            <p>
              <span className="font-semibold">To:</span>{" "}
              <span className="font-mono text-xs">{withdrawalNotification.destination}</span>
            </p>
            <p><span className="font-semibold">Status:</span> {withdrawalNotification.status || "-"}</p>
            <p><span className="font-semibold">Created:</span> {formatDate(withdrawalNotification.created_at)}</p>
          </div>
        </div>
      )}
    </>
  );
}

export default TransactionBeepNotifier;
