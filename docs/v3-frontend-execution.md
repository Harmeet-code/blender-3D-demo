# V3 venue frontend execution (13 Oct 2026)

This note audits the Venue OS UI described in §10 of
`complete-migration-plan-with-vision.md`. It records frontend behavior visible
in source; it does not claim a production launch or live-service qualification.
The broader [archived V2/V3 execution plan](../archive/legacy-2026-10-14/payload/docs/v2-v3-execution-plan.md) is a historical execution note: its
"done" and "gaps" lists describe different points in the work and should not
be treated as one current checklist.

## Present in the frontend

- `src/pages/venue/VenuePage.tsx` authenticates the in-memory Venue OS session,
  loads accessible events and snapshots, guards event switches while the
  layout editor is dirty, and rejects stale snapshot results after an event
  switch. A version-zero event loads its saved private draft into the layout
  store, marks that store dirty, and calls `acknowledgeEventLayout` before the
  world can accept it. Publish and rollback invalidate the event's layout
  query. The page does not expose unpublished version-zero events as live
  world layouts through its own UI.
- `src/features/venue/components/VenueBooths.tsx` exposes exhibitor claim,
  organizer approval, booth branding/logo upload, price and availability,
  timed holds, booking confirmation/release, cancellation, and invoice
  downloads. Invoice copy explicitly says that payment is unconfigured and no
  money is collected. The organizer account panel can create accounts and edit
  another account's role, event assignments, or password. Self password reset
  is hidden because the server revokes the current session on that operation.
- `src/features/venue/components/VenueOrganizer.tsx` creates a blank event or
  copies a published event layout as a template, shows readiness blockers,
  confirms immutable publish/restore actions, and displays version and audit
  history. It retains the editor's unsaved state when a rollback completes;
  the organizer message tells the user to reload before adopting the restored
  layout.
- `src/features/venue/components/VenueOperations.tsx` records and resolves
  incident, cleaning, and manual occupancy pins, and edits event signage by
  stable display ID. The overview displays aggregate search, route, and dwell
  counts. Occupancy is presented as a manual observation.
- `src/features/venue/components/VenuePublicProvider.tsx` reads a public,
  event-keyed view without credentials and refreshes every 15 seconds while
  the document is visible. It exposes availability and operations layers,
  public signage, and directions. `VenueFloorOverlay.tsx` matches booth IDs to
  room IDs; draws availability outlines and operations markers; shows no
  internal owner, claim, invoice, or session data; and limits active exhibitor
  headers to 8/16/24 by graphics tier. Header selection is distance-based,
  capped at 150 metres, and wakes the render runtime for 150 ms on changes.
  Logo canvases and media requests track branding field values, so an
  equivalent 15-second refresh does not rebuild them; removing branding hides
  the old header immediately.

## Limits to keep visible

- No payment provider is configured. Invoice records are unpaid stubs and
  booking does not charge a card.
- Occupancy comes from operator-entered counts; there is no automatic sensor
  feed. Analytics are aggregate counts; destination-specific breakdowns are
  not shown by this UI.
- Signage content and destinations are feed-driven. This is not a 3D sign
  placement/editor, and a Directions action requires the destination to exist
  in the active layout.
- The public layer is a projection for live wayfinding, not a complete public
  event page. Its useful status and operational details depend on the public
  API returning sanitized data. The frontend only renders public booth fields
  and omits operation notes.
- Event, account, layout, and audit persistence depend on the configured
  server-side Venue OS data directory and its access controls. This audit does
  not establish a hosted tenant model, payment compliance, production
  authorization, or multi-instance storage qualification.
- The frontend source review does not establish phone AR, indoor positioning,
  native push updates, production credentials, or device/FPS qualification.

## Evidence and verification

Evidence reviewed: `VenuePage.tsx`, `VenueBooths.tsx`, `VenueOrganizer.tsx`,
`VenueOperations.tsx`, `VenuePublicProvider.tsx`, `VenueFloorOverlay.tsx`, and
`venue-contracts.ts`. This was a source audit only. No test suite, compiler, or
live server was run in this frontend slice; final repository checks are owned
by the integrating agent.
