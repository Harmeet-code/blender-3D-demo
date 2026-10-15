# Implementation tasks: Admin Floor Plan Builder

These tasks replace the superseded 43-task plan. Requirements R1-R10 and design.md are canonical.
The realistic-object phase remains deferred. All tasks below are required for this implementation.

## Foundation

- [ ] T1. Replace requirements/design/tasks with one consistent demo-derived contract. R1-R10.
- [ ] T2. Add isolated frontend subtree and lazy pathname entry; preserve existing routes. R1.
- [ ] T3. Define validated metadata, versioned procedural recipe catalog and geometry utilities. R3-R4.
- [ ] T4. Implement reversible backend adapter, canonical rooms/zones/portals and unknown-data preservation. R8.
- [ ] T5. Add isolated immutable store, draft revisions, per-floor transactions and undo/redo. R2,R9.

## Authoring and rendering

- [ ] T6. Build reference-inspired shadcn studio shell, floor/object directories and shortcut help. R2,R7.
- [ ] T7. Add native R3F procedural renderers for every required/extended recipe and floor contact. R3.
- [ ] T8. Implement inventory drag ghost, drop/cancel, click-to-place and numeric alternatives. R3.
- [ ] T9. Implement rectangle/polygon tools, vertex editing, apply/discard and finish/cancel gestures. R2,R4.
- [ ] T10. Implement move/resize/rotate/duplicate/armed removal and all reference booth fields. R2,R7.
- [ ] T11. Implement walkable/blocked zone drawing/edit/move/duplicate/remove. R6.
- [ ] T12. Implement full demo keyboard mappings, editable-target/modifier guards and help. R7.
- [ ] T13. Implement surface color sampling with transforms/calibration, updates and fallback. R5.

## Floors, navigation and persistence

- [ ] T14. Implement floor creation/rename/reorder/delete/image upload/remove/calibration with guards. R6.
- [ ] T15. Implement entrances/amenities and paired stair/elevator/escalator landings. R6,R8.
- [ ] T16. Add walkable direction preview with cross-floor connector transitions. R6.
- [ ] T17. Implement event-scoped local recovery, server draft restore/discard, autosave and retry. R9.
- [ ] T18. Implement existing auth, readiness validation, explicit finalize and version conflict recovery. R9.

## Verification

- Deferred by user request: T19 automated model tests.
- Deferred by user request: T20 automated browser tests.
- [ ] T21. Run typecheck, lint, format and production build; fix feature failures and document baseline blockers. R10.
- [ ] T22. Verify accessible numeric controls, responsive panels, camera recovery and 50-object scene evidence. R10.

## Acceptance examples

- Place each recipe twice: distinct instance IDs; encode/parse/decode preserves editable properties.
- Draw a concave booth with unique vertices: accepted; self-intersection/repeated closure rejected.
- Add a walkable zone; edit vertices; cancel floor switch while form/drawing dirty.
- Edit floor A, then B; undo A after switching back; B remains unchanged.
- Shift+R resizes; Shift+Z draws a zone; Shift+X arms remove; Ctrl/Cmd+Shift+Z only redoes.
- Move a booth between two image colors: automatic color changes; explicit color stays.
- Drop outside Canvas or Escape mid-gesture: no history/document changes and orbit recovers.
- Draft save races a newer edit: older acknowledgement does not clear dirty state.
- Finalize version 7: publishes expected 7 and advances to 8 without rolling back.
- Collision/route preview uses exact footprints and walkable masks, including connected floor landings.
- Unknown legacy records survive save; malformed reserved metadata is reported and not lost.
- Browser observes no Blender/GLB/GLTF requests from the new studio.

