import type { ReactNode } from "react";
import { datasetDetailsCopy } from "@/i18n/datasetDetails";
import { useI18n } from "@/i18n";
import { nycSourceFacts } from "@/services/nycSourceFacts";
import type { RiskGridMeta } from "@/types/risk";

export function NycSourceDetails({ meta }: { meta: RiskGridMeta }) {
  const { lang } = useI18n();
  const facts = nycSourceFacts(meta);
  if (!facts) return null;
  const copy = datasetDetailsCopy[lang];
  const fill = (text: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), text);
  const n = (value: number) => value.toLocaleString();
  const rows: [string, ReactNode][] = [
    [copy.model, `${facts.version} · ${fill(copy.retrieved, { date: facts.retrieved })}`],
    [copy.window, fill(copy.windowValue, { period: facts.period })],
    [
      copy.releases,
      facts.releases.map((r) => (
        <span key={r.id} className="block">
          {fill(copy.releaseValue, { id: r.id, date: r.lastReport })}
        </span>
      )),
    ],
    [
      copy.complaints,
      fill(copy.complaintsValue, {
        eligible: n(facts.eligible),
        merged: n(facts.merged),
        excluded: n(facts.excluded),
      }),
    ],
    [
      copy.categories,
      facts.categories.map((c) => (
        <span key={c.code} className="block">
          {c.label} ({c.code}): {n(c.complaints)}
          {c.code === "109" &&
            ` · ${fill(copy.largeny, { codes: facts.grandLarcenyPdCodes.join(", ") })}`}
        </span>
      )),
    ],
    [copy.premises, facts.premises.join(", ")],
    [copy.time, fill(copy.timeValue, { n: n(facts.timeExcluded) })],
    [copy.driving, copy.drivingValue],
  ];
  return (
    <section className="mt-4 rounded-xl border p-3" aria-label={copy.title}>
      <h3 className="text-sm font-semibold text-deep">{copy.title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{copy.intro}</p>
      <dl className="mt-2 space-y-2 text-xs">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="font-semibold">{term}</dt>
            <dd className="text-text-secondary">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
