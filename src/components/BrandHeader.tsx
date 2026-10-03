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

export function BrandHeader() {
  const { lang, setLang, t } = useI18n();
  return (
    <header className="flex items-center gap-3">
      <ArazulLogo />
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl font-extrabold tracking-[0.12em] text-deep">ARAZUL</p>
        <p className="text-xs leading-snug text-text-secondary sm:text-sm">{t("tagline")}</p>
      </div>
      <div
        role="group"
        aria-label="Language"
        className="flex rounded-full border bg-card p-0.5 text-xs font-semibold"
      >
        {(["en", "pt", "es"] as Lang[]).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={`h-9 min-w-9 rounded-full px-2 uppercase transition-colors ${lang === l ? "bg-deep text-primary-foreground" : "text-text-secondary hover:text-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </header>
  );
}
