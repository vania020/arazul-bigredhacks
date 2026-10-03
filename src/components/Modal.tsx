import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/i18n";

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 sm:items-center sm:p-6" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="fade-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-card p-6 shadow-float outline-none sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-extrabold text-deep">{title}</h2>
          <button onClick={onClose} aria-label={t("close")} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
