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
  /** "inline": a row inside a shared trip card (visually hidden label, icon actions). */
  variant?: "field" | "inline";
  showPickLabel?: boolean;
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
  variant = "field",
  showPickLabel = false,
}: Props) {
  const inline = variant === "inline";
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
  const pickButton = onPick && (
    <button
      type="button"
      disabled={!mapsReady}
      onClick={() => {
        invalidate();
        typed.current = false;
        onPick();
      }}
      className={
        inline && !showPickLabel
          ? "grid h-9 w-9 shrink-0 place-items-center rounded-full text-text-secondary hover:bg-secondary hover:text-primary disabled:opacity-40"
          : "ml-10 min-h-7 leading-4 text-xs font-semibold text-primary underline disabled:opacity-40"
      }
      aria-label={`${planningCopy[lang].pick}: ${t(kind)}`}
      title={planningCopy[lang].pick}
    >
      {inline && !showPickLabel ? (
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      ) : (
        planningCopy[lang].pick
      )}
    </button>
  );
  return (
    <div className="relative">
      <label
        htmlFor={id}
        className={inline ? "sr-only" : "mb-1.5 block text-sm font-semibold text-foreground"}
      >
        {t(kind)}
      </label>
      <div
        className={
          inline
            ? "flex items-center gap-2 rounded-xl px-2 focus-within:bg-secondary/60"
            : "flex items-center gap-2 rounded-xl border bg-background px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
        }
      >
        {inline && kind === "destination" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-pin" aria-hidden>
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
        ) : (
          <span
            aria-hidden
            className={`shrink-0 rounded-full ${kind === "origin" ? (inline ? "mx-[3px] h-3.5 w-3.5 border-[3.5px] border-primary bg-card shadow-[0_0_0_3px_var(--sky-soft)]" : "h-3 w-3 border-[3px] border-primary bg-card") : "h-3 w-3 bg-deep"}`}
          />
        )}
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={t(kind)}
          placeholder={t(kind === "origin" ? "chooseStart" : "chooseDestination")}
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
          className={`${showPickLabel ? "h-10" : "h-12"} min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${inline ? "text-[15px] font-medium text-foreground" : "text-[15px]"}`}
        />
        {inline && !showPickLabel && pickButton}
        {allowCurrent && (
          <Button
            type="button"
            variant="ghost"
            onClick={useCurrent}
            aria-label={t("useLocation")}
            title={t("useLocation")}
            className={
              inline
                ? "h-9 w-9 shrink-0 rounded-full p-0 text-primary hover:bg-secondary"
                : "h-10 shrink-0 rounded-lg bg-secondary px-2 text-primary hover:bg-secondary/80"
            }
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
            <span
              className={inline ? "sr-only" : "hidden text-xs font-semibold min-[420px]:inline"}
            >
              {t("useLocation")}
            </span>
          </Button>
        )}
      </div>
      {(!inline || showPickLabel) && pickButton}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-2xl border bg-popover shadow-float"
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
      {note && <p className={`mt-1 text-sm text-text-secondary ${inline ? "px-2" : ""}`}>{note}</p>}
      {devErr && <p className="mt-1 font-mono text-xs text-muted-foreground">{devErr}</p>}
    </div>
  );
}
