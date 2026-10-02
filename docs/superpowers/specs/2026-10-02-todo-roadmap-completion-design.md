# Roadmap TODO Completion Design

## Goal

Complete and verify the actionable checkbox items in `TODO.md` in dependency-ordered slices. Keep completion claims evidence-based; retain unresolved external gates as open rather than marking them complete.

## Current constraints and explicit scope decisions

- In scope: all unchecked checkboxes under NOW, NEXT, and BACKLOG.
- Out of scope for deletion: the two uncheckboxed notes after DONE about PNG/GLB cleanup and skill cleanup; the user asked to leave these for later clarification.
- Admin authentication is deferred until an identity provider is selected. Do not add a mock or insecure placeholder login; leave that task open.
- CDN migration is deferred until storage/CDN deployment details are available. Do not claim that assets are hosted remotely; leave that task open.
- Invoice issuance is deferred because neither add-on prices nor currency are defined. Do not invent monetary values; keep invoice issuance open until pricing rules are supplied.
- The integrated-GPU laptop acceptance is deferred. This checkout reports an NVIDIA GT 710 desktop, which does not meet the documented device requirement. Do not substitute its benchmark for the required laptop gate.
- `blender-asset-pipeline` was already archived and its delta specs synchronized. Split the combined TODO entry so only the hardware acceptance remains open.
- Docker Desktop is currently unreachable. Implement and test infra code where possible; only mark live migration/seed boot complete after a real database run succeeds.

## Phased design

### 1. Application data and service workflows

- Load the selected event layout through the validated `getLayout` client, retaining the last valid/demo layout with a visible recoverable error when the request fails.
- Wire the booth customizer to the existing validated `reserveBooth` client. Keep pending/error/success states explicit, prevent duplicate submission while in flight, and preserve selections on failure.
- Wire reservation through the existing pending-order transaction and validated DTOs; keep invoice issuance deferred until add-on prices and currency are defined.
- Add reservation rate limits using the existing optional Redis integration, with a documented deterministic fallback when Redis is not configured.

### 2. Realtime presence and world navigation

- Connect the page to the existing websocket protocol, remove disconnected peers, and interpolate remote avatar snapshots without mutating server-owned state.
- Add single-floor Recast NavMesh path queries from walkable layout surfaces; preserve the existing floor-graph routing for cross-floor paths and return typed no-route results.
- Add double-click teleport and room-search autopilot as distinct controls: teleport moves immediately to a valid room entrance; autopilot follows the computed route and can be canceled.

### 3. World geometry and transitions

- Extrude validated wall polygons with configured heights and preserve openings/booth entrances.
- Add dollhouse stack/unstack motion and wall fading while keeping saved coordinates unchanged. Bound active geometry/physics using the existing floor activation and LOD policies.
- Keep visual transitions interruptible and ensure switching floors restores the canonical floor transforms.

### 4. Operations and delivery

- Add GitHub Actions CI for install, typecheck, lint, format check, tests, asset validation, and production build.
- Reduce the production JavaScript entry chunk using measured manual chunk groups; verify chunks do not create circular chunk warnings or regress initial app loading.
- Live DB migration/seed is gated on Docker availability and must be run twice to verify idempotency.
- CDN storage configuration remains explicitly deferred; preserve literal/local asset loading until a provider and deployment are selected.

### 5. Rendering, security boundary, and end-to-end quality

- Bake ambient-occlusion data into supported assets with UV2, disable dynamic shadow maps only after browser appearance/quality checks, and keep an unbaked source/export path for rollback.
- Implement a feature-detected WebGPU renderer path with WebGL2 fallback; keep the existing renderer path as the baseline and verify both contexts independently.
- Add browser E2E coverage for world navigation and reservation success/failure using the real frontend/server contracts.
- Do not implement admin sign-in or per-event role enforcement until an identity provider is chosen; leave that checkbox open.

### 6. Acceptance and TODO reconciliation

- Run focused tests after each slice and the full verification suite at integration checkpoints.
- Record infrastructure and renderer limitations in acceptance reports.
- Mark a TODO checkbox complete only after its stated check passes. Keep GPU acceptance, deferred auth/CDN, and unavailable live-infra checks open if their external prerequisites remain unavailable.

## Boundaries and interfaces

- Frontend data access continues through validated entity clients returning `Result`; UI components do not call `fetch` directly.
- Backend features remain Fastify route/service/repository slices and use shared DTO validation and typed errors.
- NavMesh routing is floor-local; the existing portal graph remains the only cross-floor route authority.
- Asset delivery stays behind a URL-resolution boundary so a future CDN can be selected without changing scene entities.
- Authentication is a hard boundary around event-scoped admin mutations; no client-only role checks count as authorization.

## Verification

- Per-slice: focused unit/contract tests, then `bun run typecheck`, `bun run lint`, `bun run format:check`, and affected tests.
- Integration: `bun run verify`, `bun run build`, asset validation, and browser checks for navigation/reservation.
- Infrastructure: `bun run infra:up`, migrate, seed, rerun migrate, inspect health; do not report success if Docker or database startup fails.
- Device acceptance: follow `reports/assets/website-acceptance.md` on the specified integrated-GPU laptop; require its documented FPS/frame-time and scene-budget thresholds.

## Review notes

- Existing OpenSpec contracts cover spatial-world, platform-infra, asset placement, Blender assets, and web asset delivery. This design decomposes implementation into independently verifiable slices without silently weakening those contracts.
- The accepted scope includes BACKLOG items but explicitly defers auth/CDN choices, invoice pricing, and the integrated-GPU measurement per user direction.
- Cleanup notes are not checkboxes and are intentionally excluded pending exact filenames/skill IDs.
