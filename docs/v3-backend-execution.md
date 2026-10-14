# V3 Venue OS backend execution

Updated 13 October 2026. This records the implemented local Venue OS workflow and
the limits that still prevent calling it production-ready.

## Implemented workflows

- One-time local administrator bootstrap and password sign-in. Passwords use
  salted scrypt hashes; bearer tokens are random, only their SHA-256 digests are
  persisted, and sessions expire after eight hours. Password changes revoke the
  account's sessions.
- Admin-managed users and event assignments, with role checks and event scoping
  inside every authenticated venue command. Exhibitors see their own claims,
  holds, bookings, and invoices; only their own booth owner ID is returned.
  Ops snapshots omit account, claim, booking, invoice, version, and audit data.
- Event creation with a private blank-floor draft, event-template copying,
  private draft save/load, and separately published layouts. Publish validates
  readiness, preserves booth settings, rejects removal or conversion of a
  confirmed booth, rejects dangling signage destinations, and uses the caller's
  expected publication version. Rollback creates another immutable version and
  uses the same version check. Public layout responses carry the version read
  atomically with that layout, so an editor cannot pair an older document with
  a newer version token.
- Booth claim/approval and branding, availability and price, exclusive expiring
  holds, booking from a live hold, idempotent retries of a converted hold,
  cancellation of unpaid bookings, and void invoices. Checkout returns 503
  while no payment provider is configured; nothing is marked paid.
- Operations pins, manually entered occupancy observations, published signage,
  aggregate search/route/dwell counters, and a public view that omits internal
  ownership and user identifiers. Telemetry is optional, anonymous, bounded per
  request, and does not block wayfinding.
- The legacy layout write paths require Venue OS auth after the first admin is
  configured. Legacy booth reservation is blocked with a migration response so
  it cannot bypass Venue OS holds. Local demo writes remain available before
  bootstrap; production and non-loopback writes are denied until configured.
- Public layout, venue-view, and signage responses are `no-store`. Public view
  and signage return the same generic 404 for unknown and unpublished events;
  private drafts remain behind authenticated, event-scoped routes.

## Storage and release boundary

Venue state currently lives in `VENUE_DATA_DIR` (default `data/venue/state.json`)
as one JSON document. A filesystem exclusive-create lock serializes writers;
the state is written to a mode-0600 temporary file, flushed, and atomically
renamed. Reads see either the prior or next complete document. This supports a
single local server process and survives ordinary restarts, as shown by the
isolated restart evidence. If a process crashes while holding the lock, writes
fail closed with 503 until an operator recovers the lock.

This is not a shared production database. `DATABASE_URL` does not move Venue OS
state into Postgres. Do not run multiple workers/replicas against separate local
disks or ephemeral containers and expect shared events, sessions, holds, or
bookings. Before multiworker or production release, move Venue OS transactions
to a shared transactional database with uniqueness/locking for active booth
holds, booking idempotency, and expected-version publication; add a deployment
bootstrap and token/key policy appropriate to the operator's environment.
Production administrator bootstrap is intentionally disabled over HTTP and
must be provisioned through an explicit secure operational procedure.

## Remaining V3 work

- Configure a payment provider, webhook signature verification, payment-state
  transitions, refunds, and reconciliation. Until then the API returns 503 and
  invoice status remains unpaid or void.
- Replace the JSON file store with a shared transactional database before
  horizontally scaled or ephemeral deployment; add schema migration, backup,
  restore, retention, and lock recovery procedures.
- Replace process-local login throttling and public telemetry admission with a
  shared rate limiter for production. Login/bootstrap and anonymous telemetry
  now have independent per-process buckets at 10 requests per IP per minute;
  responses include `RateLimit-*` headers and `Retry-After` on rejection.
  Current limits do not coordinate across workers.
- Add destination-level analytics and reporting. Current telemetry records only
  event-level search, route, and dwell totals; optional destination IDs are not
  persisted.
- Add automatic occupancy sensing, crowd heatmaps, external signage sync, and
  phone AR only when their respective device/provider integrations exist. The
  current occupancy flow records explicit human observations and makes no AR or
  automatic-counting claim.
- Add deployment-grade media storage and retention. Uploads are content-addressed
  files on local disk and public immutable URLs; uploaded branding images are
  checked by schema, but there is no CDN or tenant-specific private media ACL.
- Expand workflow coverage across real browser sign-in, event authoring,
  publication, wayfinding, and booking after the storage backend is shared.

## Evidence

`reports/performance/v3-api-evidence.json` records 26 isolated local API actions:
bootstrap and duplicate rejection, auth and scope denials, event draft and
publication, stale-version rejection, claim approval and branding, competing
holds, booking retry, unavailable checkout, operations, signage, anonymous
aggregate analytics, rollback, public view, and durable restart. This is a
focused execution record, not a broad test run or production qualification.
