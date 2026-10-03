# London published-record density

`public/data/london.json` is a real aggregate (`isDemo: false`) built from the official [data.police.uk street-level API](https://data.police.uk/docs/method/crime-street/). It covers **August 2026**, retrieved **3 October 2026**, the latest published month returned by [crime-last-updated](https://data.police.uk/api/crime-last-updated) on retrieval. It is a full published monthly response for a bounded central London polygon, not an assertion that all real incidents were reported or geocoded.

Coverage `[west, south, east, north]`: `[-0.155, 51.495, -0.085, 51.535]`. This includes Soho, Covent Garden, Bloomsbury and parts of Westminster and the City. Suggested route: Trafalgar Square `(51.5080, -0.1281)` to British Museum `(51.5194, -0.1270)`. Time zone: `Europe/London`.

## Source and completeness

Exact source request:

https://data.police.uk/api/crimes-street/all-crime?date=2026-08&poly=51.495,-0.155:51.535,-0.155:51.535,-0.085:51.495,-0.085

The API returned **8,581** records in one successful response. This endpoint has no pagination and rejects polygons over 10,000 records; this response is below that limit. All returned months were checked. Deduplication uses a nonempty persistent ID, otherwise the API ID (ASB has blank persistent IDs); **0 duplicates** and **0 out-of-bounds records** were removed. Equal coordinates are not treated as duplicates.

Selected categories are robbery (**293**), theft-from-the-person (**1,451**), violent-crime (**1,318**) and public-order (**399**): **3,461 records used**, **5,120 excluded** by category. The selection is a transparent heuristic for pedestrian relevance. It does not establish that incidents were outdoors, involved strangers, or indicate danger to a passer-by. No offence-severity weights are inferred. Published location types may include geographic forces and British Transport Police.

Raw response SHA-256: `c88834c959323e0f76fccb9e57daf79525fa3d83969332426bd7e73baafe5776`.

## Aggregation and runtime geometry

Grid origin is `(51.495, -0.155)`, with **23 rows × 25 columns**, **200m** cells, latitude conversion `111320 m/degree` and longitude conversion `111320*cos(originLatitude)`. This matches the runtime's local grid projection. The last row/column can extend beyond the exact requested rectangle: `coverageBounds`, not the rounded grid envelope, defines data coverage.

Count selected anonymised points per cell. Smooth using the 3×3 outer product of `[1,2,1]` with itself, divided by 16, treating beyond-grid cells as zero. Apply `log1p`; divide by the nearest-rank 95th percentile of positive transformed cell values (**2.9509963797125995**); clamp to `[0,1]` and round to six decimals. All 575 cells are emitted. `displayScale: 24` controls overlay presentation only. These local indices are not probabilities or rates and cannot be compared numerically across cities.

The source provides month only, so `timeResolution: 'all-day'` and all four legacy bucket entries are identical. Walking is the only supported mode. Identical `driving` arrays preserve legacy schema compatibility; they do not supply a driving-risk model.

## Privacy and limitations

The publisher [anonymises locations](https://data.police.uk/about/#location-anonymisation); coordinates are approximate street locations, not exact events. Aggregation does not recover exact positions. Only aggregates and provenance are kept in the repository, never raw incident reports, IDs or street labels. Data is licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); contains public sector information licensed under that licence.

Recorded-crime statistics reflect reporting/policing differences, omitted/unlocated incidents and later revisions. They lack population/footfall exposure denominators and incident hours. No reports is not evidence of safety. Smoothing loses neighbouring information at the area edge. The result is a historical reported-record density aid, not a validated personal-safety forecast.

## Rebuild

Run `python3 scripts/build-london-data.py` with network access. It fetches the pinned month into memory and writes only the aggregate. Alternatively, use `--input /outside/repository/response.json` for an existing exact API response. `--output /tmp/london.json` writes a review copy. A future API revision can change the response hash and aggregates; provenance records the actual retrieval date, categories, counts, removals and response hash.
