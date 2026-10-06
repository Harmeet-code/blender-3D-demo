# TODO

Roadmap for blender-3D-demo. Behavior contracts live in `openspec/specs/`
(`spatial-world`, `platform-infra`); this file tracks execution order only.

How to use this file: one task per line starting with `- [ ]` (open),
`- [x]` (done), `- [-]` (declined). Keep tasks small enough for one session,
ordered by dependency, each naming its check (e.g. `bun run verify`).
Owners use `@name`, areas use `#tag`. Move finished tasks to DONE with the
date; park ideas in BACKLOG instead of deleting them. Review weekly.

## TODO > Now

- [ ] Complete integrated-GPU laptop acceptance; use `reports/assets/website-acceptance.md` protocol #quality
- [ ] Provide add-on prices + currency and issue payable invoices on reserve #backend
- [ ] Select an identity provider and enforce admin login + per-event roles #backend
- [ ] Select a storage/CDN target and serve GLB/HDRI from it instead of the bundle #infra
- [ ] Bake AO lightmaps with `uv2` (blocked: no Blender on this host) #frontend

## TODO > Next

- [ ] Verify GitHub Actions CI on the first pushed branch #quality

## DONE

- [x] Archived `blender-asset-pipeline` to `openspec/changes/archive/2026-10-02-blender-asset-pipeline` with synced specs (2026-10-06)
- [x] Wired BoothDrawer reserve button to `reserveBooth` entity client with pending/success/error states; `bun test tests/booth-drawer.test.tsx` + E2E reservation spec (2026-10-06) #frontend
- [x] Render layout from API (`getLayout`) with last-valid fallback; `bun test tests/frontend-results.test.ts` (2026-10-06) #frontend
- [x] Subscribed WorldPage to presence socket with remote-avatar interpolation; `bun test tests/avatar-presence.test.ts` (2026-10-06) #frontend
- [x] Booted live infra and ran migrate + seed twice idempotently; health reported postgres/redis `up` (2026-10-06) #infra
- [x] Added GitHub Actions CI running `bun run verify` + asset validation + build on push/PR (2026-10-06) #quality
- [x] Single-floor Recast NavMesh routing with typed no-route results; `bun test tests/navigation.test.ts` (2026-10-06) #frontend
- [x] Extruded wall polygons into 3D meshes with preset heights + entrance openings; `bun test tests/room-walls.test.ts` (2026-10-06) #frontend
- [x] Dollhouse stack/unstack animation + wall fading with canonical restore; `bun test tests/floor-presentation.test.ts` (2026-10-06) #frontend
- [x] Double-click teleport + room-search autopilot with cancel; `bun test tests/teleport.test.ts` + E2E navigation spec (2026-10-06) #frontend
- [x] Order creation on reserve via pending-order transaction + reservation rate limiting; `bun test tests/server-features.test.ts tests/server-results.test.ts` (2026-10-06) #backend
- [x] Split vendor/3D chunks via `manualChunks`; `bun scripts/assets/check-build-chunks.ts` (2026-10-06) #frontend
- [x] WebGPU renderer shim with WebGL2 fallback (`?webgpu=1` opt-in); `bun test tests/renderer-selection.test.ts` (2026-10-06) #frontend
- [x] E2E tests for world navigation + reserve flow; `bun run test:e2e` 2 passed (2026-10-06) #quality
- [x] Complete Blender catalog (14 baseline + 5 variants), calibrated editor, placement, branding, batching, recovery and desktop browser acceptance; laptop release gate pending (2026-10-02)
- [x] Render repeated props in material batches with independent booth picking IDs (2026-10-02)
- [x] Attach isolated aspect-preserving logo planes to validated branding sockets (2026-10-02)
- [x] Initialise Vite + React + R3F + Fastify scaffold (2026-10-01)
- [x] Feature-slice `src/` for frontend and backend (2026-10-01)
- [x] Docker + Postgres + Redis compose with migrate/seed (2026-10-01)
- [x] Spec-gated OpenSpec workflow adapted to this stack (2026-10-01)
- [x] neverthrow Result + typed errors as the standard, both sides (2026-10-02)
- [x] DTOs with request + response validation on every boundary (2026-10-02)
- [x] Pino structured logging with redaction, no console.* (2026-10-02)

1. remove old and unwanted PNG and GLB files
2. remove all unnecessary skills
