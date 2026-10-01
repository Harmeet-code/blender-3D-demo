# Paused implementation — 2026-10-01

The user requested a stop and will bring an updated plan tomorrow. Incorporate that plan before continuing. No release or archive has been claimed.

## Saved work

- Portable Blender 4.5.9 LTS, official SHA256 verified, in `.cache/blender`.
- Blender MCP add-on enabled in a fresh GUI process (PID 15332), bridge port 9876. Read-only MCP `get_scene_info` succeeded. Evidence: `mcp-connection.json`, `blender-bridge.json`, `blender-scene-info.json`.
- Editable Blender sources, recipes, exported GLBs, metadata and four previews per asset for floor tile, wall panel, booth frame, chair, table. All five pass actual-file validation (`bun run assets:validate`).
- Calibration scene and shared material-library files created; standalone calibration GLB checks pending.
- Asset/layout contracts, meter normalization, polygon/reference validation, add-on mappings, and last-valid-layout handling.
- Website integration: polygon rooms, modular walls/canonical frame, deterministic furniture placement, primitive colliders, independent asset hierarchies, loading/error/retry boundaries, DOM diagnostics, proof scene, low-quality toggle, inactive-floor unmounting.
- Additive database migration `002_asset_layout_metadata.sql` and repository support for new metadata. Migration has NOT been applied to a database.

## Evidence

- Baseline typecheck passed; existing tests: 23 passed; four existing lint warnings. Baseline report retained.
- Asset contracts/building-schema checks: 9 passed at that point. New asset-pipeline checks: 7 passed, 0 failed, including actual GLB inspection and stable contained placement/clearance routes.
- Typecheck passed through initial frontend integration and validator inclusion. Later edits and new tests still need final typecheck/lint/format gates.
- `/expo/` build succeeded before the last edits. Floor tile was then inlined; Vite now forces GLBs to emit as files. Rebuild and production browser checks pending.
- Browser probe: booth/chair/table minimum Y=0 on F1 and Y=-4 on B1. Dimensions match metadata with float error below 0.000001 m. Independent chairs shared identical geometry UUIDs.
- Small proof scene: 48 render calls and 1,440 triangles. This is not the specified stress benchmark.
- HTTP and malformed-GLB faults showed labeled geometry fallbacks. HTTP retry began loading. Full retry/state-preservation and shared-instance removal checks unfinished.

## Resume notes

1. Incorporate the updated plan; finish scoped formatting/lint/typecheck and revise OpenSpec design for the additive persistence migration (design currently says no migration).
2. Finish first-slice browser gates 5.1–5.5 before expanding asset production. Unknown reference, retry preservation, one-chair removal, screenshots, and production URLs remain pending.
3. Task 4.3 remains pending because the separate optional booth ceiling is unfinished; its frame is exported/validated.
4. Check the registered Blender command path for literal doubled separators in Codex config. Do not expose unrelated config or credentials.
5. Remaining generator recipes exist but have not run. Correct staircase rail rotation before production.
6. Remaining assets, editor controls, logistics/portals, logos, batching/cache ownership, stress scene and release acceptance remain pending.
7. Integrated-GPU laptop unavailable: host is i5-12400F / GT 710. Keep the specified reference-device performance gate pending.
8. Existing Reserve button is unwired; preview work does not implement reservation.

Dev server: http://127.0.0.1:5173/?asset-preview=1 (session 61852). Production preview port 4173 (session 2922) needs a fresh build. User working-tree edits were preserved. No commit/deployment.
