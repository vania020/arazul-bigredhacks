# ARAZUL feature behavior

## Historical route comparison

Choose a city, endpoints, walking/driving mode, departure hour and extra-time allowance, then request routes. Google supplies candidate routes and travel estimates. ARAZUL scores cached candidates against the city's historical incident grid and applies the configured improvement threshold within the time allowance. Exposure is a prototype comparison metric, not a safety probability or guarantee.

Google routes may extend beyond incident coverage. Missing grids, unsupported modes, synthetic data and routes outside documented coverage must not acquire a misleading exposure comparison. Source coverage, period and offence definitions differ across cities.

## Latest published activity

Supported official sources supply a separate optional overlay. Latest-published does not mean verified real-time: dispatch calls may be unverified, while reports can appear after publication delays. The interface distinguishes source-check time, latest source event, published window and cadence; checking now does not make the underlying source more current.

Approximate 250 m groups require at least two records. Individual reports are not persisted to browser storage. Activity does not affect the historical route score. Off remains off across city switches. Unsupported cities display an explicit absence of a verified recent source.

## Time-of-day comparison

Four six-hour windows compare the same route using sources that include incident hours. Selecting a window re-scores cached geometry locally; it does not refresh Google traffic estimates. The selected city supplies the timezone. All-day datasets such as London's monthly source do not produce invented hourly results. Missing coverage or unsupported modes suppress the comparison.

## Share a trip

Share is an explicit action. Before a click, the app does not generate an endpoint URL, update location history with coordinates or persist trip history. The generated link places versioned city, endpoint labels/coordinates, mode, hour and extra-time budget in the URL fragment. Fragments are not part of the HTTP request to the host, but the link contains private trip details and recipients can read them. This is not encrypted sharing.

The receiver validates known fields, city, lengths, coordinate ranges, mode and numeric limits, rejects duplicates and malformed values, then prefills the trip. The incoming fragment is removed from the address bar after reading. No route request starts until the user clicks Find routes. A shared trip is recalculated and may differ from the sender's route.

Native sharing is attempted on the click; clipboard and a selectable read-only field provide fallbacks. A local-server link is only accessible to devices that can reach that server.

## Download a journey summary

The text download includes the selected city and timezone, endpoints, departure selection, transport mode, extra-time allowance, selected route identifier, estimated duration and distance, plus the historical dataset's source and period. Exposure metrics appear only with a supported, covered, non-demo comparison. No geometry or GPX is exported. Estimates and historical incident patterns are not guarantees.

## Language and boundaries

Controls and summaries support English, Portuguese and Spanish using the existing language selection. In-app navigation follows the selected Arazul route with browser GPS and Google turn instructions (see the README). There is no account service, automated incident-ingestion backend or verified real-time crime feed. The optional Google Maps handoff recalculates routes independently.
