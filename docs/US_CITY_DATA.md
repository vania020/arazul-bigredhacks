# US aggregate activity grids

Chicago and San Francisco import the existing Brisa packages offline. New York City uses a direct NYPD-native conversion (model `nyc-native-v1`, see [NYC-native grid](#nyc-native-grid-active)); the earlier Brisa NYC import remains in the repository only as a superseded, inactive file. All assets contain aggregate cells and provenance metadata only; no reports, individual coordinates, or walking graphs are exported. `isDemo` is false because these are historical source aggregates. This does not indicate live conditions or a probability of harm.

| Asset | Coverage | Eligible reports | Source rows | Grid | Time zone |
| --- | --- | ---: | ---: | --- | --- |
| `public/data/nyc-native.json` — **active** (`nyc-native-v1`) | All five NYC boroughs, polygon-guarded | 34,067 complaints | 56,375 merged rows | 203 rows × 195 columns | America/New_York |
| `public/data/nyc.json` — **superseded, inactive** | Central Manhattan (Brisa import) | 5,497 | 90,116 | 42 × 25 | America/New_York |
| `public/data/chicago.json` | Chicago Loop | 3,064 | 21,349 | 18 × 15 | America/Chicago |
| `public/data/san-francisco.json` | Downtown San Francisco | 160 | 48,533 | 20 × 20 | America/Los_Angeles |

All assets cover occurrences from 2025-01-01 through 2025-12-31. For the Brisa imports, `dataAsOf` preserves the source manifest's actual download timestamp on 2026-10-03; it is not a claim that every late report was available. SF's source count is offense rows; its eligible count deduplicates initial reports by incident ID. Full source names, URLs, exclusion counts, filters and limitations remain in each asset's metadata.

`src/config/cities.ts` points NYC at `/data/nyc-native.json`. Nothing loads `nyc.json`; it is kept during review for comparison and can be deleted later. Its Central Manhattan coverage, counts and 40.74 projection describe that old file only.

## Conversion and scoring (Brisa imports)

Brisa cell IDs are `column:row`; Arazul keys are `row_column`. Origins are the southwest corner of the full incident halo. The 250-metre grid uses 111320 metres per latitude degree and a cosine longitude correction at `projectionLatitude`: 41.88 for Chicago, 37.788 for SF, and 40.74 for the superseded NYC import. `coverageBounds` is the smaller actual planning rectangle, not the incident halo. Preserve the reference latitude when projecting routes or the imported cells will shift.

The existing four `intensity` values are copied exactly to `walking`, in local six-hour order: 00–06, 06–12, 12–18, 18–24. The existing Brisa model uses equal category weights, shrink20 temporal adjustment, cross smoothing, and `v / (v + q)`, where `q` is the package's nearest-rank p90 positive smoothed activity (at least 1). `displayScale: 24` is an overlay-only display multiplier; stored/scored intensity remains unchanged in [0,1]. There are no SSP severity weights in these imports. These independently normalized indices and differing source filters cannot support comparisons between cities. SF includes only street/public-place robbery and attempted robbery; it is particularly sparse.

Only walking is supported (`meta.modes` contains `walking`). `driving` mirrors the same arrays for legacy shape compatibility and must not be presented as driving evidence. Historical reports reflect reporting and geocoding biases; zero is not proof of safety. Every source-specific limitation is preserved except obsolete Brisa graph and landmark implementation details.

## NYC-native grid (active)

`public/data/nyc-native.json` is built by `scripts/build-nyc-data.py` from the official NYPD Complaint Data Historic (`qgea-i56i`) and Current Year-To-Date (`5uac-w243`) releases under `config/nyc-policy.json`. It is a historical reported outdoor-complaint exposure index for walking, covering all five boroughs. It is a new, documented model version, not a numerical reproduction of the Brisa NYC values. Category semantics, formulas and limitations are in [NYC_TRANSLATION.md](NYC_TRANSLATION.md); exact counts, query predicates and hashes are in [nyc-audit.json](nyc-audit.json).

- **Scope:** occurrences 2025-01-01 to 2025-12-31 (fixed window). Historic release reports run through 2025-12-31; the YTD release adds late reports and corrections through 2026-06-30. Retrieved 2026-10-04. This is not live data and later reports may be missing.
- **Selection:** NYPD key codes 105 ROBBERY (6,986), 106 FELONY ASSAULT (7,666), 344 ASSAULT 3 & RELATED OFFENSES (16,524) and 109 GRAND LARCENY limited to from-person PD codes 404, 406, 408, 414, 415, 417, 419 (2,891). Only premises STREET and PARK/PLAYGROUND are included. Each complaint has equal weight, with no SSP severity, travel-mode, recency or population weights. Counts are complaints, not victims or every offense in a multi-offense event. Homicide, rape/sex offenses (geocoded to precinct station houses), petit larceny, vehicle theft and indoor/transit premises are outside this baseline. Their exclusion does not mean they are absent or unimportant.
- **By borough:** Bronx 9,032 · Brooklyn 8,784 · Manhattan 8,393 · Queens 7,068 · Staten Island 790.
- **Exclusions (first reason, additive, 22,308 total):** grand larceny outside the selected subtypes 14,680. Other categories in YTD late-report rows 5,380. Occurrence interval crossing a date or six-hour window 1,705. Other or missing premises 513. Incomplete interval 29. Missing borough 1. No hour, location or category is fabricated.
- **Grid:** 250 m cells and `projectionLatitude` 40.7, from the southwest origin in `meta.originLat`/`originLon` (three-cell halo around the official boundary extent). All 39,585 cells are serialized, including zeros. The loader rejects the file if any cell, or any four-value `walking`/`driving` array, is missing or out of range. Four local wall-clock buckets: 00–06, 06–12, 12–18, 18–24. There is no UTC conversion.
- **Coverage:** `meta.requiresPolygonCoverageGuard` makes the loader also fetch `/data/nyc-coverage.geojson`, which contains the official DCP borough boundaries with water areas included. The loader validates this file and checks that it matches the grid extent. If it fails to load, the whole NYC dataset is rejected: Google routing stays available and exposure comparison is unavailable. Route scoring keeps the rectangle checks and also requires every full polyline segment to lie inside the polygons. New Jersey, and routes that leave NYC between covered endpoints, are outside coverage. The heatmap is clipped to the polygons and is hidden if the boundary is missing. Water is inside NYC's jurisdiction, so bridge segments are covered. A zero cell over water is not evidence of water safety.
- **Modes:** `meta.modes` is `["walking"]`. `driving` arrays mirror walking for schema compatibility only. NYC driving routes are compared by travel time without an exposure score.
- **Normalization:** `v / (v + q)` with `q` = NYC p90 of positive smoothed values (2.3033). This is independent of every other city, so scores and percentages are not comparable across cities. `displayScale: 24` is used only for rendering. Route scoring is unchanged: 30 m samples, the 70/30 time blend and the 15% threshold.

Verify or rebuild (Python 3.10+, standard library only; the snapshot is local-only and gitignored):

```sh
python -m unittest discover -s tests -p "test_*.py" -v
python scripts/build-nyc-data.py --input private-data/nyc/snapshot.json.gz --output-root <temporary-directory>
node --experimental-strip-types tests/test_coverage.mjs
```

The rebuilt `public/data/nyc-native.json` and `public/data/nyc-coverage.geojson` under the temporary directory must be byte-identical (SHA-256) to the committed files listed in [package-checksums.json](package-checksums.json). Never pass the repository root as `--output-root` for a check. Running without `--input` downloads a new official snapshot. Changing dates, categories or weights is a new model version, not a silent refresh.

`scripts/query-nyc-route.py --route <route.geojson> --radius-m 250` is an optional offline audit. It takes an actual GeoJSON LineString in `[longitude, latitude]` order, prefilters with a padded route box and then measures the minimum distance to every segment. It counts NYPD's published approximate points, not exact incident addresses. It is not the app's scoring algorithm, and the frontend makes no live Socrata requests.

## Planning rectangles and example endpoints

Coordinates below are longitude, latitude. Endpoint examples preserve Brisa's snapped landmark coordinates; they are not verified entrances.

| City ID | Bounds `[west,south,east,north]` | Origin | Destination |
| --- | --- | --- | --- |
| `nyc` (active `nyc-native.json`; polygon mask governs) | `[-74.2587,40.4774,-73.7000,40.9177]` | Penn Station `[-73.9933748,40.7510909]` | Grand Central Terminal `[-73.9775815,40.7522481]` |
| `nyc` (superseded `nyc.json`) | `[-74.02,40.7,-73.965,40.78]` | Penn Station `[-73.9933748,40.7510909]` | Grand Central Terminal `[-73.9775815,40.7522481]` |
| `chicago` | `[-87.644,41.866,-87.617,41.891]` | Willis Tower `[-87.6354813,41.8788924]` | Chicago Riverwalk `[-87.62953,41.887116]` |
| `san-francisco` | `[-122.426,37.773,-122.389,37.803]` | Union Square `[-122.4074974,37.7878403]` | Ferry Building plaza `[-122.3942491,37.7949204]` |

## Reproduce and verify (Brisa imports)

From the Arazul repository:

```sh
python3 scripts/import-brisa-cities.py --brisa-root ../bigredhacks
python3 scripts/import-brisa-cities.py --brisa-root ../bigredhacks --check
```

The converter checks all cell geometries against the source reference projection, complete rectangular coverage, valid four-bucket values, exact imported intensity equality, aggregate eligible counts, and source/eligible/excluded count consistency. `--check` additionally verifies the committed assets against fresh deterministic conversion. SHA-256 hashes in metadata identify the exact source package bytes. Source packages map NYC to `nyc-manhattan.json`, Chicago to `chicago-loop.json`, and San Francisco to `sf-downtown.json` (whose original city ID is `sf`). No network or source-data mutation is required. NYC is skipped by default because it is superseded. `--include-superseded-nyc` regenerates only the inactive `nyc.json`. The script refuses to write `nyc-native.json` or `nyc-coverage.geojson` and never edits the city configuration.
