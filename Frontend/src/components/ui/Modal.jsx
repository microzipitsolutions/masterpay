import { X } from "lucide-react";

export default function Modal({ open, onClose, title, children, maxWidth = "max-w-lg", footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy-900/50 backdrop-blur-[2px] p-0 sm:p-6">
      <div className={`relative w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-t-card sm:rounded-card bg-white p-6 sm:p-7 shadow-pop`}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        )}
        {title && <h2 className="mb-5 pr-10 text-xl font-bold text-navy-900">{title}</h2>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
