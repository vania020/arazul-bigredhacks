# Arazul NYC conversion: files and upload instructions

Prepared for https://github.com/vania020/arazul-bigredhacks on October 4, 2026. The inspected commit was `62c2da94ed3db59236484e195016381ef1bdf39e`.

## What you have

This is real downloaded NYPD data converted to Arazul's grid schema. It covers all five boroughs, uses a **2025 occurrence window**, and includes available late reports from the YTD release whose reports end **June 30, 2026**. The full source labels/codes survive in the local records; no NYPD offense is renamed into a supposedly equivalent São Paulo legal category.

**34,067 eligible complaints**, grouped into **39,585 cells (203 x 195)** of 250m, with four local six-hour windows. This is a selected reported outdoor-complaint exposure index for walking, not NYC's all-crime count or a probability of harm. The geographic expansion and NYC normalization will change NYC scores from the existing Manhattan import. Route-selection mathematics is unchanged by these data files.

| Borough | Eligible complaints |
| --- | ---: |
| Bronx | 9,032 |
| Brooklyn | 8,784 |
| Manhattan | 8,393 |
| Queens | 7,068 |
| Staten Island | 790 |
| Total | 34,067 |

| Native NYPD category | Eligible complaints |
| --- | ---: |
| ROBBERY / 105 | 6,986 |
| FELONY ASSAULT / 106 | 7,666 |
| GRAND LARCENY / 109, selected from-person PD subtypes only | 2,891 |
| ASSAULT 3 & RELATED OFFENSES / 344 | 16,524 |

The source query downloaded 48,766 historic candidate rows and 7,609 current-release rows with 2025 occurrence starts. There were no overlapping persistent IDs in this snapshot. Of 56,375 merged rows, 22,308 were excluded; the mutually exclusive first-reason counts reconcile exactly. Do not call 56,375 'all 2025 NYC crimes': the historic query selected four categories/two premises; the YTD query intentionally fetched all categories for 2025 occurrences to capture late reports and changed classifications.

| First exclusion reason | Rows |
| --- | ---: |
| Grand larceny outside selected from-person subtypes | 14,680 |
| Other native category in current-release late-report records | 5,380 |
| Occurrence interval crosses date or six-hour bucket | 1,705 |
| Other/missing premises | 513 |
| Incomplete/invalid interval | 29 |
| Other/missing borough | 1 |
| Total excluded | 22,308 |

First-reason counts are additive. The audit also lists all applicable reasons per record; those overlapping counts are **not** additive. Missing coordinates are not manufactured as 0/0, and the actual source query did not use a geographic filter that would silently remove unlocated candidate rows.

## Main files

| File | Purpose | Commit/upload to the repository? |
| --- | --- | --- |
| `public/data/nyc-native.json` | Full-city aggregate runtime candidate | Yes, but activate only after the coverage guard is integrated |
| `public/data/nyc-coverage.geojson` | Official five-borough jurisdiction polygons, water included | Yes |
| `config/nyc-policy.json` | Explicit filters/model choices | Yes |
| `scripts/build-nyc-data.py` | Repeatable official-source download/offline rebuild | Yes |
| `scripts/query-nyc-route.py` | Find eligible published points within X metres of actual route geometry | Yes |
| `src/services/nycCoverage.ts` | Whole-polyline coverage check; rejects routes leaving NYC | Yes |
| `src/test/nyc-coverage.test.ts` | Vitest geometry checks for the app | Yes |
| `tests/` | Python conversion/distance tests and Node official-boundary checks | Yes |
| `docs/NYC_TRANSLATION.md` | Category semantics, formulas, limitations, official links | Yes |
| `docs/nyc-audit.json` | Actual counts, query predicates, dates and hashes | Yes |
| `docs/example-route.geojson`, `docs/example-route-audit.json` | Straight-line demonstration and query results | Yes; not a verified walking route |
| `CLAUDE_PROMPT.md` | Ready-to-paste integration task | Yes or keep local |
| `private-data/nyc/snapshot.json.gz` | Source-field snapshot for offline rebuild | Keep local; do not commit |
| `private-data/nyc/normalized-complaints.jsonl.gz` | Preserved native fields + separate eligibility analysis | Keep local; do not commit |
| `NYC_START_HERE.md`, `docs/VALIDATION.md`, `docs/package-checksums.json` | Instructions, verified checks and package integrity | Yes |

**Uploading the grid alone is not enough.** The current app only checks a rectangular coverage box, which contains New Jersey in a full-city NYC view. The prompt integrates polygon coverage, safe boundary loading and overlay clipping before selecting the new asset. The candidate is intentionally named `nyc-native.json` rather than overwriting the existing `nyc.json`. These files do not modify the application or publish changes until you integrate them.

## Upload using your VS Code repository (recommended)

1. Download `arazul-nyc-conversion.zip` and choose **Extract All** on Windows.
2. Open your existing `arazul-bigredhacks` folder in VS Code.
3. Create a branch from your current working version using the branch menu, or run `git switch -c nyc-native-data`. Preserve any existing uncommitted work.
4. Copy the contents of the extracted `arazul-nyc-conversion` folder into your repository root. Merge the existing `public`, `src`, `scripts` and `docs` folders when asked. None of the supplied files replaces the repository's `README.md` or São Paulo grid. Keep `private-data` local if you want reproducibility.
5. Add these lines to the repository's existing `.gitignore` before staging:

```gitignore
/private-data/nyc/
__pycache__/
*.pyc
```

6. Open `CLAUDE_PROMPT.md`, copy its task text and paste it into Claude Code in VS Code. Let Claude implement and test the loader, polygon coverage, NYC configuration and disclosure changes.
7. Check Source Control. Confirm `private-data/nyc/` is not staged. Review the changed files and passing tests. Commit to your new branch with a message such as `Add auditable NYPD-native NYC exposure data`.
8. Use **Publish Branch** / **Push**. On GitHub, create a pull request into the connected branch. Merging/pushing to the connected Lovable branch can update Lovable, so review the working result first. Do not force-push or rewrite published history.

A ZIP uploaded to GitHub stays a ZIP; GitHub will not automatically unpack its contents into `public/data`. Extract it and upload the actual folders/files.

## Upload through GitHub's website

If you prefer the website, create a new branch, select **Add file > Upload files**, and drag the **extracted files/folders** into the repository root. Exclude `private-data/nyc` and `__pycache__`. Commit to the new branch. Then open/sync that branch in VS Code and give Claude Code the prompt; the data-upload commit alone does not integrate coverage. Do not activate the candidate file manually before the guard is implemented.

## Run the included checks

From the repository root on Windows:

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python scripts/build-nyc-data.py --input private-data/nyc/snapshot.json.gz --output-root nyc-rebuild-check
python scripts/query-nyc-route.py --route docs/example-route.geojson --radius-m 250
```

Use `python3` instead of `python` if that is your installed command. Python 3.10+ is sufficient and there are no extra Python dependencies. Replace the example's straight line with an actual GeoJSON LineString for your routed walking path. Add `--include-records --output private-data/nyc/route-matches.json` to inspect native complaint rows locally.

The Node boundary smoke check requires Node 22.18+ (24 works):

```sh
node --experimental-strip-types tests/test_coverage.mjs
```

After integration, run the repository's `npm test` and `npm run build`, or the existing package-manager equivalents. They have not been run as a full application integration in this deliverable; the application changes are the task in the supplied prompt.

To download a new official snapshot instead of rebuilding this one:

```powershell
python scripts/build-nyc-data.py
```

The policy's occurrence year is intentionally fixed to 2025. Changing dates/categories/weights is a new documented dataset/model version, not a silent freshness update. API requests may be slow; the script checks complete counts and release stability. An optional Socrata application token can be supplied through `SOCRATA_APP_TOKEN`; no credential is included.

The raw incident-level archives remain compressed. Python's gzip module can read them; 7-Zip can extract them on Windows. The normalization file contains JSON Lines, one preserved source complaint plus separate analysis fields per line. Do not treat analytical bucket/group names as official NYPD source fields.

## Accuracy boundaries

Rape/sex-offense points are deliberately assigned to station houses and excluded. Other un-geocodable complaints may also have station-house locations; this residual bias cannot be reliably removed. Attempted murder stays in NYPD felony assault. Homicide and several other offense categories are not in this limited baseline. Outdoor premises do not prove stranger/pedestrian encounters. The index is independently normalized within NYC and cannot be numerically compared with SP. The earlier suggested severity/decay values were illustrative model examples, not official NYPD measurements, and are not applied here.

Full explanation: `docs/NYC_TRANSLATION.md`. Exact future integration task: `CLAUDE_PROMPT.md`.
