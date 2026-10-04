import policy from "../../config/nyc-policy.json";
import type { RiskGridMeta } from "@/types/risk";

const TIME_EXCLUSIONS = [
  "missing_or_invalid_start",
  "incomplete_or_invalid_interval",
  "interval_crosses_date_or_bucket",
  "reversed_interval",
];
const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown) => (Number.isFinite(value) ? (value as number) : 0);

/** Audit facts published with the NYC-native grid; null for any other dataset/model version. */
export function nycSourceFacts(meta: RiskGridMeta) {
  if (meta.cityId !== "nyc" || meta.sourceModelVersion !== policy.version) return null;
  const p = record(meta.provenance);
  const releases = (Array.isArray(p["sourceSummaries"]) ? p["sourceSummaries"] : []).map((s) => {
    const summary = record(s);
    return {
      id: String(summary["datasetId"] ?? ""),
      lastReport: String(record(summary["reportDateRange"])["max_report"] ?? "").slice(0, 10),
    };
  });
  const firstReasons = record(p["firstMatchingExclusionCounts"]);
  const byCode = record(p["eligibleByNativeKeyCode"]);
  return {
    version: meta.sourceModelVersion,
    period: meta.period,
    retrieved: (meta.dataAsOf ?? "").slice(0, 10),
    releases,
    eligible: meta.incidentsUsed,
    merged: count(meta.sourceReportCount),
    excluded: count(meta.excludedReportCount),
    categories: Object.entries(policy.selectedKeyCodes).map(([code, label]) => ({
      code,
      label,
      complaints: count(byCode[code]),
    })),
    grandLarcenyPdCodes: policy.grandLarcenyFromPersonPdCodes,
    premises: policy.premisesAllowlist,
    timeExcluded: TIME_EXCLUSIONS.reduce((sum, key) => sum + count(firstReasons[key]), 0),
  };
}
