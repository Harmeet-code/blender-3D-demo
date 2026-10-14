# V2 procedural inventory — execution, evidence, limits

CodeGraph (`codegraph_explore`) was available and used first for the
procedural-assets/catalog/validation flow; remaining detail was read directly.
No secrets/`.env` were read. No git reset, no deletions, no Blender-original
edits, no commits/pushes/deployments. Broad test suites were not run per user
preference. `r3f-geometry` / `r3f-materials` skills were read and followed
(ordinary shapes from Recipe primitives, sparse bevels, shared-material merge,
least-complex PBR materials, no per-asset Canvas).

## Exclusive edits (7 files, all inside the allowed list)

1. `src/features/assets/model/asset-schema.ts` — appended the 25 V2 IDs to
   `ASSET_IDS` only (`info-desk`, `podium`, `queue-rail`, `planter`, `bench`,
   `trash-bin`, `food-kiosk`, `washroom-sign`, `exit-sign`, `atm-sign`,
   `door-single`, `door-double`, `ramp`, `shell-slab`, `shell-column`,
   `shell-beam`, `shell-facade-panel`, `shell-curtain-wall`, `shell-roof-flat`,
   `shell-canopy`, `parking-bay`, `parking-accessible`, `road-segment`,
   `crosswalk`, `ev-charger`). No other schema change.
2. `src/features/assets/model/expansion-metadata.ts` (new) — Three-free
   metadata for the 25 identities, parsed through `assetMetadataSchema`.
   All are `floor-contact`, `+Z`, real-meter bounds; compound colliders keep
   door/canopy/queue passages open; slabs/roads/ramp use 0.01 m-tall
   colliders so nav/clearance treat them as surfaces (`maxY <= 0.01` skip in
   `navigation.ts`, `minY < 1.8 && maxY > 0.01` filter in
   `floor-point-clear.ts`). No variants are declared (see limits).
3. `src/features/assets/catalog/expansion-recipes.ts` (new) — deterministic
   builders from existing `Recipe` primitives (`box`/`cylinder`/`polygon`),
   sparse bevels, shared material merging; interface meshes preserved
   (`mesh_branding`, `door_left`, `door_right`). Planter foliage is three
   axis-aligned geometric crowns (no textures, no downloads). Curtain-wall
   glass uses the existing transparent `glass` finish with no variant, so no
   fallback is required.
4. `src/features/assets/model/catalog.ts` — includes `expansionAssetMetadata`
   in `entries` so inventory, authoring, rendering and `resolveAsset` pick up
   the 25 IDs through the existing catalog.
5. `src/features/assets/catalog/procedural-assets.ts` — `getProceduralAssetIds`
   and `createProceduralAsset` dispatch the expansion catalog/recipes.
   Existing 22 identities, units, bounds, sockets, material roles,
   low/opaque variants, batching and disposal are untouched.
6. `src/features/building/model/authored-instance-physical.ts` — minimal
   addition: look up `expansionAssetMetadata` for dimensions and compound
   collider solids. Without this, new instances would fall back to the
   `external` single-box provider and lose entrance gaps. No other change.
7. `docs/v2-assets-execution.md` (this file).

Unrelated checkout changes (Codex wayfinding/share/kiosk/offline, V3 venue
work, frontend migration renames) were left alone; `git status` for the 7
paths above shows only our intended files.

## Evidence

- `bun scripts/assets/validate-procedural.ts` → 
  `Validated 47 identities / 52 generated quality recipes.` (22 existing +
  25 new; 5 pre-existing low/opaque variant recipes re-validated unchanged).
  Two iterations were needed: planter rim bounds and 4 missing material-role
  keys (`booth_warm_led` on food-kiosk, `finish_metal` on doors,
  `finish_frame` on shell-slab) — all fixed in metadata, no recipe/validator
  rewrites.
- `bunx tsc --noEmit -p tsconfig.json` → clean, no output.
- Measured generated geometry (from `reports/assets/procedural-inventory.json`,
  validator-written): all 25 baselines are far under budget; e.g.
  food-kiosk 268 tris/5 mats/25 KB (budget 8000/5/2 MB),
  shell-roof-flat 244/2/23 KB (6000/3), curtain-wall 132/3/11 KB (5000/4),
  road-segment 108/2/10 KB (3000/3), ramp 48/2/4.6 KB (3000/3),
  planter 264/3/25 KB (3000/4). Full per-asset table (tris/mats/bytes/draws/
  measured bounds) is in that JSON for the 25 IDs; measured bounds match the
  metadata bounds within the validator's 0.005 tolerance on all axes.
- Generic providers needed no edits: `InventoryPage`, `AssetInstance`,
  `AssetBatch`, `resource-cache.proceduralAssetScene` and
  `building-schema` (generic `assetId: string`) consume the catalog
  generically. `navigation.ts` / `floor-point-clear.ts` already skip
  `maxY <= 0.01` solids, which is how slabs/roads/ramp avoid becoming
  full-height obstacles.

## Limits (do not claim beyond this)

- No low/opaque variants were added for the 25 assets: none had a genuinely
  different low recipe satisfying the existing variant contract
  (low must be ≤ half baseline tris with identical bounds/sockets/colliders),
  and alias variants were forbidden. All 25 serve `baseline` only;
  `?lightweight` falls back to baseline. Glass therefore needs no opaque
  fallback (no variant implemented).
- Ramp is a visual-only wedge in the existing floor-locked controller.
  Continuous slope traversal is NOT implemented; no accessibility compliance
  is claimed. Its collider is a 0.01 m ground sheet, so avatars route across
  the footprint rather than climbing it.
- Ground slabs/roads/bays/crosswalk are visual surfaces with 0.01 m
  colliders: they do not block routing or clearance. They are not walkable
  surfaces either (`authoredWalkableSurfaces` unchanged).
- Queue-rail collides at its two post feet only; the belt span is visual, so
  the line itself remains routable. Food-kiosk keeps a 0.9 m staff gap beside
  the counter; its interior void is enclosed on four sides otherwise.
  Door leaves are modelled swung open; colliders are jambs only.
- No preset templates, wayfinding, sharing, kiosk/offline, V3 backend/frontend,
  hospital/sports/airport room packs, or Blender-source changes are included —
  those belong to Codex / separate tasks.
