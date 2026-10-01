# TODO

Roadmap for blender-3D-demo. Behavior contracts live in `openspec/specs/`
(`spatial-world`, `platform-infra`); this file tracks execution order only.

How to use this file: one task per line starting with `- [ ]` (open),
`- [x]` (done), `- [-]` (declined). Keep tasks small enough for one session,
ordered by dependency, each naming its check (e.g. `bun run verify`).
Owners use `@name`, areas use `#tag`. Move finished tasks to DONE with the
date; park ideas in BACKLOG instead of deleting them. Review weekly.

## TODO > Now

- [ ] Wire BoothDrawer reserve button to `booth-customize` entity client (`reserveBooth`) #frontend
- [ ] Render layout from API (`getLayout`) instead of the static demo fixture #frontend
- [ ] Subscribe WorldPage to presence socket (`shared/api/ws.ts`) and lerp remote avatars #frontend
- [ ] Boot live infra and run migrate + seed: `bun run infra:up && bun run db:migrate && bun run db:seed` #infra
- [ ] Add GitHub Actions CI running `bun run verify` on every push #quality

## TODO > Next

- [ ] Replace straight-line path with recast NavMesh single-floor routing #frontend
- [ ] Extrude wall polygons into 3D meshes with preset heights #frontend
- [ ] Render identical booth props via `THREE.InstancedMesh` (one draw call) #frontend
- [ ] Project uploaded logos via DecalGeometry on booth banners #frontend
- [ ] Dollhouse stack/unstack animation + wall fading + floor-LOD culling #frontend
- [ ] Double-click teleport + room-search autopilot #frontend
- [ ] Invoice + order creation flow on reserve (orders slice) #backend
- [ ] Rate-limit reservation endpoints #backend
- [ ] Split vendor/3D chunks via `manualChunks` to fix the >500 kB warning #frontend
- [ ] Serve GLB/HDRI from CDN storage instead of the bundle #infra

## BACKLOG

- [ ] Admin auth + per-event roles #backend
- [ ] Baked AO lightmaps with `uv2` and disabled shadow maps #frontend
- [ ] WebGPU renderer shim with WebGL2 fallback #frontend
- [ ] E2E tests for world navigation + reserve flow #quality

## DONE

- [x] Initialise Vite + React + R3F + Fastify scaffold (2026-10-01)
- [x] Feature-slice `src/` for frontend and backend (2026-10-01)
- [x] Docker + Postgres + Redis compose with migrate/seed (2026-10-01)
- [x] Spec-gated OpenSpec workflow adapted to this stack (2026-10-01)
- [x] neverthrow Result + typed errors as the standard, both sides (2026-10-02)
- [x] DTOs with request + response validation on every boundary (2026-10-02)
- [x] Pino structured logging with redaction, no console.* (2026-10-02)
