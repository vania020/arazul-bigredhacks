# What this conversion means

The conversion adapts NYPD data to Arazul's array/grid schema. It does not translate New York legal offenses into Brazilian legal definitions or calibrate a personal safety probability. The source records and the analytical model are separate. Original NYPD fields remain in the local normalization file; public assets contain aggregate cells and metadata.

## Native codes and the São Paulo comparison

| NYPD key code / description | Analytical interpretation | Relationship to the existing SP display categories | Included in this baseline? |
| --- | --- | --- | --- |
| 105 / ROBBERY | NYPD robbery | Broad conceptual overlap with robbery; no legal equivalence or automatic vehicle/cargo subtype | Only STREET or PARK/PLAYGROUND |
| 106 / FELONY ASSAULT | NYPD felony assault | Broad overlap with violence; includes attempted murder under NYPD classification | Same outdoor filter |
| 344 / ASSAULT 3 & RELATED OFFENSES | Keep the full NYPD category | Cannot equate every related offense to bodily injury | Same outdoor filter |
| 109 / GRAND LARCENY | Grand larceny; a broader native category | Cannot map all of it to SP street theft | Only the selected theft-from-person PD subtypes, plus outdoor filter |
| 110 / GRAND LARCENY OF MOTOR VEHICLE | Native vehicle theft | Some conceptual overlap with vehicle theft; no calibrated driving risk | No |
| 341 / PETIT LARCENY | Native petit larceny | Not automatically pedestrian theft; may include retail/shoplifting | No |
| 101 / MURDER & NON-NEGL. MANSLAUGHTER | Keep the native homicide description | Not an automatic decomposition into SP homicide, robbery-homicide and attempts | No in this limited baseline |
| 104 / RAPE and other sex offenses | Native rape/sex offense categories | No forced conversion; precinct station-house relocation makes those points unsuitable for original-location scoring | No |
| Other native categories | Retain as native categories when present in the YTD late-report snapshot | No invented catch-all SP label | No |

This baseline deliberately keeps the category/premise scope of the previously imported NYC pedestrian model. It is not an all-crime model, and it does not cover every harm relevant to walking. Adding homicide, petit larceny, other premises, driving or severity weights is a separate model-design change requiring a new documented version. The full-city scope refers to geography, not completeness of offense categories.

## Theft-from-person selection

`KY_CD=109` alone is insufficient. The analytical group `grand_larceny_from_person` requires a `PD_CD` in `[404,406,408,414,415,417,419]`. These are the source-specific from-person subtype codes preserved in the previous NYC model. The audit file lists the actual observed PD descriptions from this download, so the selection can be inspected against the source rather than inferred from a generic name. `OFNS_DESC` stays `GRAND LARCENY`; the narrower name is explicitly an analytical group. Attempts/completions remain separate original fields. The converter flags key-code/offense-label mismatches as exclusions instead of guessing a new taxonomy.

The NYPD PD-code/penal-law attachment is useful background but is not a one-to-one glossary of every complaint PD description. Use the actual complaint `PD_DESC` alongside `PD_CD`; do not confuse `KY_CD` and `PD_CD` even when their numeric values coincide.

## Fields preserved locally

`cmplnt_num`, `ky_cd`, `ofns_desc`, `pd_cd`, `pd_desc`, `law_cat_cd`, `crm_atpt_cptd_cd`, `cmplnt_fr_dt`, `cmplnt_fr_tm`, `cmplnt_to_dt`, `cmplnt_to_tm`, `rpt_dt`, `boro_nm`, `addr_pct_cd`, `prem_typ_desc`, `loc_of_occur_desc`, `juris_desc`, `jurisdiction_code`, `latitude`, `longitude`.

The snapshot is a faithful copy of these selected fields, not every column of the original database. Codes/labels are retained in `native`. Parsed coordinates, analytical grouping, time bucket and exclusion reasons live separately in `analysis`. No victim/suspect race, sex, age or names are fetched or used. Original randomly generated persistent complaint IDs remain strings. No raw complaint rows are embedded in the runtime public grid.

## Dates, late reports and duplicates

The occurrence-start window is `2025-01-01 <= CMPLNT_FR_DT < 2026-01-01`. The historic source's available reports end in 2025, while the verified current release's report dates end June 30, 2026. Current-release 2025 occurrences capture some later reports; they do not prove all 2025 crimes have been reported. Filtering an occurrence year does not produce the same totals as a report-year CompStat table.

Historic downloads request the four relevant key codes and two outdoor premises, without filtering out null coordinates. Current downloads request **all** categories/premises in the occurrence window. This allows a current revision to remove a previously eligible historic complaint as well as adding late eligible complaints. Current rows supersede historical rows with the same persistent ID. Duplicate IDs within one release fail validation. No deduplication uses rounded location, time, offense name or victims.

Counts, query predicates, report-date ranges, metadata timestamps and content hashes are retained. Pagination uses explicit persistent-ID order and expected page counts. Row-update metadata and a final count are checked again; changed/truncated downloads fail rather than yielding a seemingly complete grid. Checkpoints are reusable only while the official rows-update timestamp and policy hash remain identical.

## Time policy

Occurrence clocks are local New York wall times. `RPT_DT` is retained as reporting date, never used as occurrence date. No `Z` suffix or UTC conversion is added. Four buckets are 00–06, 06–12, 12–18, 18–24.

A valid From timestamp with no To endpoint is treated as exact under NYPD's footnote. A complete occurrence interval is used only when endpoints share the same local date and bucket and the end is not earlier than the start. Missing/invalid starts, partial endpoints and cross-bucket/cross-date/reversed intervals are preserved in the local snapshot and excluded from the time-specific grid. This is a conservative modeling choice, not proof those crimes did not happen. There is no guessed midnight or uniform fabricated incident time. The model does not resolve ambiguous fall-back clock offsets or repair source DST/transcription errors.

## Grid model, distinct from source facts

The cell size is 250m. Latitude scale is 111320m/degree; longitude scale is `111320*cos(40.7 degrees)`. This is Arazul's approximate local projection, not exact survey geometry. Cell IDs use `row_column` with a southwest origin; a three-cell/750m halo surrounds the official NYC jurisdiction bounding rectangle. Every cell is serialized, including zero cells.

Each eligible complaint has weight 1. There are no SP severity coefficients, inferred driving multipliers, decay weights, or resident/footfall denominators. Unknown-time records contribute no fabricated bucket count. For cell counts `c_b`, total `n`, and global known-time bucket proportions `p_b`:

`adjusted_b = (n/(n+20))*c_b + (20/(n+20))*n*p_b`.

This preserves the cell's total activity while shrinking sparse temporal proportions toward the NYC known-time distribution. Empty cells remain empty before smoothing. The 20-complaint shrinkage parameter is inherited as a design choice from the prior model's documented shrink20 approach; this exact formula is now explicit and is not asserted to reconstruct unavailable Brisa source code.

Cross smoothing uses 0.5 center and 0.125 each north/south/east/west neighbor. Available neighbors are renormalized at the outer halo boundary. Planning-area cells have surrounding support. Let `q` be at least 1 and otherwise the nearest-rank p90 of positive smoothed bucket values in planning-rectangle cell centers. The runtime value is `v/(v+q)`, rounded to nine decimals. This percentile/normalization is a model choice. Four bucket arrays are mirrored into `driving` for legacy shape compatibility; only `walking` is declared supported.

Arazul then retains its existing 70% departure bucket + 30% daily average and weighted route-distance integral. The 15% selection threshold remains unchanged. A lower model score is a lower index for these selected published complaints; it is not a validated '15% lower chance of crime'. `displayScale=24` is an overlay rendering factor only.

The model version is `nyc-native-v1`. The prior NYC import covered Central Manhattan and normalized its own smaller package. This full-city direct-source model is independently normalized and will not have identical numbers. Numeric comparisons with the old NYC file, SP or other cities are not valid calibrations of safety.

## Coverage and location uncertainty

Official NYC borough boundaries **including water jurisdiction** avoid treating New Jersey inside the full city's bounding rectangle as a low-report NYC area. This polygon is an administrative coverage mask, not a claim about safety on water or bridge-specific incidents. The provided helper validates entire polyline segments; checking only endpoints would miss a route leaving and re-entering NYC. The full grid must not be activated until the loader and routeCoverage use this guard. The overlay also requires clipping/masking.

NYPD latitude/longitude are approximate midblock coordinates in WGS84/EPSG:4326. Rape and sex crimes are relocated to precinct station houses. Other un-geocodable records can also use station-house coordinates without a reliable fallback flag. Parks/beaches can be placed on bordering streets. These biases cannot be eliminated by the converter. A 250m cell does not restore undisclosed precise addresses. Outdoor records do not demonstrate strangers or pedestrian victims. Complaints use the most serious offense, and attempted murder appears as felony assault; no source labels are reverse-engineered.

## Querying within X metres of a route

The executable `scripts/query-nyc-route.py` runs against the supplied snapshot: build a padded route box, filter eligible complaint points, then calculate the minimum spherical point-to-segment distance over every segment of the GeoJSON LineString. Each complaint is counted once even when near multiple segments. A bounding box or circle around the start point alone is not a route corridor. The demonstration GeoJSON is a straight line only; substitute your actual Google route geometry.

For a server fetch optimization, Socrata's official `within_box(lat_lon, north, west, south, east)` function can prefilter complaint rows; the same minimum-distance calculation is still necessary. If using spatial API filtering, missing coordinates are not in the fetched result and must not be described as zero citywide missing records. The full-city download here does not use a spatial server filter; missing coordinates remain auditable within the candidate query scope.

Live Socrata calls are deliberately not wired into the frontend. The fixed, hashed local snapshot supports reproducibility and avoids comparing candidate routes against different moving releases.

## Official sources (checked October 4, 2026 UTC)

- Historic complaints and attached dictionary/footnotes: https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Historic/qgea-i56i
- Current YTD complaints: https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Current-Year-To-Date-/5uac-w243
- NYPD complaint footnotes (attachment, notes 3–6, 10–12, 17–18): https://data.cityofnewyork.us/api/views/qgea-i56i/files/b21ec89f-4d7b-494e-b2e9-f69ae7f4c228?download=true
- Field definitions and current attachment identifiers: https://data.cityofnewyork.us/api/views/qgea-i56i.json and https://data.cityofnewyork.us/api/views/5uac-w243.json
- NYC DCP borough jurisdiction boundaries including water: https://data.cityofnewyork.us/City-Government/Borough-Boundaries-water-areas-included-/wh2p-dxnf
- Socrata box function: https://dev.socrata.com/docs/functions/within_box
- Socrata paging: https://dev.socrata.com/docs/queries/

The script uses the working SODA 2 `/resource/{id}.json` endpoint with explicit order/limit/offset. SODA 3 uses different POST query/pagination parameters and requires authentication or an application token. Do not mix the two endpoint contracts. Optional `SOCRATA_APP_TOKEN` is read from the environment; no token is included in the package.
