# US aggregate activity grids

These runtime assets import the existing Brisa packages offline. They contain aggregate cells and provenance metadata only; no reports, individual coordinates, or walking graphs are exported. `isDemo` is false because these are historical source aggregates. This does not indicate live conditions or a probability of harm.

| Asset | Coverage | Eligible reports | Source rows | Grid | Time zone |
| --- | --- | ---: | ---: | --- | --- |
| `public/data/nyc.json` | Central Manhattan | 5,497 | 90,116 | 42 rows × 25 columns | America/New_York |
| `public/data/chicago.json` | Chicago Loop | 3,064 | 21,349 | 18 × 15 | America/Chicago |
| `public/data/san-francisco.json` | Downtown San Francisco | 160 | 48,533 | 20 × 20 | America/Los_Angeles |

All packages cover occurrences from 2025-01-01 through 2025-12-31. `dataAsOf` preserves the source manifest's actual download timestamp on 2026-10-03; it is not a claim that every late report was available. SF's source count is offense rows; its eligible count deduplicates initial reports by incident ID. Full source names, URLs, exclusion counts, filters and limitations remain in each asset's metadata.

## Conversion and scoring

Brisa cell IDs are `column:row`; Arazul keys are `row_column`. Origins are the southwest corner of the full incident halo. The 250-metre grid uses 111320 metres per latitude degree and a cosine longitude correction at `projectionLatitude`: 40.74 for NYC, 41.88 for Chicago, and 37.788 for SF. `coverageBounds` is the smaller actual planning rectangle, not the incident halo. Preserve the reference latitude when projecting routes or the imported cells will shift.

The existing four `intensity` values are copied exactly to `walking`, in local six-hour order: 00–06, 06–12, 12–18, 18–24. The existing Brisa model uses equal category weights, shrink20 temporal adjustment, cross smoothing, and `v / (v + q)`, where `q` is the package's nearest-rank p90 positive smoothed activity (at least 1). `displayScale: 24` is an overlay-only display multiplier; stored/scored intensity remains unchanged in [0,1]. There are no SSP severity weights in these imports. These independently normalized indices and differing source filters cannot support comparisons between cities. SF includes only street/public-place robbery and attempted robbery; it is particularly sparse.

Only walking is supported (`meta.modes` contains `walking`). `driving` mirrors the same arrays for legacy shape compatibility and must not be presented as driving evidence. Historical reports reflect reporting and geocoding biases; zero is not proof of safety. Every source-specific limitation is preserved except obsolete Brisa graph and landmark implementation details.

## Planning rectangles and example endpoints

Coordinates below are longitude, latitude. Endpoint examples preserve Brisa's snapped landmark coordinates; they are not verified entrances.

| City ID | Bounds `[west,south,east,north]` | Origin | Destination |
| --- | --- | --- | --- |
| `nyc` | `[-74.02,40.7,-73.965,40.78]` | Penn Station `[-73.9933748,40.7510909]` | Grand Central Terminal `[-73.9775815,40.7522481]` |
| `chicago` | `[-87.644,41.866,-87.617,41.891]` | Willis Tower `[-87.6354813,41.8788924]` | Chicago Riverwalk `[-87.62953,41.887116]` |
| `san-francisco` | `[-122.426,37.773,-122.389,37.803]` | Union Square `[-122.4074974,37.7878403]` | Ferry Building plaza `[-122.3942491,37.7949204]` |

## Reproduce and verify

From the Arazul repository:

```sh
python3 scripts/import-brisa-cities.py --brisa-root ../bigredhacks
python3 scripts/import-brisa-cities.py --brisa-root ../bigredhacks --check
```

The converter checks all cell geometries against the source reference projection, complete rectangular coverage, valid four-bucket values, exact imported intensity equality, aggregate eligible counts, and source/eligible/excluded count consistency. `--check` additionally verifies the committed assets against fresh deterministic conversion. SHA-256 hashes in metadata identify the exact source package bytes. Source packages map NYC to `nyc-manhattan.json`, Chicago to `chicago-loop.json`, and San Francisco to `sf-downtown.json` (whose original city ID is `sf`). No network or source-data mutation is required.
