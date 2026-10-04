# ARAZUL

**Navigate with more context.**

ARAZUL is a context-aware navigation platform that helps users compare the fastest route with an alternative route that has lower exposure to historically reported public-safety incidents.

Instead of optimizing only for time, distance, and traffic, ARAZUL also considers:

- reported incident location
- incident type
- time of day
- transportation mode
- route exposure
- how much extra travel time the user is willing to accept

The goal is not to label neighborhoods as "safe" or "dangerous."  
ARAZUL helps users make more informed navigation decisions using publicly available incident data.

Built for **BigRed//Hacks 2026 at Cornell University** under the theme **Navigation**.

---

## The Problem

Traditional navigation apps optimize primarily for:

- shortest travel time
- distance
- traffic conditions

But the fastest route is not always the route a person would choose if they had more local context.

This is especially relevant when someone is:

- traveling through an unfamiliar part of their city
- visiting another city
- walking or driving at night
- using rideshare services
- navigating areas where they do not have local knowledge

ARAZUL asks a different question:

> **Among reasonable ways to get from A to B, which route has lower exposure to relevant reported incidents without creating an unreasonable detour?**

---

## Our Inspiration

The project was inspired by experiences from Latin American cities, where local knowledge often plays an important role in how people choose routes.

One of our teammates from São Paulo described rideshare trips where navigation applications would redirect drivers through unfamiliar streets simply because those routes were faster.

That led us to ask:

> What if navigation could incorporate safety context while still respecting travel time?

São Paulo is our first implementation because of the availability of granular public incident data, but the architecture is designed to support additional cities across Latin America in the future.

---

## How ARAZUL Works

### 1. Choose a trip

The user enters:

- origin
- destination
- transportation mode
- departure time
- maximum extra travel time

Current MVP modes:

- Walking
- Car / Rideshare

---

### 2. Generate candidate routes

ARAZUL uses Google Maps routing to generate possible routes between the origin and destination.

The system also evaluates additional detours around higher-exposure segments when appropriate.

---

### 3. Calculate reported-incident exposure

ARAZUL scores each route using a contextual exposure model.

Each historical incident can contribute differently depending on:

```text
incident severity
× transportation-mode relevance
× time-of-day relevance
× recency
× proximity to route

```

Source preprocessing differs by city; the formula above describes the conceptual model, not a claim that every dataset applies recency weighting or identical factors. See the per-city provenance documents below for the implemented source filters and aggregation.

## Run locally with the hosted risk dataset

```sh
git clone https://github.com/vania020/arazul-bigredhacks.git
cd arazul-bigredhacks
cp .env.example .env.local
# Set VITE_GOOGLE_MAPS_API_KEY in .env.local.
# Install the exact versions in the existing Bun lockfile; Bun need not be installed globally.
npm exec --yes --package=bun -- bun install --frozen-lockfile
npm run dev
```

Open `http://localhost:8080/`. Both `npm run dev` and `npm run dev:local` (same app, pinned to `http://127.0.0.1:5180/`) enable the asset proxy already included in Lovable's Vite configuration: `vite.config.ts` and `scripts/dev-local.mjs` share `scripts/lovable-asset-host.mjs`, which defaults `LOVABLE_PREVIEW_HOST` to this project's preview host from the project ID in `src/assets/risk-grid.json.asset.json`. The proxy is dev-server only; production builds and Lovable's own sandbox are unchanged. The 11 MB risk grid is still fetched at runtime. If the hosted asset cannot be reached, routing remains available, but exposure scoring is explicitly unavailable; synthetic fallback data is never substituted. Set `LOVABLE_PREVIEW_HOST` to a different accessible preview hostname if the team changes hosting.

Google Maps reads `VITE_GOOGLE_MAPS_API_KEY` from the local Vite environment. `.env.local` stays ignored by Git; copy `.env.example` and supply your browser-restricted key. Map display, address suggestions and route calculation require the corresponding Google Maps, Places and Routes services to be available to that key, including permission for the local origin. The demo-trip button fills the form; click **Find routes** to calculate it.

Run `npm test` and `npm run build` to check routing and the production build. Tests cover route matching, city switching, data validation, projections, coverage exclusions, unsupported travel modes, unavailable sources and timezone/DST handling. Map and risk-data availability also need a browser check. Local setup does not publish the app or change Lovable hosting.

## What the codebase does

This is an independent app that uses Google Maps APIs, not a Chrome extension or a modification to the Google Maps app. React 19 and TypeScript provide the interface; TanStack Start handles routing and the server-rendered shell; Vite builds it; Tailwind and Radix provide styling and controls. Nitro prepares the Cloudflare deployment output. `src/server.ts` handles server rendering/error responses; it is not a custom directions or crime-ingestion backend. The comparison itself runs in the browser. There is no trained ML model, verified real-time crime feed, account database or background ingestion service in this codebase. The optional latest-published activity overlay reads supported official sources separately from the historical route model.

The request flow is: choose city/endpoints/mode → Google route candidates → sample each route approximately every 30 metres → look up historical grid values → multiply by route length and sum → compare with the fastest option inside the extra-time budget. Time-aware sources blend 70% selected six-hour bucket with 30% all-day average. A longer route is recommended only if its modeled exposure is at least 15% lower. These are tunable prototype rules, not calibrated probabilities or a proven safety model.

To look beyond Google's initial alternatives, `detourService.ts` finds higher-scoring segments of the fastest route, offsets waypoints around them, and makes up to six additional Google requests. It cannot tell Google to forbid arbitrary crime polygons and does not search every possible street route. Selected routes can be navigated inside Arazul (see [In-app navigation](#in-app-navigation)). The optional Google Maps handoff passes endpoints and available detour waypoints, but Google recalculates and may choose a different route.

Changing the historical hour or detour allowance re-scores cached candidates locally. It does not refresh Google's travel-time estimates; changing travel mode runs a new route search. Departure calculations use the selected city's timezone and handle daylight-saving transitions. Route caches are separated by city, endpoints, mode and departure selection. A city switch resets the view and prevents an earlier request from overwriting the new city.

## Cities and incident coverage

| City | Incident coverage | Exposure comparison |
| --- | --- | --- |
| São Paulo | Team-provided SSP-SP metro grid, 2025-01-01 to 2026-08-31 | Walking/driving, four six-hour windows; original preprocessing pipeline is not in this repository |
| New York City | Central Manhattan, selected outdoor reports, 2025 | Walking only, four six-hour windows |
| Chicago | Loop, selected outdoor reports, 2025 | Walking only, four six-hour windows |
| San Francisco | Downtown, selected street/public-place robbery reports, 2025 | Walking only, four six-hour windows |
| London | Central London rectangle, selected published categories, August 2026 | Walking only; monthly source has no incident hours |
| Lima | Google routing available | No verified incident dataset connected; no exposure ranking |

Google can return routes beyond the coverage rectangles. Exposure comparison requires every sampled route in the comparison to stay within documented coverage and use a supported travel mode. Missing data never means low risk. London does not acquire invented nighttime scores. City sources, offence selections, periods and normalization differ; percentages compare routes within one dataset, not the safety of one city against another. See [US provenance](docs/US_CITY_DATA.md), [London provenance](docs/LONDON_DATA.md), and [Lima source audit](docs/LIMA_DATA.md).

## Where to make changes

| Area | Files |
| --- | --- |
| City registry, map centers, search countries, timezones and examples | `src/config/cities.ts`, `src/context/CityContext.tsx` |
| Main UI and request lifecycle | `src/components/AppShell.tsx`, `src/pages/` |
| Google loading, Places and routing | `src/services/googleMaps.ts`, `src/components/LocationSearch.tsx`, `src/services/routingService.ts` |
| Incident data validation/loading | `src/services/riskDataService.ts`, `public/data/` |
| Scoring and detour generation | `src/services/exposureService.ts`, `src/services/detourService.ts`, `src/config/exposureConfig.ts` |
| Map rendering and overlays | `src/map/` |
| In-app navigation (GPS matching, rerouting, voice) and its thresholds | `src/navigation/`, `src/components/navigation/`, `src/config/navigationConfig.ts` |
| English, Portuguese and Spanish text | `src/i18n/` |
| Reproducible imported city aggregates | `scripts/import-brisa-cities.py`, `scripts/build-london-data.py` |

A new city needs an entry in the registry, verified source provenance and spatial coverage, a runtime aggregate with supported modes/time resolution, and regression tests. A routing-only city can use `datasetUrl: null`. Production use still needs Google API billing/restrictions, reliable hosting for runtime datasets, a refresh pipeline and monitoring. The original Brisa native app projects are not part of Arazul; selected activity, time-comparison and trip-sharing features have been adapted for this web app.

## In-app navigation

**Start navigation** follows the selected Arazul route itself: Arazul chooses the route, Google supplies its geometry, ETA and turn instructions (requested with the route search, so starting costs no extra request), and the browser supplies live GPS through `navigator.geolocation.watchPosition`, which starts only after the user presses Start and stops on end, arrival, error or unmount. Positions stay in memory; no location history is stored or sent anywhere except as the origin of a reroute request to Google.

GPS readings are matched to the route locally (accuracy-weighted corridor, windowed matching, step advance only after passing a maneuver). Rerouting needs several trusted off-route readings over at least six seconds, has a cooldown with backoff and a per-trip cap, and keeps the user's choice: **Recommended** replans with Arazul's scoring (only routes inside data coverage are compared, otherwise it rejoins the selected route, otherwise it reports that the choice can't be kept), **Fastest** replans for the fastest route, and a chosen **alternative** is rejoined. Arazul never substitutes Google's default route. Voice prompts use the browser's `speechSynthesis` and can be muted. All thresholds are documented in `src/config/navigationConfig.ts`.

This is web navigation: browsers may pause GPS when the screen locks or the tab is backgrounded (a screen wake lock is requested where supported), and geolocation requires a secure page (`https://` or `localhost`/`127.0.0.1`).

## Activity, departure comparisons and trip sharing

The **Latest published activity** layer shows approximate groups from supported official feeds, with source cadence, last check, latest available event and published window. It is latest-published information, **not verified real-time crime**: dispatch calls may be unverified and published reports can be delayed. Groups use approximate 250 m cells with at least two records; they do not change historical route scores. The Off setting remains off when switching cities. Cities without a verified source explicitly show that limitation.

The time-of-day comparison uses four six-hour windows only when the historical source includes incident hours. It compares the same selected route locally; it does not fetch new Google routes or traffic estimates. All-day sources such as London have no invented hourly chart. Missing data, unsupported modes and routes outside coverage do not receive exposure scores.

**Share trip** creates a URL fragment only after the user clicks Share. Endpoint labels or coordinates are not automatically written into the address bar or persisted as trip history. A link intentionally contains those endpoints, so share it only with intended recipients. Opening it validates the payload, prefills the selected city and trip, then removes the fragment from the address bar. It does not automatically call Google routing: the recipient clicks **Find routes**. Recalculated routes and estimates may change. Native sharing falls back to clipboard or a selectable field; local-server links require network access to that server.

**Download summary** saves a plain-text account of the selected trip, city/timezone, mode, departure selection, extra-time budget, route distance/time and historical dataset source/period. Unavailable exposure scores are omitted. It exports no GPX or Google route geometry. See [feature behavior and limitations](docs/FEATURES.md).
