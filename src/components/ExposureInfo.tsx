import { useState } from "react";
import { useI18n } from "@/i18n";

export function ExposureInfo() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={t("legendInfo")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="grid h-7 w-7 place-items-center rounded-full text-text-secondary hover:bg-muted"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-8 right-0 z-30 w-60 rounded-xl bg-navy p-3 text-xs leading-relaxed text-primary-foreground shadow-float"
        >
          {t("legendInfo")}
        </span>
      )}
    </span>
  );
}
