# Validation performed

Checked October 4, 2026 UTC against the downloaded source snapshot.

- Official metadata and attached NYPD complaint footnotes inspected; actual source field names, native labels, report-date release coverage and spatial suppression rules verified.
- Historic query: 48,766 rows; current YTD 2025-occurrence query: 7,609 rows. Explicit ordering/pagination counts verified. Duplicate/missing IDs within each source checked. Source row-update timestamp and query count rechecked after downloads.
- 56,375 merged rows = 34,067 eligible + 22,308 excluded by mutually exclusive first reason. No source overlap in this snapshot. Eligible totals reconcile by native category, borough and four local buckets.
- Full rectangular grid: 203 x 195 = 39,585 cells. Four supported-mode values in every cell; finite intensities in [0,1], complete coverage and source projection checked.
- The unchanged `validateRiskGrid` function extracted from the inspected Arazul repository accepts the generated grid. This verifies schema compatibility, not completed app integration; that validator by itself does not enforce the new polygon metadata.
- 16 Python unit tests passed: native label/ID preservation, grand-larceny subtype selection, no forced rape/homicide categories, missing/nonfinite coordinates, time uncertainty/interval rules, local wall-time buckets, window/premise filters, fail-closed taxonomy handling, later-source precedence, snapshot tamper detection, spherical segment distances and GeoJSON coordinate ordering.
- Node v24 official-polygon checks passed for points in all five boroughs, outside Jersey City, a route through NJ, a Manhattan path, and a route segment crossing a polygon hole despite covered endpoints.
- Offline rebuild from supplied snapshot produced byte-identical grid, coverage polygon, audit, compressed snapshot and normalized JSON Lines archive. This includes the actual snapshot retrieval timestamp, not a guessed creation date.
- Demonstration route-corridor query at 250m returned 378 eligible published complaint points (195 key-code 344, 75 key-code 109, 33 key-code 105, 75 key-code 106). This uses a straight-line illustrative GeoJSON, not an actual pedestrian itinerary, and is not the application's route exposure score.

Not yet performed: full integration into the React app, app build/full Vitest suite, browser/visual QA, public repository push or deployment. Those are explicitly specified in CLAUDE_PROMPT.md. The current app must not activate the candidate grid until polygon loading, route coverage and overlay masking are integrated.
