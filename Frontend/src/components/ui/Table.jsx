// Shared table "chrome" — sticky header, consistent row spacing/hover, card
// wrapper. Pages keep their own column definitions/data/logic; this only
// supplies markup + styling so every list screen in the app looks the same.

export function TableContainer({ children, className = "" }) {
  return (
    <div className={`overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function Table({ children, className = "", minWidth = "700px" }) {
  return (
    <table className={`w-full text-sm ${className}`} style={{ minWidth }}>
      {children}
    </table>
  );
}

export function Thead({ children }) {
  return (
    <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
      <tr className="border-b border-slate-200">{children}</tr>
    </thead>
  );
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

export function Th({ children, align = "left", className = "" }) {
  return (
    <th
      className={`px-5 py-3.5 text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap ${ALIGN[align] || ALIGN.left} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className = "" }) {
  return (
    <td className={`px-5 py-4 text-sm text-slate-700 ${ALIGN[align] || ALIGN.left} ${className}`}>
      {children}
    </td>
  );
}

export function Tr({ children, className = "", onClick }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50/80 ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableEmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-14 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}
