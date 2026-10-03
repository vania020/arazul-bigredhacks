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

## Run locally with the hosted risk dataset

```sh
# Install the exact versions in the existing Bun lockfile; Bun need not be installed globally.
npm exec --yes --package=bun -- bun install --frozen-lockfile
npm run dev:local
```

Open `http://127.0.0.1:5180/`. This command enables the asset proxy already included in Lovable's Vite configuration, using the project ID in `src/assets/risk-grid.json.asset.json`. The 11 MB risk grid is still fetched at runtime. Without the proxy, ordinary `npm run dev` cannot resolve that Lovable-hosted asset locally and the app displays **Demo exposure layer** using synthetic data. Set `LOVABLE_PREVIEW_HOST` to a different accessible preview hostname if the team changes hosting.

Google Maps reads `VITE_GOOGLE_MAPS_API_KEY` from the local Vite environment. Map display, address suggestions and route calculation require the corresponding Google Maps, Places and Routes services to be available to that key, including permission for the local origin. The demo-trip button fills the form; click **Find routes** to calculate it.

Run `npm test` and `npm run build` to check routing and the production build. The existing unit test verifies route matching; map and risk-data availability also need a browser check. Local setup does not publish the app or change Lovable hosting.
