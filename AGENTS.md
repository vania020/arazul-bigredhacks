<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## ARAZUL architecture
- All exposure weights/thresholds live in src/config/exposureConfig.ts — single source of truth for scoring.
- risk-grid.json is served as a hosted asset and fetched at runtime (never bundled) — it is ~11 MB.
- Recommendation is recomputed locally from cached route candidates on hour/extra-time changes — avoids extra Google calls.
- Map colors are read from CSS tokens at runtime (src/map/cssColor.ts) — no hex in components.
- Route endpoints use Google float-pane overlays and exposure stays in the overlay layer, so labeled markers and route strokes remain above the grid.
