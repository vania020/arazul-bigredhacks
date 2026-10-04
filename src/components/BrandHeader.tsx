import { useI18n, type Lang } from "@/i18n";

export function ArazulLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="14" className="fill-deep" />
      {/* wing */}
      <path d="M10 30c6-14 17-20 30-20-6 4-10 9-12 15-5-2-11 0-18 5z" className="fill-primary" />
      <path d="M18 27c5-6 11-9 18-10-4 3-6 6-7 10-3-1-7-1-11 0z" className="fill-sky" />
      {/* route */}
      <path
        d="M12 38c6-2 12-5 16-11"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="0.1 4.4"
        className="stroke-sky-soft"
      />
      {/* pin */}
      <circle cx="31" cy="25" r="3.2" className="fill-sky-soft" />
    </svg>
  );
}

/**
 * Compact brand bar: mark + wordmark, language switch and an optional help button.
 * `tagline` adds the one-line product description (inline in the desktop top bar).
 */
export function BrandHeader({
  onHelp,
  helpLabel,
  tagline,
  actions,
}: {
  actions?: React.ReactNode;
  onHelp?: () => void;
  helpLabel?: string;
  /** "inline" beside the wordmark (desktop top bar) or "below" it. */
  tagline?: "inline" | "below";
}) {
  const { lang, setLang, t } = useI18n();
  return (
    <header>
      <div className="flex items-center gap-2">
        <ArazulLogo className="h-8 w-8 shrink-0 drop-shadow-sm min-[380px]:h-9 min-[380px]:w-9" />
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <p className="font-display text-base font-extrabold leading-none tracking-[0.14em] text-deep min-[380px]:text-lg min-[380px]:tracking-[0.18em]">
            ARAZUL
          </p>
          {tagline === "inline" && (
            <p className="hidden truncate text-sm text-text-secondary md:block">{t("tagline")}</p>
          )}
        </div>
        <div
          role="group"
          aria-label="Language"
          className="flex rounded-full border bg-card p-0.5 text-[11px] font-bold shadow-soft"
        >
          {(["en", "pt", "es"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`h-8 min-w-7 rounded-full px-1 uppercase min-[380px]:min-w-8 min-[380px]:px-1.5 transition-colors ${lang === l ? "bg-deep text-primary-foreground" : "text-text-secondary hover:text-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {actions}
        {onHelp && (
          <button
            type="button"
            onClick={onHelp}
            aria-label={helpLabel}
            title={helpLabel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-card font-display text-base font-extrabold text-deep shadow-soft hover:bg-secondary"
          >
            ?
          </button>
        )}
      </div>
      {tagline === "below" && (
        <p className="mt-2 text-xs leading-snug text-text-secondary">{t("tagline")}</p>
      )}
    </header>
  );
}
