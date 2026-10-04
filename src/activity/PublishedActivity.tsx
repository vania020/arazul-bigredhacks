import type { usePublishedActivity } from "./usePublishedActivity";
import { activityBubbles } from "./areas";
import { formatSourceTime } from "./recent-bubbles";
export const activityCopy = {
  en: {
    title: "Latest published activity",
    off: "Off",
    on: "On",
    refresh: "Check now",
    loading: "Checking official source…",
    none: "No verified recent feed for this city.",
    checked: "Source checked",
    latest: "Latest source event",
    window: "Published window",
    cadence: "Source cadence",
    unknown: "Not available",
    privacy: "Approximate 250 m cells · minimum 2 records. Independent of historical route scores.",
    details: "Source & timing",
    empty: "No groups of 2+ records in this published window.",
    calls: "Unverified dispatch calls · not confirmed crimes",
    reports: "Published reports · delayed",
    count: "records",
    times: "Source local time",
  },
  pt: {
    title: "Atividade publicada mais recente",
    off: "Desligado",
    on: "Ligado",
    refresh: "Verificar agora",
    loading: "Consultando fonte oficial…",
    none: "Sem fonte recente verificada para esta cidade.",
    checked: "Fonte consultada",
    latest: "Último evento na fonte",
    window: "Período publicado",
    cadence: "Frequência da fonte",
    unknown: "Indisponível",
    privacy:
      "Células aproximadas de 250 m · mínimo 2 registros. Independente das pontuações históricas das rotas.",
    details: "Fonte e datas",
    empty: "Sem grupos de 2+ registros neste período publicado.",
    calls: "Chamadas não verificadas · não são crimes confirmados",
    reports: "Registros publicados · com atraso",
    count: "registros",
    times: "Horário local da fonte",
  },
  es: {
    title: "Actividad publicada más reciente",
    off: "Desactivado",
    on: "Activado",
    refresh: "Consultar ahora",
    loading: "Consultando fuente oficial…",
    none: "Sin fuente reciente verificada para esta ciudad.",
    checked: "Fuente consultada",
    latest: "Último evento en la fuente",
    window: "Período publicado",
    cadence: "Frecuencia de la fuente",
    unknown: "No disponible",
    privacy:
      "Celdas aproximadas de 250 m · mínimo 2 registros. Independiente de puntuaciones históricas de rutas.",
    details: "Fuente y fechas",
    empty: "Sin grupos de 2+ registros en este período publicado.",
    calls: "Llamadas sin verificar · no son delitos confirmados",
    reports: "Registros publicados · con retraso",
    count: "registros",
    times: "Hora local de la fuente",
  },
};
export type ActivityLanguage = keyof typeof activityCopy;
export function PublishedActivity({
  state,
  enabled,
  onToggle,
  language = "en",
}: {
  state: ReturnType<typeof usePublishedActivity>;
  enabled: boolean;
  onToggle: () => void;
  language?: ActivityLanguage;
}) {
  const c = activityCopy[language];
  const { source, feed } = state;
  return (
    <section
      className="space-y-2 rounded-2xl border border-border bg-card p-3 text-xs shadow-soft"
      aria-label={c.title}
    >
      <div className="flex items-center justify-between gap-2">
        <strong>{c.title}</strong>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={c.title}
          onClick={onToggle}
          className="min-h-9 rounded-full border border-border px-3 py-1.5 font-semibold"
        >
          {enabled ? c.on : c.off}
        </button>
      </div>
      {!source ? (
        <p>{c.none}</p>
      ) : (
        <>
          <p>{source.kind === "calls" ? c.calls : c.reports}</p>
          {enabled && (
            <button
              type="button"
              onClick={state.onRefresh}
              disabled={state.refreshDisabled}
              className="underline disabled:opacity-50"
            >
              {state.loading ? c.loading : c.refresh}
            </button>
          )}
          {state.error && <p role="status">{state.error}</p>}
          {enabled && feed && !state.loading && activityBubbles(feed, feed.areaId).length === 0 && (
            <p role="status">{c.empty}</p>
          )}
          <details>
            <summary className="cursor-pointer">{c.details}</summary>
            <div className="space-y-1 pt-2">
              <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                {source.name}
              </a>
              <p>
                {c.cadence}: {source.cadence}. {state.checkIntervalLabel}
              </p>
              <p>
                {c.checked}: {feed ? new Date(feed.checkedAt).toLocaleString(language) : c.unknown}
              </p>
              <p>
                {c.latest}:{" "}
                {feed?.latestAvailableAt ? formatSourceTime(feed.latestAvailableAt) : c.unknown}
              </p>
              <p>
                {c.window}:{" "}
                {feed
                  ? `${formatSourceTime(feed.windowStart)} — ${formatSourceTime(feed.windowEnd)}`
                  : c.unknown}
              </p>
              <p>
                {c.times} (
                {source.cityId === "sf"
                  ? "America/Los_Angeles"
                  : source.cityId === "nyc"
                    ? "America/New_York"
                    : "America/Chicago"}
                )
              </p>
              <p>{source.delayNote}</p>
              <p>{source.scopeNote}</p>
              <p>{source.locationNote}</p>
              <p>{c.privacy}</p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
