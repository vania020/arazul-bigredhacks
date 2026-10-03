import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { importLib } from "@/services/googleMaps";
import { useCity } from "@/context/CityContext";
import { planningCopy } from "@/i18n/planning";
import { useI18n } from "@/i18n";
import type { LocationValue } from "@/types/route";
import { Button } from "@/components/ui/button";

interface Props {
  id: string;
  kind: "origin" | "destination";
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  mapsReady: boolean;
  allowCurrent?: boolean;
  onPick?: (() => void) | undefined;
}

interface Suggestion {
  main: string;
  secondary: string;
  full: string;
  pred: google.maps.places.PlacePrediction;
}

export function LocationSearch({
  id,
  kind,
  value,
  onChange,
  mapsReady,
  allowCurrent,
  onPick,
}: Props) {
  const { t, lang } = useI18n();
  const { city } = useCity();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  const [devErr, setDevErr] = useState<string | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const typed = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const signature = JSON.stringify([value.label, value.latLng?.lat, value.latLng?.lng]);
  const expectedValue = useRef(signature);
  const invalidate = () => {
    generation.current++;
    clearTimeout(timer.current);
    setItems([]);
    setOpen(false);
    setActive(-1);
  };
  const change = (next: LocationValue) => {
    expectedValue.current = JSON.stringify([next.label, next.latLng?.lat, next.latLng?.lng]);
    onChange(next);
  };
  useLayoutEffect(() => {
    if (signature !== expectedValue.current) {
      generation.current++;
      typed.current = false;
      clearTimeout(timer.current);
      setItems([]);
      setOpen(false);
      setActive(-1);
      expectedValue.current = signature;
    }
  }, [signature]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Invalidate the current request generation; this ref is a counter, not a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!typed.current || !mapsReady) return;
    const q = value.label.trim();
    clearTimeout(timer.current);
    if (q.length < 3 || value.latLng) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const current = generation.current;
    const stale = () => cancelled || !mounted.current || current !== generation.current;
    timer.current = setTimeout(async () => {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          await importLib<google.maps.PlacesLibrary>("places");
        if (stale()) return;
        token.current ??= new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: token.current,
          includedRegionCodes: [city.countryCode],
          locationBias: { center: city.center, radius: city.searchRadiusM },
        });
        if (stale()) return;
        setItems(
          (suggestions ?? [])
            .map((s) => s.placePrediction)
            .filter(
              (prediction): prediction is google.maps.places.PlacePrediction => prediction != null,
            )
            .slice(0, 5)
            .map((prediction) => ({
              main: prediction.mainText?.toString() ?? prediction.text.toString(),
              secondary: prediction.secondaryText?.toString() ?? "",
              full: prediction.text.toString(),
              pred: prediction,
            })),
        );
        setOpen(true);
        setActive(-1);
        setDevErr(null);
      } catch (e: unknown) {
        if (!stale()) setDevErr(`Places: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [value, mapsReady, city]);

  const pick = async (s: Suggestion) => {
    invalidate();
    const current = generation.current;
    typed.current = false;
    change({ label: s.full });
    try {
      const place = s.pred.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      if (!mounted.current || current !== generation.current) return;
      token.current = null;
      const loc = place.location;
      change(
        loc ? { label: s.full, latLng: { lat: loc.lat(), lng: loc.lng() } } : { label: s.full },
      );
    } catch (e: unknown) {
      if (mounted.current && current === generation.current)
        setDevErr(`Places: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const useCurrent = () => {
    invalidate();
    typed.current = false;
    const current = generation.current;
    setNote(null);
    if (!navigator.geolocation) {
      setNote(t("locationDenied"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!mounted.current || current !== generation.current) return;
        change({
          label: t("currentLocation"),
          latLng: { lat: p.coords.latitude, lng: p.coords.longitude },
        });
      },
      () => {
        if (mounted.current && current === generation.current) setNote(t("locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const listId = `${id}-list`;
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {t(kind)}
      </label>
      <div className="flex items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <span
          aria-hidden
          className={`h-3 w-3 shrink-0 rounded-full ${kind === "origin" ? "border-[3px] border-primary bg-card" : "bg-deep"}`}
        />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={t(kind)}
          placeholder={t(kind)}
          value={value.label}
          autoComplete="off"
          onChange={(e) => {
            invalidate();
            typed.current = true;
            change({ label: e.target.value });
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            }
            if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(items[active]!);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {allowCurrent && (
          <Button
            type="button"
            variant="ghost"
            onClick={useCurrent}
            aria-label={t("useLocation")}
            title={t("useLocation")}
            className="h-10 shrink-0 rounded-lg bg-secondary px-2 text-primary hover:bg-secondary/80"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            <span className="hidden text-xs font-semibold min-[420px]:inline">
              {t("useLocation")}
            </span>
          </Button>
        )}
      </div>
      {onPick && (
        <button
          type="button"
          disabled={!mapsReady}
          onClick={() => {
            invalidate();
            typed.current = false;
            onPick();
          }}
          className="mt-1 min-h-9 text-xs font-semibold text-primary underline disabled:opacity-40"
          aria-label={`${planningCopy[lang].pick}: ${t(kind)}`}
        >
          {planningCopy[lang].pick}
        </button>
      )}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-float"
        >
          {items.map((s, i) => (
            <li key={s.full} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`block min-h-11 w-full px-4 py-2 text-left ${i === active ? "bg-secondary" : "hover:bg-secondary"}`}
              >
                <span className="block text-sm font-medium text-foreground">{s.main}</span>
                <span className="block truncate text-xs text-text-secondary">{s.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1 text-sm text-text-secondary">{note}</p>}
      {devErr && <p className="mt-1 font-mono text-xs text-muted-foreground">{devErr}</p>}
    </div>
  );
}
