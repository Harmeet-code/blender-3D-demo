# Roadmap World Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete connected avatar presence, floor-local navigation, route-based teleport/autopilot, polygon walls, and animated dollhouse presentation.

**Architecture:** Keep the current portal graph as the cross-floor authority. Build one Recast NavMesh per normalized floor from walkable polygons; route local movement against it. Receive validated avatar snapshots over the existing websocket handle and interpolate them in a render-only layer. Keep all display animation transforms separate from saved layout coordinates.

**Tech Stack:** React, R3F, Three.js, Rapier, Recast Navigation JS, Zustand, GSAP, Bun tests.

---

### Task 1: Subscribe to presence and render interpolated remote avatars

**Files:**
- Modify: `src/frontend/pages/world-page/WorldPage.tsx`
- Modify: `src/frontend/entities/viewer/model/viewer-store.ts`
- Modify: `src/frontend/shared/api/ws.ts` only if teardown callbacks are insufficient
- Create: `src/frontend/widgets/world-viewport/RemoteAvatarLayer.tsx`
- Create: `src/frontend/entities/viewer/model/interpolate-avatar.ts`
- Test: `tests/frontend-results.test.ts`

- [ ] **Step 1: Add interpolation and peer-removal tests**

Test midpoint interpolation for positions and shortest-angle interpolation for yaw; test that a close event removes the peer and local avatar updates never enter the remote map.

```ts
expect(interpolateAvatar(from, to, 0.5).position).toEqual([1, 1, 1]);
expect(interpolateAvatar(from, to, 0).floorId).toBe(from.floorId);
```

- [ ] **Step 2: Verify the focused tests fail**

Run: `bun test tests/frontend-results.test.ts`
Expected: interpolation helper and remote removal behavior are missing.

- [ ] **Step 3: Add explicit peer lifecycle methods**

Add `removeRemoteAvatar(id)` and `clearRemoteAvatars()` to the viewer store. Open one `openPresenceSocket` connection in a `WorldPage` effect; send local avatar snapshots at the documented 15–20 Hz, upsert valid peers, and clear them on close/unmount.

- [ ] **Step 4: Interpolate in render time**

`RemoteAvatarLayer` keeps target/current transforms in refs and advances them in `useFrame`; render one avatar per remote ID on its `floorId`. Do not write 60-FPS interpolation frames back into Zustand.

- [ ] **Step 5: Verify and commit**

Run: `bun test tests/frontend-results.test.ts && bun run typecheck && bun run build`.

### Task 2: Replace straight-line path with Recast floor NavMeshes

**Files:**
- Modify: `src/frontend/entities/building/model/pathfinding.ts`
- Modify: `src/frontend/widgets/world-viewport/AvatarController.tsx`
- Modify: `src/frontend/entities/building/model/building-schema.ts` only if walkable polygon input needs a typed setting
- Test: `tests/building-schema.test.ts` or new `tests/navigation.test.ts`
- Dependency: pin supported `@recast-navigation/*` packages after checking their maintained README/API and Three.js compatibility.

- [ ] **Step 1: Define deterministic route fixtures**

Add floor polygons with a direct corridor, an obstacle, and disconnected walkable regions. Assert route waypoints stay on the generated mesh and no-route returns an empty typed result.

- [ ] **Step 2: Confirm the path test fails with the existing straight line**

Run: `bun test tests/navigation.test.ts`.

- [ ] **Step 3: Generate a NavMesh from walkable room polygons**

Triangulate only rooms of type `walkable`/configured walkable surfaces, initialize Recast once per normalized layout revision, and cache by `floorId + layout revision`. Exclude walls and non-walkable booth interiors.

- [ ] **Step 4: Query paths from AvatarController**

Snap query endpoints to the nearest polygon within a bounded radius; return typed no-path errors when either endpoint cannot project. Preserve `findFloorPath` for cross-floor transitions.

- [ ] **Step 5: Verify package and runtime paths**

Run: `bun test tests/navigation.test.ts && bun run typecheck && bun run build`; inspect the bundle for required WASM URLs under Vite’s production base path.

### Task 3: Extrude walls from room boundaries

**Files:**
- Create: `src/frontend/widgets/world-viewport/RoomWalls.tsx`
- Modify: `src/frontend/widgets/world-viewport/FloorStack.tsx`
- Test: `tests/building-schema.test.ts` or new `tests/room-walls.test.ts`

- [ ] **Step 1: Test segment geometry and entrance openings**

For a 4×4 rectangle and a concave polygon, assert each boundary edge creates wall spans whose total length equals polygon perimeter minus a 2 m entrance opening where configured.

- [ ] **Step 2: Confirm the geometry test fails before the extrusion helper exists**

Run: `bun test tests/room-walls.test.ts`.

- [ ] **Step 3: Build walls from polygon edges**

Extrude remaining edge spans to the configured 3 m default height; convert image coordinates through the existing normalizer once; skip walkable-only polygons and preserve booth entrances.

- [ ] **Step 4: Integrate in each floor group**

Render generated walls at the canonical floor transform and obey active-floor/dollhouse visibility. Reuse material/geometry where edge dimensions match.

- [ ] **Step 5: Verify**

Run: `bun test tests/room-walls.test.ts && bun run typecheck && bun run build`; browser-check rectangle, concave room, entrance, and B1 height.

### Task 4: Animate dollhouse stack/unstack and fade walls

**Files:**
- Modify: `src/frontend/widgets/world-viewport/FloorStack.tsx`
- Modify: `src/frontend/widgets/world-viewport/WorldCanvas.tsx`
- Test: new `tests/floor-presentation.test.ts`

- [ ] **Step 1: Test the display transform independently**

Assert entering dollhouse changes render-only Y offsets and exiting restores canonical offsets; saved `layout.floors[].heightOffset` remains unchanged.

- [ ] **Step 2: Add reversible GSAP animation**

Animate floor display groups to/from stack offsets, fade wall materials, cancel/reverse when toggled mid-transition, and dispose/unmount inactive floor LOD consistently.

- [ ] **Step 3: Verify behavior and resource limits**

Run: `bun test tests/floor-presentation.test.ts && bun run typecheck`; browser-check normal→dollhouse→normal, interrupted toggles, physics body count, and active-floor picking.

### Task 5: Add double-click teleport and room-search autopilot

**Files:**
- Modify: `src/frontend/features/room-teleport/RoomSearch.tsx`
- Modify: `src/frontend/widgets/world-viewport/AvatarController.tsx`
- Modify: `src/frontend/entities/viewer/model/viewer-store.ts`
- Test: new `tests/teleport.test.ts`

- [ ] **Step 1: Test destination resolution and cancellation**

Test that teleport requires a valid entrance; autopilot consumes the floor-local route, stops at the destination, and cancellation clears remaining waypoints.

- [ ] **Step 2: Add explicit navigation commands**

Add store actions `teleportToRoom(roomId)` and `startAutopilot(roomId)` using the active normalized layout; do not overload `selectBooth` to mutate avatar movement.

- [ ] **Step 3: Wire room search and canvas gestures**

Selecting a room from search starts autopilot to its valid entrance; double-clicking a walkable point projects it to the NavMesh and teleports immediately. Single-click booth selection remains unchanged.

- [ ] **Step 4: Verify**

Run: `bun test tests/teleport.test.ts && bun run typecheck && bun run build`; browser-test blocked point, valid entrance, cancellation, and cross-floor route preservation.
