import gridAsset from "@/assets/risk-grid.json.asset.json";
import type { CityConfig } from "@/config/cities";
import type { RiskGrid, TravelMode } from "@/types/risk";
import { validateCoverageGeoJSON } from "./nycCoverage";

const cache = new Map<string, Promise<RiskGrid | null>>();
/** Validate runtime assets before treating missing cells as zero reported counts. */
export function validateRiskGrid(input: unknown, cityId: string): RiskGrid {
  const grid = input as RiskGrid;
  const m = grid?.meta;
  if (
    !m ||
    !grid.cells ||
    Array.isArray(grid.cells) ||
    typeof grid.cells !== "object" ||
    grid.isDemo === true ||
    (m.cityId && m.cityId !== cityId) ||
    !Number.isFinite(m.cellSizeM) ||
    m.cellSizeM <= 0 ||
    !Number.isFinite(m.originLat) ||
    Math.abs(m.originLat) >= 90 ||
    !Number.isFinite(m.originLon) ||
    Math.abs(m.originLon) > 180 ||
    !Number.isInteger(m.rows) ||
    m.rows <= 0 ||
    !Number.isInteger(m.cols) ||
    m.cols <= 0 ||
    !Array.isArray(m.buckets) ||
    m.buckets.length !== 4 ||
    !Array.isArray(m.modes) ||
    !m.modes.length ||
    m.modes.some((x) => !["walking", "driving"].includes(x)) ||
    typeof m.source !== "string" ||
    typeof m.period !== "string" ||
    !Number.isInteger(m.incidentsUsed) ||
    m.incidentsUsed < 0
  )
    throw new Error("Invalid incident dataset");
  if (
    m.projectionLatitude !== undefined &&
    (!Number.isFinite(m.projectionLatitude) || Math.abs(m.projectionLatitude) >= 90)
  )
    throw new Error("Invalid projection");
  if (
    m.coverageBounds &&
    (m.coverageBounds.length !== 4 ||
      m.coverageBounds.some((n) => !Number.isFinite(n)) ||
      m.coverageBounds[0] >= m.coverageBounds[2] ||
      m.coverageBounds[1] >= m.coverageBounds[3])
  )
    throw new Error("Invalid coverage");
  if (m.incidentsUsed > 0 && Object.keys(grid.cells).length === 0)
    throw new Error("Empty incident grid");
  const longitudeScale = 111320 * Math.cos(((m.projectionLatitude ?? m.originLat) * Math.PI) / 180);
  const maxLng = m.originLon + (m.cols * m.cellSizeM) / longitudeScale;
  const maxLat = m.originLat + (m.rows * m.cellSizeM) / 111320;
  if (
    m.coverageBounds &&
    (m.coverageBounds[0] < m.originLon - 1e-8 ||
      m.coverageBounds[1] < m.originLat - 1e-8 ||
      m.coverageBounds[2] > maxLng + 1e-8 ||
      m.coverageBounds[3] > maxLat + 1e-8)
  )
    throw new Error("Coverage exceeds incident grid");
  if (m.displayScale !== undefined && (!Number.isFinite(m.displayScale) || m.displayScale <= 0))
    throw new Error("Invalid display scale");
  if (m.timeResolution !== undefined && !["six-hour", "all-day"].includes(m.timeResolution))
    throw new Error("Invalid time resolution");
  if (
    m.requiresPolygonCoverageGuard !== undefined &&
    typeof m.requiresPolygonCoverageGuard !== "boolean"
  )
    throw new Error("Invalid coverage guard");
  if (
    m.coverageGeojsonUrl !== undefined &&
    (typeof m.coverageGeojsonUrl !== "string" || !m.coverageGeojsonUrl.startsWith("/"))
  )
    throw new Error("Invalid coverage geometry URL");
  if (m.requiresPolygonCoverageGuard) {
    if (!m.coverageGeojsonUrl || !m.coverageBounds)
      throw new Error("Polygon-guarded dataset lacks coverage geometry");
    // The converter serializes every cell, including zeros: a missing key is corruption, not zero.
    if (Object.keys(grid.cells).length !== m.rows * m.cols)
      throw new Error("Incomplete incident grid");
    for (let r = 0; r < m.rows; r++)
      for (let c = 0; c < m.cols; c++) {
        const cell = grid.cells[`${r}_${c}`];
        if (!cell) throw new Error("Missing incident cell");
        for (const values of [cell.walking, cell.driving])
          if (
            !Array.isArray(values) ||
            values.length !== 4 ||
            values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
          )
            throw new Error("Invalid incident values");
      }
  }
  for (const [key, cell] of Object.entries(grid.cells)) {
    const match = /^(\d+)_(\d+)$/.exec(key);
    if (!match || Number(match[1]) >= m.rows || Number(match[2]) >= m.cols)
      throw new Error("Invalid incident cell");
    for (const mode of m.modes as TravelMode[]) {
      if (
        !Array.isArray(cell?.[mode]) ||
        cell[mode].length !== 4 ||
        cell[mode].some((v) => !Number.isFinite(v) || v < 0)
      )
        throw new Error("Invalid incident values");
    }
  }
  return { meta: { ...m, cityId }, cells: grid.cells, isDemo: false };
}

/** The mask must be the one the grid was built from: every vertex lies in coverageBounds. */
export function attachCoverageGeometry(grid: RiskGrid, input: unknown): RiskGrid {
  const geometry = validateCoverageGeoJSON(input);
  const b = grid.meta.coverageBounds;
  if (!b) throw new Error("Coverage geometry without coverage bounds");
  for (const feature of geometry.features) {
    const g = feature.geometry;
    const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const ring of polygons.flat())
      for (const [lng, lat] of ring)
        if (lng < b[0] - 1e-9 || lat < b[1] - 1e-9 || lng > b[2] + 1e-9 || lat > b[3] + 1e-9)
          throw new Error("Coverage geometry does not match incident grid");
  }
  return { ...grid, coverageGeometry: geometry };
}

async function fetchJson(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  return response.json();
}
/** No synthetic fallback: unavailable sources leave Google routing usable without exposure claims. */
export function loadRiskGrid(city: CityConfig): Promise<RiskGrid | null> {
  if (!city.datasetUrl) return Promise.resolve(null);
  if (!cache.has(city.id)) {
    const url = city.datasetUrl === "hosted-sao-paulo" ? gridAsset.url : city.datasetUrl;
    const request = fetchJson(url, "Incident data")
      .then(async (data) => {
        let grid = validateRiskGrid(data, city.id);
        // Fail closed: without its polygon mask a guarded grid is unusable (routing stays available).
        if (grid.meta.requiresPolygonCoverageGuard)
          grid = attachCoverageGeometry(
            grid,
            await fetchJson(grid.meta.coverageGeojsonUrl!, "Coverage geometry"),
          );
        if (city.id === "sao-paulo") {
          grid.meta.sourceUrl = "https://www.ssp.sp.gov.br/estatistica/consultas";
          grid.meta.timeResolution = "six-hour";
          grid.meta.methodology =
            "Team-provided SSP-SP grid. Severity and travel-mode weights are precomputed; route samples blend 70% selected six-hour window with 30% daily average.";
          grid.meta.limitations = [
            "Historical reported incidents, not a prediction of safety. The repository includes the aggregate grid but not its original preprocessing pipeline.",
          ];
        }
        return grid;
      })
      .catch((error) => {
        cache.delete(city.id);
        throw error;
      });
    cache.set(city.id, request);
  }
  return cache.get(city.id)!;
}
