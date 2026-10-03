import gridAsset from "@/assets/risk-grid.json.asset.json";
import { buildDemoRiskGrid } from "@/data/demoRiskGrid";
import type { RiskGrid, RiskGridMeta, RiskCell } from "@/types/risk";

let gridPromise: Promise<RiskGrid> | null = null;

/** Loads the risk grid at runtime (never bundled). Parsed once, kept in memory. */
export function loadRiskGrid(): Promise<RiskGrid> {
  if (!gridPromise) {
    gridPromise = fetch(gridAsset.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ meta: RiskGridMeta; cells: Record<string, RiskCell> }>;
      })
      .then((j) => ({ meta: j.meta, cells: j.cells, isDemo: false }))
      .catch((e) => {
        console.warn("risk-grid.json failed to load, using demo layer", e);
        return buildDemoRiskGrid();
      });
  }
  return gridPromise;
}
