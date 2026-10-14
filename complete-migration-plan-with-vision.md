# Complete Migration Plan with Vision — R3F-only Venue Builder + Indoor Maps

## 1. Vision (locked)

**Product:** R3F Venue Builder + Indoor Maps
**Tagline:** Draw any floor from an image, or drag-drop from inventory — then navigate like Google Maps.
**Problem:** Mix of Blender assets and Three.js/R3F assets, no canonical pipeline or end goal.
**Resolution:** R3F-only runtime. Blender sources kept as visual reference only, rebuilt 1:1 as procedural R3F, then archived/deleted.

**Core (all three equal):**

1. Make complete floor from an image (draw over image)
2. Drag-drop new venue from inventory with no reference image
3. Free navigate + Google-Maps-like point-to-point routing

**Users:** Both modes

- Admin authors: author floors, place assets, calibrate, save venues
- Visitors: explore, search, route, teleport/walk

**Features:** All + extras (presence, booth reserve/orders)

**Constraints:**

- Zero Blender runtime. Ref-only then delete + archive first.
- Admin authoring directly inspired by existing project: `C:\Users\HarmeetSingh\Desktop\Projects\demo` (SEMS 3D Interactive Floor Plan)
- Inventory: rebuild current 14+5 Blender list 1:1 in R3F
- Navigation engine: keep Recast (not demo grid A*)
- Floor-from-image: draw over image (not auto-trace)
- Deliverable for this doc: spec only, no renders

## 2. Project-local R3F skills (installed, enzed/r3f-skills only)

Installed via `npx skills add https://github.com/enzed/r3f-skills --skill <name>` for this project only into `.agents/skills/`. Do NOT use `emalorenzo/three-agent-skills` (removed `r3f-best-practices`).

| Skill                | Use in this migration                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `r3f-fundamentals`   | Canvas/scene architecture, typed JSX, render-loop + resource ownership rules for `src/features/world/`, `viewer/`, `building/`      |
| `r3f-interaction`    | Picking, drag-drop inventory, pointer capture, Orbit/CameraControls ownership, `onPointerMissed` deselect — core of Admin authoring |
| `r3f-geometry`       | Procedural 1:1 rebuild of booths/walls/stairs/furniture, instancing + draw-call batching for repeated props                         |
| `r3f-materials`      | PBR booth/venue materials, transparency/transmission cost control                                                                   |
| `r3f-textures`       | Floor-image texture color space, UV, 4096px preview memory bounds                                                                   |
| `r3f-lighting`       | Warm sun + cool sky parity with Blender ref, shadows, IBL, ACES                                                                     |
| `r3f-loaders`        | Minimal use — R3F-only, no runtime GLB except archived ref; Suspense/preload only where legacy import remains pre-purge             |
| `r3f-animation`      | Dollhouse stack/unstack, teleport/autopilot tween, demand-loop discipline via `useFrame` + damping                                  |
| `r3f-physics`        | Rapier rigid bodies/colliders/sensors for walk mode, booth wall proxies, placed-bounds obstacles feeding Recast                     |
| `r3f-postprocessing` | Route glow/bloom, selection outline, AO/DoF composer pipeline                                                                       |
| `r3f-shaders`        | Custom GLSL/TSL only where PBR/composer insufficient (route line, wall fade)                                                        |

Rule: consult the matching skill before writing code in its area. `r3f-interaction` + `r3f-geometry` + `r3f-physics` cover 80% of authoring + navigation work.

## 3. What to mirror from `demo` — admin authoring detail

Source: `C:\Users\HarmeetSingh\Desktop\Projects\demo\src/` — vanilla Three.js SEMS viewer. Port UX contracts + state shapes, re-implement in R3F/TS.

### 3.1 Floor lifecycle (`authoring/` → `layout-editor/api/`)

- `AuthoringStore.js`: `CanonicalFloorDraft { meta { floorName, image, fabricBounds, mapping, stairs, entrances, walkableZones }, booths[] }`. Helper-only, no network. Port as Zod TS types in `src/features/layout-editor/model/`.
- `AuthoringApi.js` + `Floorplan3dApi.js`: `fetchEventMeta / fetchFloorPlan / uploadFloorImage / deleteFloor` with `{ success, data, message, statusCode }` result. Port to Axios boundary + TanStack Query in `src/api/` + `layout-editor/api/`; neverthrow unwrapped at Query boundary (repo standard).
- `AuthoringHistory.js` + `editors/DraftActionHistory.js` + `DraftPointHistory.js`: per-floor undo/redo stacks `{ label, apply, revert }`, snapshot clone/restore. Port to Zustand per-floor history in layout-editor store.
- `NameUtils.js` `uniqueNameForDraft`: port ID dedupe for booths/zones/POIs.

### 3.2 Draw-over-image editors (`editors/` → `layout-editor/components/`)

- `FloorDraftEditor.js`: upload → thumbnail preview → draft create → persist draft in browser storage → floor list. Keep flow; replace localStorage-only with API + `.local/venue-data/` fallback (current repo behavior).
- `BoothEditor.js` modes to replicate 1:1 in R3F: `select | add-rect | add-polygon | add-drag | drag | remove | duplicate | resize`, ghost preview group, drag handles, Esc cancel, `recordDraftAction` on every mutate, formDirty/draftDirty gating. Geometry: rect (p1/p2) + polygon points in world → fabric via CoordTransform. Rebuild with `r3f-interaction` drag + `r3f-geometry` extrude.
- `ZoneEditor.js`: `add-rect | add-polygon | remove` walkable/blocked zones, overlay refresh, commit mutation wrapper. Maps to authored boundaries/blocked areas + Recast walkable mask input.
- `PoiEditor.js`: stairs (id/label/connects/position/rotation) + entrances; ghost placement, move/duplicate shortcuts, pending-remove restore. Maps to floor portals — entries required on both floors before cross-floor routing enabled.
- `FloorDraftEditor` sub-panels A/B/C: A upload, B mapping/calibration, C stairs/entrances/zones. Keep panel grouping in Admin UI.

### 3.3 Viewer chrome (`ui/`, `core/`, `visuals/` → `world/` + `viewer/`)

- `ui/Sidebar.js`: booth detail (no/name/size/price/status/company/contact), heat toggle, dimmed vs selected appearance, Focus button. Port to shadcn panel + `BoothDrawer` (already exists — extend, don't duplicate).
- `ui/Filters.js` + `Toast.js` + `Interaction.js`: status filter, search, toasts, click vs drag disambiguation. Keep interaction policy.
- `core/CoordTransform.js` + `SceneSetup.js`: fabric→pixel→world pipeline with `readCal { offsetX/Y, scaleX/Y }`. Current repo uses two-point + rectangle calibrate — keep that (superset of demo), port demo's `baseScaleX/Y` + `bboxFromPoints` helpers.
- `visuals/BoothBuilder.js` + `ZoneOverlay.js` + `BoothMarker.js`: extrude + label + overlay. Rebuild procedurally with `r3f-geometry` + `r3f-materials`.
- `grid/AStarRoute + MultiFloorRoute + StairRouter + gridUtils`: UX to copy (any-2-booth routing, animated glow + walking dots, nearest-free fallback, cross-floor via stairs). Engine stays Recast (`@recast-navigation/*`) — do not port grid engine, only interaction + visual language.

### 3.4 Explicit non-goals from demo

Vanilla `viewer_interactive.html/js`, `booths_poly_v2.json` fabric blob, `DenverFloorPlan1.jpg` hardcode, localStorage-only truth, grid raster engine.

## 4. What to keep in `blender-3D-demo`

Canonical:

- `src/features/building/` — new R3F building
- 2-floor map + `src/features/navigation/` — Recast NavMesh, teleport, dollhouse stack/unstack + wall fade
- `src/features/layout-editor/` — rebuild target for §3 editors
- `src/features/world/`, `viewer/`, `assets/`, `src/assets/metadata/booth-sizes.v1.json`

Archive then delete:

- `assets-source/blender/**/*.blend/*.py` (banner-stand, booth-ceiling, booth-frame, booths 8 sizes, chair, display-case, elevator/escalator-entrance, floor-tile, forklift, pallet, safe, stairs, table, wall-panel, asset-sheet, materials, calibrate, build, refine-sized-booths, verify-sources)
- `assets-source/scenes/atrium/luminary-galleria.blend` + backups
- Old room/table/related props, old PNG/GLB renders, `public/floor-assets/booths/` legacy GLBs
- Blender pipeline scripts, Blender CI steps
- `docs/venue-authoring.md` Blender sections → rewrite R3F-only

## 5. Feature matrix

Must:

- Image upload per floor (PNG/JPEG/WebP, 50MiB, 150MP, 4096px preview, preserve original)
- Calibrate two-point (uniform ft) + rectangle (affine); block save if uncalibrated; recalibrate on replace
- Draw walls with openings/heights, blocked zones, avatar starts, portals (both floors required)
- Inventory drag-drop → move/rotate/resize/duplicate/delete, snap, undo/redo, save via API with last-valid fallback
- Free orbit/pan/zoom + presets, walk (rapier), double-click teleport, search autopilot + cancel
- Recast point-to-point (any 2 POIs/booths/starts), cross-floor, floor switcher, dollhouse

Should:

- Presence avatars, booth reserve/orders, search + focus, heatmap/availability

Could:

- Night mode, auto-tour, YouTube embed, AO lightmaps (R3F), CDN GLBs, auth/roles, invoices

## 6. Phased execution (with skill + demo mapping)

### Phase 0 — Freeze + archive (1 session)

- Move Blender sources, old PNG/GLB, pipeline scripts to `archive/blender-ref/` + photo sheet.
- Guard `scripts/assets/validate.ts`: fail on `src/` → `archive/` imports.
- Skills: `r3f-loaders` to confirm zero runtime GLB deps.
- Exit: `bun run verify` green on R3F building + 2-floor map.

### Phase 1 — Canonicalize data model (spec-first)

- Port §3.1 contracts to `openspec/specs/spatial-world`: FloorDraft, Booth/Zone/POI, mapping, history step.
- Zod DTOs + migration `004_r3f_only_layout`.
- Exit: spec + DTOs reviewed, no runtime change.

### Phase 2 — Rebuild 14+5 inventory 1:1 in R3F

- Truth: `booth-sizes.v1.json` 8 sizes @ 2.8m, open front, 3 wall proxies, ground origin.
- Build `src/features/assets/catalog/` procedurally. Skills: `r3f-geometry` (shape + instancing), `r3f-materials` + `r3f-textures` (look), `r3f-lighting` (parity), `r3f-physics` (proxies).
- Unit test footprint/height/origin + picking IDs.
- Exit: inventory page renders all, visual diff vs archive approved.

### Phase 3 — Authoring v1 (§3.2 + §3.3 port)

- 3a FloorDraft + upload + calibrate (two-point/rectangle). Skills: `r3f-textures`, `r3f-fundamentals`.
- 3b Wall/zone/starts/portals draw. Skills: `r3f-interaction` (modes, ghosts, capture), `r3f-geometry` (extrude).
- 3c Inventory place/move/rotate/resize/duplicate/delete + snap + history. Skills: `r3f-interaction` (DragControls/TransformControls policy), `r3f-physics` (ground + bounds).
- 3d Sidebar/Filters/Toast/Search detail panels (shadcn).
- 3e Save/load via API + fallback.
- Exit: e2e blank 2-floor author → save/reload, `bun run test:e2e` pass.

### Phase 4 — Navigation v1 (keep Recast, copy demo UX)

- Recast from calibrated geometry + obstacles + booth walls + placed bounds + portals. Free orbit/walk/teleport/search-autopilot + cancel, dollhouse. Skills: `r3f-physics`, `r3f-animation`, `r3f-postprocessing`, `r3f-shaders` (route line only if needed), `r3f-interaction` (controls ownership).
- Avatar roam + Google-Maps UX per §9 below (buttery locomotion, From→To, steps + ETA, minimap).
- Exit: `tests/navigation/teleport/floor-presentation` green, typed no-route.

### Phase 5 — Purge + harden

- Remove archive from bundle, Blender from CI/docs/TODO, CDN target, Postgres seed. Skills: `r3f-postprocessing`, `r3f-lighting` final pass.
- Extras flagged off until Phase 4 green.
- Exit: `bun run verify + assets:validate + build`, laptop acceptance.

## 7. Risks

- Dims drift → lock catalog JSON + validation test.
- Uncalibrated scale → block place/save.
- Grid-vs-Recast confusion → Recast engine only.
- Scope creep → flags off until core green.
- Skill drift → enzed-only; re-run `npx skills list` if behavior diverges.
- Motion sickness/jitter → clamp delta, damp camera, never teleport camera without fade; test on iGPU.

## 8. Next

- Confirm archive location + canonical asset list.
- Start Phase 0 archive + guard, or draft OpenSpec change for Phase 1.

## 9. Avatar roam (buttery smooth) + Google-Maps-friendly navigation

### 9.1 Today (audit 2026-10-12)

- `AvatarController.tsx`: kinematicPosition body + Rapier character controller (offset 0.01), autopilot-only. `AUTOPILOT_SPEED = 3`, step `3/60` per physics tick, no accel/decel, `rotationY = atan2(dx,dz)` instant snap, capsule placeholder, prev/curr + `frameRuntime.alpha` interpolation, sleep when idle.
- `avatar-runtime.ts`: zero-alloc `advance(distance, resolve)` with carry budget, portal edges as explicit floor transfers, `blockedSeconds` ≥ 0.5 → blocked.
- `viewer-store.ts`: `routeStatus idle|computing|walking|blocked|no-route|error`, `startAutopilot(roomId)` → `queryBuildingRouteAsync` → waypoints+floors, `advanceAutopilot` throttles React sets (0.1s), `teleportToRoom`, `cancelAutopilot`, layout change cancels route.
- Gap: no manual WASD locomotion, no velocity smoothing, no camera follow modes, no From→To / steps / ETA / minimap routing.

### 9.2 Buttery avatar controls (spec)

- Input: `KeyboardControls` (WASD + arrows, Shift run, Space brake) + virtual joystick on touch + click-to-move (existing double-click teleport kept). All discrete actions stay DOM-accessible (skill: `r3f-interaction`).
- Locomotion model (skill: `r3f-physics` + `r3f-animation`):
  - Walk 2.2 m/s, run 4.5 m/s, accel 12 m/s², friction 10/s, slope limit + step offset from character controller, ground snap on.
  - Turn: critically-damped yaw (`damp` angle lerp ~12Hz), lean into strafe ±8°, bob 1.8Hz scaled by speed, walk/idle `animationState` drives capsule → future GLB clip.
  - Fixed-step movement in `useBeforePhysicsStep`, render interpolation in `useFrame` with clamped delta (≤50ms), never allocate in loop (reuse `desired/resolved` — already the pattern).
  - Collision: cuboid proxy today → capsule collider post-tune; sensors excluded; portal volumes trigger floor transfer, never sweep through slabs.
- Camera modes (skill: `r3f-interaction` + `r3f-fundamentals`):
  - Orbit (default, current), Follow (third-person: damped boom 4m/1.8m, shoulder offset, collision pull-in, FOV kick +6 on run), Top (dollhouse/map).
  - One active control at a time (`makeDefault`), TransformControls suspend follow while dragging; camera transitions via eased `flyTo` (~850ms, cubic — port `demo/core/Navigation.js`), fade on floor change.
  - Demand-loop when idle; always-loop only while walking/follow (perf gate on iGPU).
- Multiplayer smoothness: keep WS presence, add 100ms lerp + dead reckoning for `RemoteAvatarLayer`, cull off-floor avatars to `MiniMap` dots.

### 9.3 Google-Maps-friendly navigation (spec)

- Search anywhere: one box for booth no/company/POI/amenity (stairs, elevator, exit, washroom). Port `demo` Filters + `RoomSearch` + `CommandPalette`; index authored names + `NameUtils` IDs.
- From→To panel: From defaults to blue-dot avatar, To defaults to selected/search; swap button; mode toggle Walk / Step-free (avoid stairs → prefer elevator portal); preview route before Go.
- Guidance: 3D glowing path (`PathLine` + `r3f-postprocessing` bloom) + 2D `MiniMap` polyline + turn-by-turn steps ("Head 24m past Hall B", "Take elevator to F2", "Arrive at L1-15 · 1 min"); ETA = path length / 1.3 m/s walk; distance + floor changes in header.
- States: computing skeleton → walking (progress bar + Cancel) → arrived pulse; blocked → auto-recalc once then suggest nearest-free + teleport fallback; no-route typed with reason (unmapped, portal missing, off-mesh); layout edit cancels + toasts (already in store — keep).
- Extras (post-v1): recents/saved, share `?from&to&floor`, QR for on-site, accessible-route preference persisted.
- Authoring dependency: every routable needs authored position + walkable zone + portal links both floors (Phase 3 gates Phase 4).

## 10. Evolution (v1 → v3) + real-world backlog

Agreed direction 2026-10-12. v1 scope frozen (§5–§6); below is parked backlog, not v1 commitment.

### v1 — Builder + wayfinding core (now)

Draw-over-image floors, 1:1 R3F inventory, Recast From→To, buttery avatar (§9), dollhouse + floor switcher.

### v2 — Wayfinding parity (next)

- Amenities layer (exits, washrooms, elevators, food, info), floor picker that follows avatar, blue-dot + heading cone.
- Kiosk mode (attract loop + touch), mobile layout + joystick, embed share (`?from&to&floor`), QR at entrances, offline floor-image cache.
- Step-free preference persisted, nearest-exit/coffee shortcut, recents/saved.

### v3 — Venue OS (later)

- Exhibitor portal: claim booth, upload branding (existing logo sockets), price/availability + heatmap, hold/book with expiry, invoices/payments.
- Organizer: multi-event templates, role-based admin, audit log of layout edits (persist History), versioned publish + rollback.
- Ops: live occupancy/crowd heatmap, incident/cleaning pins, signage sync, analytics (searches, routes, dwell).
- Phone AR footpath experiment.

### Backlog (parked, real-world parity with Mappedin/ExpoFP/Google Indoor)

- [ ] Amenity POI set + icons + search weight
- [ ] Auto-tour first-visit + onboarding coach marks
- [ ] Night/kiosk lighting presets, signage content slots
- [ ] CDN + cache headers for floor images/GLBs, storage policy
- [ ] Auth/roles + per-event scoping, audit trail
- [ ] Persisted prefs (mode, floor, recents) per user
- [ ] E2E: author → publish → route → book on 2 floors

## 11. Premade inventory (canonical v1 — 22 items, R3F 1:1 rebuilds)

Source of truth: `src/assets/metadata/catalog.v1.json` (14) + `booth-sizes.v1.json` (8). All Blender `.blend` → `archive/blender-ref/`; rebuild procedurally per Phase 2. Anchors/colliders/branding sockets preserved.

### A. Booths — 8 sizes @ 2.8m high, open front (+Z), 3 wall proxies, ground origin

1. `booth-10x10` — 3.048×3.048m — standard inline
2. `booth-28x10` — 8.534×3.048m — wide inline
3. `booth-20x20` — 6.096×6.096m — island starter
4. `booth-14x38` — 4.267×11.582m — deep peninsula
5. `booth-28x36` — 8.534×10.973m — large island
6. `booth-27x50` — 8.230×15.24m — pavilion
7. `booth-28x54` — 8.534×16.459m — pavilion XL
8. `booth-40x45` — 12.192×13.716m — anchor hall

- Plus `booth-frame` (4×2.5×4m base module) + `booth-ceiling` (4×4m cap) for custom dims.

### B. Structure / circulation — 5

9. `wall-panel` — 1×2.5×0.1m — draw-extruded walls, openings for doors
10. `floor-tile` — 4×4m — floor fill/grid
11. `stairs` — 2×8m footprint, 4m rise, portal_lower/upper — cross-floor
12. `escalator-entrance` — same envelope as stairs, yellow accents — cross-floor alt
13. `elevator-entrance` — 2×2.6m face, door_left/right — step-free portal

### C. Furniture / exhibitor — 5

14. `table` — 1.2×0.75×0.6m — booth furnishing
15. `chair` — 0.5×0.85×0.55m — seating
16. `display-case` — 1.2×1.1×0.5m (+opaque variant) — product showcase, interaction socket
17. `banner-stand` — 1×2m, branding socket 0.95×1.8m — signage/exhibitor brand
18. `safe` — 0.6×0.8×0.6m — cash/valuables, interaction socket

### D. Logistics / back-of-house — 2

19. `pallet` — 1.2×0.15×0.8m — freight
20. `forklift` — 1.2×2.2×3m (+low variant) — ops dressing, service socket

### v2 additions (not in current Blender set — add after 1:1 parity)

Info desk, podium, rope barrier/queue rail, planter, bench, trash bin, food kiosk, washroom/exit/ATM sign totems, door/gate, ramp (step-free), escalator mid-segment, Amenity pins for search.

Each item ships: dims + footprint + collider + anchor + facing + branding/interaction/portal sockets + low variant where listed. Unit test per §6 Phase 2.

## 12. Exhaustive no-floorplan kit (v2+ — build full venues from empty scene)

Goal: from a blank scene an admin can compose a hospital with external parking or an Olympic sports complex using only inventory + draw tools. §11 stays the v1 parity set; below is the ordered expansion. Naming: `category-name-variant`, meters, ground origin, portal/interaction/branding sockets where marked.

### E. Building shell (new — nothing here exists yet)

- `shell-slab` 12×0.3×12m, `shell-column` 0.4×4×0.4m grid, `shell-beam`, `shell-facade-panel` 4×4m, `shell-curtain-wall` 4×3.5m glass, `shell-roof-flat`, `shell-roof-skylight`, `shell-canopy` 6×4m entrance, `shell-loading-dock` door 3×3m + bumper.
- Openings: `door-single` 1×2.1m, `door-double` 1.8×2.1m, `door-sliding` 2.4×2.2m (hospital), `door-fire` rated, `gate-vehicle` 6m sliding, `window-strip` 4×1.5m, `reception-screen` glass.

### F. Interior rooms (parametric shells with door openings)

- `room-office` 4×6m, `room-meeting-8`, `room-meeting-20`, `room-ward-4bed`, `room-icu-single`, `room-consult`, `room-surgery-suite` (OT table + light + pendants), `room-lab`, `room-pharmacy`, `room-triage-bay`, `room-waiting-30`, `room-cafeteria`, `room-kitchen`, `room-locker`, `room-washroom-m/f/accessible`, `room-prayer`, `room-childcare`, `room-vip-lounge`, `room-press`, `room-control` (CCTV wall), `room-storage`, `room-mep` (AHU/electrical).
- Sports: `hall-arena` 60×40×12m bowl section, `court-basketball` 28×15m, `court-badminton` 13.4×6.1m ×8 grid, `pitch-football` 105×68m, `track-400m` 8-lane oval, `pool-olympic` 50×25×2m + deck, `pool-diving` tower, `velodrome-segment`, `gym-fitness` rig row, `dojo-mat` 12×12m, `locker-team-20`, `doping-control`, `physio-room`, `warmup-hall`.

### G. Furniture / interiors (extends §11C)

Desk, desk-return, office-chair-task, filing-cabinet, shelf-2m, sofa-3, coffee-table, bed-hospital (2×0.9m, rails, IV socket), bedside-table, overbed-table, stretcher-gurney, wheelchair, iv-stand, privacy-curtain-rail + curtain, waiting-bench-4, kiosk-checkin (touch socket), queue-rail-retractable, podium-lectern, stage-deck 2×1m, stage-steps, drape-backwall, red-carpet-roll, planter-indoor/outdoor, bench-outdoor, bin-recycle/waste/sharps (hospital), coat-rack, whiteboard, tv-wall-55/85 (content socket).

### H. Medical (hospital-ready)

Nurse-station-counter, med-cart, crash-cart, ot-table, ot-light, anesthesia-machine, ventilator, patient-monitor (screen socket), xray-viewbox, ultrasound-cart, dialysis-chair, lab-bench + fume-hood, pharmacy-shelf + hatch, triage-desk, help-desk, wayfinding-totem-hospital (dept colors), bed-head-unit (oxygen/suction rails), handwash-basin, sluice-sink, linen-cart, waste-cart-yellow, morgue-gurney, ambulance-bay canopy + bollards.

### I. Sports / Olympics

Podium-123, timing-gate + photo-finish gantry, scoreboard-big (content socket), shot-clock, judges-table-8, media-desk-row, camera-platform, commentary-box, floodlight-mast 30m, field-goal posts, hoop-portable, volleyball-net, tennis-net + umpire-chair, starting-blocks, hurdles ×set, javelin/discus/hammer cage, high-jump/pole-vault mats + bar, gym-rig + plates-tree + bench-press, treadmill-row, bike-row, spin-bike, mat-stack, barrier-crowd (2m steel), tent-3x3/6x3, marquee-10x20, flag-pole + podium flags, medal-tray, anti-doping desk, mixed-zone barrier + backdrop (brand socket).

### J. Exterior / parking / landscape (hospital + stadium)

- Parking: `park-bay-car` 2.5×5m, `park-bay-accessible` 3.6×5m, `park-bay-ambulance` 3.5×8m, `park-ticket-machine`, `park-barrier-arm`, `park-sign-gantry`, `park-wheelstop`, `ev-charger-dual`, `bike-rack-10`, `moto-bay`.
- Roads: `road-2lane` segment, `kerb-ramp`, `crosswalk-zebra`, `speed-bump`, `drop-off-canopy` + bollard-row, `helipad-circle` 15m (hospital terrace), ambulance-only lane markings.
- Landscape: `tree-small/med/large`, `hedge-2m`, `grass-tile-4m`, `paver-tile-2m`, `fence-mesh-2m`, `fence-hoarding-2.4m` (brand socket), `gate-turnstile`, `cctv-pole`, `light-pole-8m`, `bench-plaza`, `drinking-fountain`, `play-zone-small`, wayfinding-pylon 4m (content socket).

### K. MEP / ops (visible set only)

AHU-box, chiller-yard unit, generator-container, transformer-kiosk, pump-room skid, fire-hose-reel cabinet, extinguisher-point, exit-sign + emergency-light, sprinkler-zone valve, nurse-call dome light, PA-speaker-pole, access-reader door, turnstile-tripod, metal-detector + xray-belt (stadium gate), cleaning-cart, laundry-cage.

### L. Signage / wayfinding (all with content socket)

Hanging-blade sign, totem-2m, pylon-4m, door-plaque, bed-number-flag, dept-color-band, floor-number-wall, exit-runner, parking-zone-letter (A/B/C), gate-number-big, seat-row-marker, field-marker-cone, barrier-branding-skin.

### M. People / vehicles / dress (low-poly, colliders off, perf-budgeted)

Staff-doctor/nurse/security/volunteer (static poses), crowd-seated/standing sets (instanced), wheelchair-user, stretcher-team-2, ambulance-van, shuttle-bus-20, police-car, broadcast-van + dish, golf-cart, forklift already in §11.

### Build order (no-floorplan readiness)

1. E shell + F rooms + J roads/parking (hospital or stadium bowl first).
2. G furniture + H/I domain fit-out.
3. K ops + L signage + search index rebake.
4. M dress + lighting pass + iGPU perf gate.

- Rule: every new item gets footprint + collider + sockets + low variant like §11; no item without a search keyword (booth/company/POI/amenity).

## 13. Building-type packs (compose from §11 + §12, no floorplan needed)

Each pack = base (§11 booths + E–M) + type-specific rooms/furniture/signage. Search keywords in brackets.

### Mall (2-level galleria + food court + multiplex)

- Shell: atrium-void with skylight, shopfront-glass-4m [shop], kiosk-island-2x2 [kiosk], food-counter-3m [food], restaurant-seating-40, cinema-box-100 (screen + projector + seats), play-area-kids, prayer-room, family-washroom, baby-care.
- Furniture: store-shelf-gondola, hanging-rail, mannequin, till-counter + POS (interaction), mall-bench, planter-large, bin-trio, directory-totem [directory], sale-blade-sign (brand).
- Ops: service-corridor-2m, goods-lift-2t, compactor-yard, security-room (CCTV wall), lost-found desk, valet-desk + key cabinet, EV row + bike hub at parking.
- Routing anchors: entries N/S/E/W, atrium stairs + 2 elevators + escalator pair per level, anchor stores as landmarks.

### Sports complex (Olympic: stadium + aquatic + indoor halls + village)

- Stadium: bowl-20k (tier segments + vomitories), running-track-400m-9lane, football-pitch-hybrid, floodlight-4-mast, big-screen-2 (content), commentary-gantry, mixed-zone, doping-control, medical-room-pitchside.
- Aquatic: pool-50m-10lane + timing pads, dive-tower-10m, warmup-pool-25m, lifeguard-chair ×6, DF room, water-quality lab.
- Indoor: arena-5k (court + retractable seats), warmup-hall-3-court, gym-strength-40-station, physio + ice-bath row, weigh-in room, judges/media tribune.
- Village/support: dining-hall-500, resi-block-100-bed, laundry-hub, transport-mall (bus bays ×8), accreditation-tent, security-search lanes (detector + belt ×6), broadcast-compound (trucks + dishes), parking-team-bus + OB van row.

### Hospital (tertiary 200-bed + ED + diagnostics + terrace helipad)

- Front: drop-off-canopy + ambulance-bay ×3 (red lane), triage-6-bay, ED-20-cubicle, waiting-100, registration-kiosks ×6, pharmacy-outpatient hatch.
- Core: OPD-consult ×20, diagnostics (X-ray ×2, CT, MRI, US ×4, lab + sample-drop), daycare-chemo-12, dialysis-20, ICU-20 + isolation ×4, OT-6 + sterile corridor, LDR-4, NICU-12, wards 4-bed ×10 + private ×20.
- Support: nurse-station per 20 beds, med-store, linen/sluice/clean-utility each floor, kitchen + patient-food trolley, morgue + viewing, chapel/prayer, medical-records, finance/billing counters.
- Vertical: bed-lift-2 (2.4×1.8m car) + visitor-lift-2 + stairs-2 + ramp-ED; pneumatic-tube station, bed-parking bays, crash-cart per zone.

### Convention / expo centre (from current 2-floor map)

- Halls A/B/C divisible (operable wall), pre-function foyer, registration-counters ×12, exhibitor-service-desk, cloak-500, business-lounge, speaker-ready room, press-wall (brand), poster-boards ×50, breakout-8.
- Show ops: dock-leveller ×4 + forklift lane, power-trench grid, rigging-points ceiling, AV control + interpreter booths ×2.

### Airport terminal (small regional) / transit hub

- Kerb + trolley-bay, checkin-row-12 + bag-belt, security-lanes ×4 (tray + body scanner), hold-room-200, gates-4 (seat + podium + jet-bridge door), retail-kiosk row, food-court-6, prayer + nursing + accessible washrooms, customs-desk, baggage-hall (2 belts + oversize), meet-greet barrier, bus/taxi rank + signage gantry.

### University campus block / office tower

- Classrooms 30/60/120, lab-studio, library-stack + reading-80, faculty-cabins ×12, seminar-20, cafeteria-200, dorm-room-2 + warden flat, gym + courts (share sports pack), parking-cycle-200 + car-150.
- Office: reception + turnstile-4 + reader doors, workstations-6-pack, cabins, huddle-4, boardroom-16 (VC bar + content), server-room + UPS, pantry + breakout, terrace-seating, parking-stacker bays.

Each pack ships as a preset scene template + pick-list UI (checkboxes per room/count) so an admin starts from empty → picks pack → counts → auto-layout grid → drag-tune → save. Templates reuse the same colliders/portals/search contracts, so routing works day one.

## Implementation addendum — 12 October 2026

The user has now authorized implementation and parallel subagents, superseding the older spec-only deliverable note. The first authoring/data/navigation slice is integrated; see docs/R3F-migration-execution.md and docs/R3F-migration-inventory.md for the reviewed gaps, implementation and remaining phases.

Execution order is corrected: verified reference COPY first, then procedural parity/provider replacement, then detachment/purge. Active originals were preserved. Actual inventory is 14 base + 5 variants + 8 sized booths, 27 native exports/22 identities; generic booth height and sized-booth height remain distinct. Drafts and publication are separate APIs, and new authored walls/openings share exact renderer/collision/navigation geometry. This addendum does not mark the procedural inventory replacement or original-mall cutover complete.

Continuation — 13 October 2026: the v1 procedural inventory/provider, authoring and wayfinding implementation is now integrated, including arbitrary picked or entered metric floor points, full avatar clearance, draft/publication gates, low/opaque quality variants, guidance and safe resource retirement. The current execution record supersedes earlier incomplete-stage notes. Original-mall/saved-shell/custom-upload GLBs remain explicit compatibility features; originals used by those paths or historical reference validation were preserved. Device/FPS qualification, production authorization and v2/v3 packs remain separate scope as recorded in docs/R3F-migration-execution.md.

## Implementation addendum — 13 October 2026

The built-in v1 provider cutover is implemented: 22 procedural identities / 27 quality recipes (14 base + eight sized booths + five low/opaque recipes). Default asset validation/CI measure generated bounds, nodes, sockets, materials, UVs, variant interfaces and budgets independently of native Blender files; historical native validation/publish remains opt-in. Canonical authoring, drag/drop inventory, typed paired portals, separate drafts/publication, named From/To navigation, step-free guidance, minimap and manual exploration are integrated. See `docs/R3F-migration-execution.md` for current verification, limits and the remaining unnamed-point interaction.

The original-mall page, existing saved floor shells and uploaded custom GLBs are retained compatibility features. Thus built-in inventory is procedural, but a strict every-route zero-GLB statement is not true. The verified reference snapshot and read-only SHA retirement ledger protect used files and original sources; no asset deletion is triggered by provider detachment. v2/v3 domain inventories and release auth/tenant/concurrency/device qualification remain explicitly separate scope.
