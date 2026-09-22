# Geocoder recommendation — Milestone 1 location step

**Check date:** 2026-09-22. Prices and terms below are copied from the linked official pages on that date. Recheck before purchase. This is not a legal opinion on any provider's terms.

The location step needs autocomplete for an NYC address or intersection, then a user-confirmed pin stored on the issue. The basemap is MapLibre plus a Protomaps extract, not a Google or Mapbox map. Volume assumption: about 1,000 geocode requests/day at launch, about 10,000/day later.

## Recommendation

**Use NYC Planning Labs GeoSearch** (`https://geosearch.planninglabs.nyc`) for Milestone 1 autocomplete.

It is a free, keyless Pelias API over the city's Property Address Directory (PAD). It has `/v2/autocomplete` and `/v2/search`, returns GeoJSON with coordinates in longitude-then-latitude order, and is the geocoder NYC Planning uses in ZoLa. No per-query fee is published.

**Fallback:** self-host the same stack from [NYCPlanning/labs-geosearch-docker](https://github.com/NYCPlanning/labs-geosearch-docker) when the hosted service is down, rate-limits you, or you want a copy you control. Pelias itself is MIT-licensed software ([pelias.io](https://www.pelias.io/)). The address data is PAD; confirm the current Bytes of the Big Apple license on the Department of City Planning site before relying on a self-hosted copy. Do not start that host for Milestone 1.

**What to persist.** After the user confirms a suggestion or drops a pin, store only:

- latitude and longitude (SRID 4326)
- the label string the user accepted (for example `120 Broadway, Manhattan`)
- `precision = user_supplied`
- a source tag: `geosearch` or `user_pin`

Do not store the raw GeoJSON response. GeoSearch publishes no storage clause and no SLA, so treat the hosted API as a convenience, not a system of record. The pin the moderator publishes is the product's own coordinate.

Call `/autocomplete` while typing, debounced (the docs require throttling). Call `/search` when the user pastes a full address. Pass `focus.point.lat` / `focus.point.lon` from the map center. Reject results outside the NYC boundary polygon in our database even if the provider returns them. If autocomplete misses — intersections, parks, nicknames — the existing "drop a pin" step is the path, not a second provider.

## Why the others lose

| Provider | Verdict |
|---|---|
| NYC GeoSearch | Use. Authoritative NYC addresses, autocomplete, $0, no key. |
| Self-hosted Pelias + PAD | Fallback. Same API, you pay for a VM instead of queries. |
| Public Nominatim | Do not use for autocomplete. Hard cap of 1 request/second for the whole app. |
| Mapbox Geocoding | Do not use. Temporary results cannot be stored. Permanent results cannot be distributed, and a public issue pin is distribution. |
| Google Geocoding | Do not use. Results may not be shown with a non-Google map, and cached coordinates may not be shared across users. |

## NYC GeoSearch

Sources: [API docs](https://geosearch.planninglabs.nyc/docs/), [about page](https://geosearch.planninglabs.nyc/), [docker project](https://github.com/NYCPlanning/labs-geosearch-docker).

| Question | What is published |
|---|---|
| Commercial use | No terms-of-use page found. The service is a public city API used by Planning's own apps. Absence of a published prohibition is not a grant. Keep the adapter swappable. |
| Store coordinates | No storage clause published. Persist only the confirmed pin and label, as above. |
| Store raw responses | Not forbidden in writing. Still don't. They add no product value and would have to be purged if a later terms page restricts them. |
| Rate limit | Not published. Docs say autocomplete traffic must be throttled because it tracks keystrokes. |
| Autocomplete | Yes. `/v2/autocomplete?text=`. `/v2/search` for a pasted full address. |
| NYC intersections | Not documented. The dataset is PAD address rows (tax lots and buildings), not an intersection layer. Expect misses on "Atlantic Ave & Flatbush Ave". Pin drop covers that. |
| Cost at 1,000/day | $0. No meter is published. |
| Cost at 10,000/day | $0 on the published pricing (there is none). This is the volume where a missing rate limit becomes the risk, which is why the fallback exists. |

## Public Nominatim

Source: [OSMF Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

| Question | What is published |
|---|---|
| Commercial use | Allowed only within the policy. The policy can change without notice, and access can be withdrawn. Commercial apps must be able to switch providers. |
| Store results | Required to cache results. Data is ODbL; share-alike applies, with a note that small extracts are likely fair dealing. |
| Rate limit | Absolute maximum 1 request/second for the whole application, one machine, one thread. Repeated identical uncached queries can be blocked. |
| Autocomplete | Not forbidden by name. A keystroke-driven typeahead will break the 1 request/second cap as soon as two people type at once. |
| Cost | $0. Unusable as the production autocomplete anyway. |

## Pelias, self-hosted

Source: [pelias.io](https://www.pelias.io/).

MIT-licensed software, no API key, autocomplete included. You supply the data. For this app the useful dataset is PAD via the NYC Planning docker project, not a planet build. License cost is $0. Hosting cost is whatever VM runs Elasticsearch; not a published Pelias price. Geocode Earth is the maintainers' hosted option; its price was not taken from an official price page in this pass, so it is **not published** here.

Store whatever your copy of the data's license allows. For PAD, read the current DCP license before storing raw records. Confirmed pins are the app's own data either way.

## Mapbox Geocoding v6

Sources: [Geocoding API docs](https://docs.mapbox.com/api/search/geocoding), [temporary vs permanent](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/), [pricing](https://www.mapbox.com/pricing).

| Question | What is published |
|---|---|
| Temporary (default) | Display and use during the session. "You cannot store the coordinate results for future use." |
| Permanent (`permanent=true`) | May cache and store indefinitely. Requires a card or enterprise contract. Priced separately. "Results … are only available for your own personal or business use, and cannot be used for distribution or sublicense." A public issue map distributes the coordinate. |
| Autocomplete | Yes, via the Search APIs. |
| Cost, temporary | 100,000 requests/month included, then $0.75 per 1,000 up to 500,000. |
| Cost, permanent | $5.00 per 1,000 for the first 500,000. No free tier published. |
| 1,000 requests/day | ~30,000/month. Temporary: inside the free tier, $0, but the pin cannot be stored. Permanent: about $150/month. |
| 10,000 requests/day | ~300,000/month. Temporary: 100,000 free + 200,000 × $0.75/1,000 = $150, and still cannot store. Permanent: 300,000 × $5/1,000 = $1,500. |

## Google Geocoding

Sources: [pricing list](https://developers.google.com/maps/billing-and-pricing/pricing) (fetched 2026-09-22), [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies) (page updated 2026-09-17), [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).

| Question | What is published |
|---|---|
| With our map | Section 6.2: "Customer must not use Google Maps Content from the Geocoding API in conjunction with a non-Google map." MapLibre disqualifies it. |
| Store coordinates | Section 6.3.1: lat/lng may be cached 30 days, then deleted. Section 6.3.2: indefinite cache of lat/lng and address is allowed only for the end user who made the request, and "must not be used across multiple End Users." A published issue pin is used by every visitor. |
| Place IDs | Exempt from the caching restriction. Storing a place ID does not give a coordinate you can put on a public map. |
| Autocomplete | Separate SKU, "Autocomplete Requests", not the Geocoding SKU. |
| Geocoding price | 10,000 free requests/month, then $5.00 per 1,000 up to 100,000, then $4.00 per 1,000 up to 500,000. |
| Autocomplete price | 10,000 free/month, then $2.83 per 1,000 up to 100,000. |
| 1,000 geocodes/day | ~30,000/month. 10,000 free + 20,000 × $5/1,000 = $100, before autocomplete. |
| 10,000 geocodes/day | ~300,000/month. 10,000 free + 90,000 × $5/1,000 + 200,000 × $4/1,000 = $1,250, before autocomplete. |

## Implementation notes for the adapter

- One `Geocoder` interface. Milestone 1 implementation calls GeoSearch. A second implementation can target the self-hosted Pelias later without a schema change.
- Debounce autocomplete 250–400 ms, one in-flight request, drop stale responses.
- Do not call the geocoder on map pan, support clicks, or page views.
- Normalize the query (trim, collapse whitespace, lower-case) if you add a short cache later. GeoSearch's own terms do not grant a 30-day cache, so keep any cache in-memory and short.
- Show "NYC Dept. of City Planning" attribution near the autocomplete results.
