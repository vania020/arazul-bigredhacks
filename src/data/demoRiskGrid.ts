/**
 * DEMO FALLBACK ONLY.
 * Synthetic values generated in code, used ONLY when risk-grid.json fails to load.
 * These are NOT SSP statistics. The UI shows a "Demo exposure layer" badge whenever this is active.
 */
import type { RiskGrid, RiskCell } from "@/types/risk";

export function buildDemoRiskGrid(): RiskGrid {
  const meta = {
    cellSizeM: 100,
    originLat: -24.01,
    originLon: -46.85,
    rows: 735,
    cols: 519,
    buckets: ["madrugada", "manha", "tarde", "noite"],
    modes: ["walking", "driving"] as const,
    source: "DEMO (synthetic)",
    period: "n/a",
    incidentsUsed: 0,
  };
  const cells: Record<string, RiskCell> = {};
  // Smooth synthetic bumps around central São Paulo.
  const centers: [number, number, number][] = [
    [460, 240, 30],
    [470, 255, 22],
    [450, 230, 18],
  ];
  for (let r = 420; r < 500; r++) {
    for (let c = 200; c < 290; c++) {
      let v = 0;
      for (const [cr, cc, a] of centers) v += a * Math.exp(-((r - cr) ** 2 + (c - cc) ** 2) / 120);
      if (v < 0.5) continue;
      const w = [v * 0.8, v * 0.6, v * 0.9, v * 1.2].map((x) => +x.toFixed(1));
      cells[`${r}_${c}`] = { walking: w, driving: w.map((x) => +(x * 0.6).toFixed(1)) };
    }
  }
  return { meta: { ...meta, modes: ["walking", "driving"] }, cells, isDemo: true };
}
