import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import api from "../../api";
import BreakdownDrawer from "./BreakdownDrawer";

const TYPE_LABELS = {
  admins: "Admins",
  agents: "Agents",
  merchants: "Merchants",
  clients: "Clients",
  transactions: "Transactions",
  agent_accounts: "Bank Accounts",
};

const txnColumns = [
  { key: "transaction_id", label: "Txn ID" },
  { key: "amount", label: "Amount", format: "money" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Date", format: "date" },
];

function resultLabel(type, r) {
  if (type === "clients") return r.company_name;
  if (type === "transactions") return r.transaction_id || r.utr_number || `#${r.id}`;
  if (type === "agent_accounts") return `${r.account_number || r.upi_id} (${r.bank_name || "-"})`;
  return r.name || r.username;
}
function resultSubLabel(type, r) {
  if (type === "clients") return r.domain_name;
  if (type === "transactions") return `₹${Number(r.amount || 0).toLocaleString("en-IN")} · ${r.status}`;
  if (type === "agent_accounts") return `Agent #${r.agent_id}`;
  return r.username ? `@${r.username}` : null;
}

// Header search — finds users/usernames/client names/transaction identifiers/
// bank account identifiers across GET /api/superadmin/search, grouped by
// type. Clicking a user-type result (agent/merchant/agent) opens a
// breakdown of their related Pay-Ins; other types show their own fields
// inline (no dedicated per-entity detail page exists yet for every type).
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await api.get("/api/superadmin/search", { params: { q: q.trim() } });
        setResults(res.data?.results || null);
        setOpen(true);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [q]);

  const handleResultClick = (type, r) => {
    setOpen(false);
    if (type === "agents") {
      setDrawer({ title: `Pay-Ins for ${r.name}`, endpoint: "/api/transactions", filters: { agent_id: r.id }, columns: txnColumns });
    } else if (type === "merchants") {
      setDrawer({ title: `Pay-Ins for ${r.name}`, endpoint: "/api/transactions", filters: { merchant_id: r.id }, columns: txnColumns });
    } else if (type === "transactions") {
      setDrawer({ title: `Transaction ${r.transaction_id}`, endpoint: "/api/transactions", filters: { status: r.status }, columns: txnColumns });
    }
    // admins / clients / merchants / agent_accounts: no dedicated
    // drill-through target yet — the row itself already surfaces the key
    // identifying fields in the dropdown.
  };

  const hasResults = results && Object.values(results).some((arr) => arr.length > 0);

  return (
    <div className="relative w-full sm:w-72" ref={boxRef}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          placeholder="Search users, UTR, txn ID..."
          className="w-full h-9 rounded-lg border border-slate-300 pl-8 pr-8 text-sm outline-none focus:border-[#1E88FF]"
        />
        {q && (
          <button onClick={() => { setQ(""); setResults(null); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (loading || hasResults || q.trim().length >= 2) && (
        <div className="absolute z-50 mt-1 w-full sm:w-96 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-4 py-3 text-sm text-slate-400">Searching...</div>
          ) : !hasResults ? (
            <div className="px-4 py-3 text-sm text-slate-400">No results for "{q}"</div>
          ) : (
            Object.entries(results).map(([type, rows]) =>
              rows.length === 0 ? null : (
                <div key={type} className="border-b border-slate-100 last:border-0">
                  <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase text-slate-400">{TYPE_LABELS[type] || type}</div>
                  {rows.map((r) => (
                    <button
                      key={`${type}-${r.id}`}
                      onClick={() => handleResultClick(type, r)}
                      className="w-full flex flex-col items-start px-4 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm text-slate-800">{resultLabel(type, r)}</span>
                      {resultSubLabel(type, r) && <span className="text-xs text-slate-400">{resultSubLabel(type, r)}</span>}
                    </button>
                  ))}
                </div>
              ),
            )
          )}
        </div>
      )}

      <BreakdownDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        endpoint={drawer?.endpoint}
        filters={drawer?.filters}
        title={drawer?.title}
        columns={drawer?.columns || []}
      />
    </div>
  );
}

export default GlobalSearch;
