# Paste this into Claude Code in VS Code

Implement the attached NYC data conversion in this Arazul repository. Do the work, run the checks, and explain the final changes. Read AGENTS.md first. Preserve Lovable history; do not force-push, rewrite published commits, or deploy.

## Goal and constraints

Support an auditable, NYPD-native historical reported outdoor-complaint index covering all five NYC boroughs. Translate the data structure, without pretending New York's offense definitions are the same as São Paulo's. Preserve São Paulo, other cities, the existing UI features, Google routing, and the latest-published-activity layer.

Do not change src/config/exposureConfig.ts constants, the route-score integral, 30m sampling, the 70/30 time blend, the 15% improvement threshold, detour budgets, or route generation. The attached NYC preprocessing is a new explicitly documented model version. It changes the NYC input dataset and extends its coverage; it is not claimed to reproduce the previous Brisa values numerically. Do not copy SSP severity/travel-mode weights into NYC.

## Exact files provided

Read these before editing:
- NYC_START_HERE.md
- docs/NYC_TRANSLATION.md
- docs/nyc-audit.json
- config/nyc-policy.json
- public/data/nyc-native.json (candidate full-city aggregate grid)
- public/data/nyc-coverage.geojson (official NYC borough jurisdiction boundaries, water included)
- scripts/build-nyc-data.py
- scripts/query-nyc-route.py
- src/services/nycCoverage.ts
- src/test/nyc-coverage.test.ts
- tests/test_nyc_converter.py, tests/test_route_distance.py, tests/test_coverage.mjs

Optional LOCAL ONLY reproducibility files: private-data/nyc/snapshot.json.gz and private-data/nyc/normalized-complaints.jsonl.gz. The snapshot contains only the fields selected by the converter, not a complete copy of every NYPD complaint column. Add /private-data/nyc/ to .gitignore. Do not upload complaint snapshots/incident-level records to public/ or commit them. Aggregate outputs and audit counts can be committed.

The repository inspected during preparation was vania020/arazul-bigredhacks, commit 62c2da94ed3db59236484e195016381ef1bdf39e. Check the actual working tree; adapt to newer code and preserve unrelated work.

## Existing integration points to inspect

src/types/risk.ts
src/config/cities.ts
src/services/riskDataService.ts
src/services/exposureService.ts
src/services/time-of-day.ts
src/components/MethodologyModal.tsx
src/map/ExposureLayer.tsx (or the current equivalent)
src/test/multicity-data.test.ts
docs/US_CITY_DATA.md
README.md
scripts/import-brisa-cities.py

There is already an imported Central Manhattan file at public/data/nyc.json. The new candidate is public/data/nyc-native.json; do not simply overwrite the old file or display the new grid before implementing polygon coverage.

## Implementation

1. Keep public/data/nyc-native.json as the versioned runtime asset and point ONLY the NYC city configuration to /data/nyc-native.json. Expand the NYC region label to all five boroughs. Keep America/New_York and walking as default. Keep existing demo endpoints. Retain the old nyc.json during review if useful; document which one is active.
2. Extend RiskGridMeta with typed optional coverageGeojsonUrl and requiresPolygonCoverageGuard, plus a runtime-only coverage geometry field or equivalent separate cache. Use the supplied CoverageGeoJSON type. Preserve unknown provenance fields. Fetch and validate /data/nyc-coverage.geojson once alongside the NYC grid, with cache invalidation/retry consistent with the existing data loader. The current validator alone ignores polygon metadata, so wire this in explicitly. If required geometry fails to load, fail closed: routes remain available, NYC exposure comparison is unavailable. Never substitute zero intensity or synthetic data.
3. In routeCoverage, retain existing unavailable, unsupported-mode and bounding-rectangle checks. For datasets declaring a required polygon guard, require loaded geometry and use isPathInsideCoverage on the full route polyline. The provided helper checks entire segments, not just endpoints or sampled points. A New Jersey path between covered NYC endpoints must be outside-coverage. Check this before numeric exposure scoring. Do not change the exposure integral/recommendation mathematics. Other cities retain their current behavior.
4. Use meta.projectionLatitude=40.7 and the provided southwest origin for grid indexing; do not reuse Manhattan's old 40.74 or map center. Do not shift or reproject the aggregate cells. Four array slots are local 00–06, 06–12, 12–18, 18–24. Do not apply UTC conversion to NYPD occurrence wall times.
5. meta.modes is [walking]. The driving array duplicates walking solely for schema compatibility; reject NYC driving exposure via the existing unsupported-mode path. Keep ordinary routing usable. Do not present driving arrays as evidence of driving safety.
6. Enforce that the full rectangular grid has rows*cols entries and valid four-value arrays; distinguish a missing required cell from a legitimate zero cell. The converter supplies all zero cells, so absence means corrupted/incomplete data. Validate this for the new required-coverage NYC model; avoid breaking other cities' intentional formats.
7. Ensure the methodology UI displays NYC's source, fixed occurrence window, actual release/report coverage, selected offense/premise scope, equal weights, missing-time exclusions, approximate/relocated locations, unsupported driving, and independently normalized scores. Keep the SSP severity table exclusive to São Paulo. Use phrases such as 'historical reported outdoor-complaint exposure' and 'lower modeled exposure'; do not present probabilities of harm, calibrated 'X% safer', all-crime coverage, exact addresses, or cross-city numeric safety comparisons. Counts are complaints, not victims or every offense in a multi-offense event.
8. The spatial overlay must not imply NYC coverage in New Jersey or other outside areas. Clip NYC heat cells to the coverage polygons, or display only fully covered cells and make the resulting coastline omissions clear. Boundary failure must hide the exposure overlay. NYC water-inclusive boundaries permit bridge segments; zero water cells are not evidence of water safety. Keep displayScale=24 for rendering only; never multiply the scored values.
9. Update docs/US_CITY_DATA.md and README.md around the actual resulting active NYC asset, scope, counts and version. Mark the old Brisa-import NYC row as superseded; do not leave contradictory Central Manhattan coverage claims. Prevent scripts/import-brisa-cities.py from silently reactivating or overwriting the new NYC asset/configuration. Leave Chicago and SF data unchanged.
10. Keep scripts/query-nyc-route.py as an optional offline audit tool, not a replacement scoring algorithm. It first selects a padded route box, then measures the minimum distance to the complete polyline; a box alone is not 'within X metres'. Use actual route GeoJSON [longitude,latitude]. Its output counts published approximate points; do not call them exact incident addresses. Do not add per-route live Socrata requests to the frontend.

## Native category semantics to preserve

- KY_CD 105 / ROBBERY stays robbery; do not infer vehicle/cargo/street victim categories from the code alone.
- 106 / FELONY ASSAULT stays felony assault. NYPD includes attempted murder in this classification; do not manufacture an attempted-homicide record.
- 344 / ASSAULT 3 & RELATED OFFENSES retains 'related offenses'; do not relabel every row as bodily injury.
- 109 / GRAND LARCENY is broader than theft from person. Only the explicitly documented PD-code allowlist participates, with original PD_DESC retained in the local normalization/audit. Never relabel every grand-larceny complaint as street theft.
- Homicide, rape/sex offenses, petit larceny, vehicle theft and other categories are outside this selected baseline. Exclusion is not a claim that they do not exist or are unimportant. Rape/sex-offense points are located at precinct station houses and cannot safely be scored as original locations.
- Indoor/subway/retail complaints are outside the two-premise allowlist. Outdoor premises do not establish a stranger/pedestrian encounter.
- Preserve attempted/completed flags, occurrence vs report dates, original source IDs, codes and labels in local records. Do not deduplicate by latitude/longitude/time; use persistent complaint ID. YTD corrections supersede historic rows even when the new category is excluded.
- Unknown/cross-bucket times are audited exclusions. No fabricated midnight, category, address or recency is assigned.

## Validation and handoff

Run python tests: python -m unittest discover -s tests -p 'test_*.py' -v.
If local snapshot is available, rebuild to a TEMP directory with:
python scripts/build-nyc-data.py --input private-data/nyc/snapshot.json.gz --output-root <temporary-directory>
Require exact SHA-256 equality for the rebuilt grid and coverage file. Never use the repository root as the temporary output path.
Run npm test and npm run build (or the package manager already used in this checkout). Run relevant lint/type checks.
Add meaningful integration tests: all five borough examples are covered; Jersey City and a route crossing NJ are outside; whole-segment hole-crossing rejection; boundary-fetch failure yields unavailable exposure; NYC driving unsupported; full-grid completeness; local-hour selection; unchanged 15% recommendation behavior; source/model metadata available; overlay stays inside coverage; other cities unchanged.
Show files changed, validation results, known limitations, how to run locally, and the branch/commit status. Do not claim visual/browser checks were completed unless you actually performed them. Do not deploy or push unless I explicitly ask.
