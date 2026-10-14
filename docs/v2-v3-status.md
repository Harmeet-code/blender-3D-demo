# V2 / V3 implementation status — 13 October 2026

This reconciles the OpenCode additions with the subsequent Codex/Luna review. It supersedes contradictory “done” versus “gap” notes in the earlier execution plan. Implementation and checks below do not make the whole V2/V3 vision production-ready.

## Implemented

- **Assets:** 25 new procedural identities added to the existing 22: 47 identities / 52 generated quality recipes. Catalog dispatch, authoring, compound physical metadata and existing shared rendering/cache ownership recognize them. No native asset deletion was performed in this pass. Expansion assets have code recipes, not Blender source files; the prior nonexistent `.blend` provenance paths have been replaced with `not-applicable:procedural`.
- **Wayfinding:** amenity categories, synonyms/icons/search, nearest amenities evaluated through actual Recast routes, saved/recent destinations, persistent step-free/floor/walk preferences, touch joystick, floor-following minimap/heading, public availability/operations overlays and capped exhibitor branding.
- **Visit tools:** route/entrance links, lazy-loaded QR encoding, iframe embed and touch kiosk presentation, idle floor cycle, mobile placement adjustments. Shared floor-only links apply the requested floor. Links never automatically start walking; users review a preview.
- **Offline images:** same-origin public content-addressed images only, 64 MiB / 128-entry CacheStorage budget, serialized LRU writes and explicit save/remove controls. Mutable layout/API/HTML URLs are never cached by this worker. Changed image hashes produce new keys without manual cache deletion. This is offline image storage, not an installed offline application; JS, published layout and auth still need their respective delivery paths. Browser quota/HTTPS/scope and external images remain platform limits.
- **Starter composition:** six starter kits (convention, mall, hospital, sports, airport, office), actual item checkboxes/quantities, exact quantity accounting, stable per-asset IDs and bounded placement with explicit overflow errors. Sized booth quantities produce rooms with exact feet/metre dimensions and procedural asset references, without duplicate authored booth instances. Required vertical portal/landing fixtures are separate from authored quantity totals. Preview shows replacement/counts; stale source or unsaved JSON text blocks confirmation; confirmed replacement preserves event/building identity and Undo history.
- **Venue management:** local first-administrator bootstrap, password/session access, server-enforced roles/event scoping, user access editing, blank events/templates/private drafts, claim approval/branding/availability/pricing, exclusive expiring holds, idempotent booking and unpaid/void invoice records, publication history/rollback/audit, manual occupancy/incident/cleaning pins, public signage feed and aggregate search/route/dwell counts.

## Confirmed review fixes

- Publishing cannot remove or convert a confirmed booth to a non-booth with the same ID. Exhibitors and ops receive role-appropriate private projections.
- Auth throttling and anonymous telemetry use separate bounded buckets, so normal visitor traffic cannot consume login allowance. Unpublished public view/signage return generic 404 responses.
- Layout and publication version are read together and returned through `X-Venue-Version`, exposed through CORS. The editor records that revision only when it accepts the matching document, not when it ignores a background response due to dirty edits. Both builder publication and Venue management publication use the accepted base revision; polling does not silently upgrade an older draft’s concurrency token.
- Sign-out clears accepted private layout access. Re-sign-in can recover a retained same-event editor draft only after an authenticated event-scoped draft read. Dirty edits are preserved; switching events remains guarded.
- Equivalent public branding refreshes reuse canvases/requests instead of rebuilding every 15 seconds. Removed branding hides immediately; headers remain limited to 8/16/24 by graphics tier and 150 m.
- Template counts no longer silently cap at a hardcoded slot count. Default kit validation reports zero schema, count and publication-readiness errors. The default convention kit contains the requested ten booth rooms.

## Fresh evidence from this review

- `reports/assets/v2-validation-final.log` and `reports/assets/procedural-inventory.json`: 47 procedural identities / 52 recipes validated, including generated bounds/interfaces/budgets.
- `reports/performance/v2-kit-review.json`: all six default kits pass schema, requested quantity accounting and publication readiness. This checks defaults, not every possible quantity combination or Recast reachability to every destination.
- `reports/performance/v2-v3-build.log`, `v2-v3-lint.log`, `v2-v3-format.log`: integration compiler/build, lint and formatting evidence. Three/Rapier chunks remain large; no performance claim follows from build success.
- Final compiler/build and full lint passed. The last integration build took 10.29 seconds; after the partial-response cache safeguard, worker syntax/scoped lint passed and the production artifact was regenerated in 12.57 seconds (`v2-v3-vite-final.log`). Lint retains nonblocking warnings. Fresh screenshot evidence reports `errors: []`; no broad test suite was run.
- `reports/performance/v2-v3-visual.json` and screenshots: local inventory, management entry, world, QR/share and mobile kiosk snapshots; no reported browser page exceptions in the successful captures. A transient API reload failure was recaptured after the server became available. These are development snapshots, not a complete authenticated browser workflow or GPU/FPS measurement.
- `reports/performance/v3-api-evidence.json`: earlier isolated 26-action workflow record covering access, drafts, publication conflicts, claims, holds, booking/invoices, provider-unavailable behavior, ops, signage, telemetry, rollback/privacy and restart durability. Subsequent Luna security fixes were source-reviewed and compiled; that record is not a fresh execution of every later change.
- Broad test suites were not run by Codex/Luna in this review, honoring the user’s speed preference. OpenCode’s earlier test claims are retained in its execution notes but not represented as newly run here.

## Remaining work, in execution order

1. **Real-device and workflow qualification:** authenticated author → private draft → publish → two-floor navigation → hold/book → rollback in a browser; real touch devices, shared links, offline quota/update behavior, and integrated/discrete GPU frame-time/load/memory measurements. Readiness/compiler checks cannot certify smoothness under every scene/device.
2. **Production storage and deployment:** move Venue OS JSON transactions to shared Postgres with atomic uniqueness/hold expiry/idempotency/version checks; migrations, retention, backups/restore, crash-lock recovery, shared rate limiting, secure operator bootstrap/session policies, media ACL/storage/CDN and deployment configuration. Existing PostgreSQL infrastructure does not currently persist Venue OS state. Current durable local store is a single-server workflow boundary.
3. **Payments and commercial completion:** select/configure a real provider; verified webhooks, checkout/payment states, refunds and reconciliation; integrate legacy orders/add-ons with the managed booking flow. Legacy reservation is intentionally rejected after bootstrap rather than bypassing new holds. No money is collected by the current booking flow.
4. **Operations integrations:** automatic occupancy/indoor-position feeds and crowd heatmaps; external signage/player sync and explicit 3D sign bindings; destination-level analytics/reporting. Current occupancy is manually entered and current analytics are event-level totals.
5. **Advanced venue construction:** complete specialized hospital rooms/equipment, sports courts/stands, airport/check-in/baggage, office/mall fit-out and people/vehicle packs from plan §§12–13. Current six templates are starter arrangements of shared assets, not full architectural or clinical/sport-compliant venues. Add door-to-wall opening alignment and real ramp/slope traversal before making physical accessibility claims.
6. **Phone AR experiment:** WebXR/device capability flow and a real venue coordinate/indoor-position alignment source. This is not implemented. An animated line on a phone camera would not establish world alignment.

See `v2-assets-review.md`, `v3-backend-execution.md`, and `v3-frontend-execution.md` for the individual review boundaries.

## For the chosen ones

Optimistic concurrency belongs to the document the editor accepted. Fetching or polling a newer version number must never authorize an older dirty document to overwrite it. Likewise, an immutable image cache is safe because content identity changes the URL; a cache timeout alone does not establish freshness.
