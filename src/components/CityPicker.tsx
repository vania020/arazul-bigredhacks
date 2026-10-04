import { useI18n } from "@/i18n";
import { CITIES, type CityConfig } from "@/config/cities";

/** Compact city row: pill select + "Data & coverage", with any data-status notes below. */
export function CityPicker({
  city,
  onChange,
  onDetails,
  notes,
}: {
  city: CityConfig;
  onChange: (id: string) => void;
  onDetails: () => void;
  notes: { text: string; status?: boolean }[];
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor="city" className="sr-only">
          {t("city")}
        </label>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-primary"
            aria-hidden
          >
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
          <select
            id="city"
            value={city.id}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-full appearance-none rounded-full border bg-card pl-9 pr-9 text-sm font-semibold text-deep shadow-soft"
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <button
          type="button"
          onClick={onDetails}
          className="min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold text-primary hover:bg-secondary"
        >
          {t("sourceDetails")}
        </button>
      </div>
      {notes.map((n) => (
        <p
          key={n.text}
          role={n.status ? "status" : undefined}
          className="rounded-2xl bg-muted px-3 py-2 text-xs leading-relaxed text-text-secondary"
        >
          {n.text}
        </p>
      ))}
    </div>
  );
}
