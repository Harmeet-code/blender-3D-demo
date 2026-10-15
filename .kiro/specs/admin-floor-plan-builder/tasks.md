# Implementation Plan: Admin Floor Plan Builder

## Overview

This implementation plan covers the development of the Admin Floor Plan Builder feature, which provides a dedicated 3D floor planning interface with drag-and-drop capabilities, polygon-shaped booth editing, and dynamic visual feedback. The implementation follows existing codebase patterns and reuses the unchanged building wire schema through an isolated adapter.

## Restoration and status rules

- Original tasks 1-43 and their detailed subtasks have been recovered; their numbering is retained.
- Tasks 44-63 record missing implementation work and the complete Demo parity TODO; they do not replace tasks 1-43.
- Checked tasks record implementation and non-test review in the approved scope; they do not certify deferred tests or live interaction acceptance. Tasks 44 and 49 remain open for backend compatibility and authenticated round-trip acceptance.
- Original automated/performance/accessibility test tasks 28-42 are retained as **deferred by user request**, not completed or required to execute now.
- Task 43 covers compiler, lint, formatting and build checks without running the deferred tests.
- Requirements 1-12 retain their original identifiers; Requirement 13 adds P01-P25 Demo parity traceability.
- Preserve the port order: viewer sidebar first, authoring forms, keyboard shortcuts, then debug/polish.
- Declined items stay documented with reasons at the end; a separate grid router is not an accepted substitution for Recast.

## Implementation record — 15 October 2026

46 implementation/check tasks are complete in code and reviewed within the non-test scope. Tasks 44 and 49 remain open: authenticated persistence has not been established, and the unchanged backend still uses bounding-box collision proxies for unknown procedural assets. Tasks 28-42 remain deferred by the user.

The subsequent implementation audit corrected the deviations listed in [implementation-audit.md](implementation-audit.md). It reopened task 49 because exact studio collision/navigation and the backend publication gate do not yet share the same physical representation. This is an actual compatibility gap, not merely a missing test. The original task IDs and acceptance criteria remain intact.

Actual implementation filenames are mapped in the design and src/floor-plan-builder/README.md; original task filenames describe responsibilities, not a requirement to create duplicate facades. TypeScript, lint and formatting pass. The standalone build, worker bundling and initial Canvas rendering pass. The root build still stops at three missing pre-existing Vite helpers. No tests, measured performance/accessibility acceptance or successful live persistence are claimed. The recovered snapshots remain unchanged.

## Tasks

The later user-supplied booth refinement extends tasks 12, 17, 21-22, 27, 51 and 53 without
renumbering the restored plan. Its implementation/constraints are recorded in
`src/floor-plan-builder/booth-design.md`; new recipes honor the brief's explicit 0.10/0.15 m
clearances and shared closed-wall snapping. Backend tasks 44/49 and deferred tests stay open.

The later circulation brief extends tasks 13, 15, 21-22, 27 and 53 with procedural
stairs/elevator/escalator/ramp construction, editable physical proportions, authored animation
targets, landing approaches, overview geometry and an isolated development preview. Details and
dimension corrections are recorded in `src/floor-plan-builder/circulation-design.md`.
Task 51 still covers the existing flat-floor Recast integration only: native stair/elevator
off-mesh costs, directional escalators, walkable 3D ramps and physical rail/door colliders remain
outstanding integration work. They are not completed by the visual asset refinement.

- [x] 1. Set up project structure and directory layout
  - Create isolated feature directory at `src/floor-plan-builder/`
  - Create subdirectories: `components/`, `hooks/`, `model/`, `types/`, `api/`
  - Reuse installed dependencies; add feature development/build scripts to the root `package.json`
  - Reference existing API client at `src/features/building/api/layouts-client.ts`
  - _Requirements: 1.1-1.8, 12.1-12.9_
  - **Complexity**: Simple

- [x] 2. Define core TypeScript types and interfaces matching backend schema
  - Create `types/floor-plan-types.ts` with all type definitions
  - Separate the inferred editor object model from wire instances; serialize required `assetId`/`url`, `dimensions`, `collidable` through the adapter
  - Define object-specific interfaces: `BoothObject`, `StairsObject`, `TentObject`, `AmenityObject`, `AvatarObject`
  - Define state management types: `FloorPlanState`, `FloorPlanValidationError`
  - Ensure compatibility with `floorAuthoringSchema` from `building-schema.ts`
  - _Requirements: 3.9, 5.8, 9.11-9.14, 12.2, 12.6_
  - **Complexity**: Moderate

- [x] 3. Create Zod schemas for validation matching backend schema
  - Create `types/schemas.ts` with all Zod validation schemas
  - Define `boothSchema`, `stairsSchema`, `tentSchema`, `amenitySchema`, `avatarSchema`
  - Validate editor metadata separately and validate generated instances through the actual unchanged backend schema
  - Create `floorPlanObjectSchema` as a single refined object or a flat discriminated union of object schemas; never nest an amenity union as a union option
  - Create API request/response schemas matching `floorAuthoringSchema`
  - _Requirements: 3.1-3.3, 8.8, 9.11-9.14, 12.2_
  - **Complexity**: Moderate

- [x] 4. Define validation rules and utilities
  - Create `model/validation.ts` with polygon and placement validation
  - Import and use `isSimplePolygon` from `@/utils/geometry/polygon.ts`
  - Implement `validateBoothPolygon()` for simple closed polygons (unique vertices, implicit closure)
  - Implement `validateObjectPlacement()` using exact transformed footprints after broad-phase bounds checks; allow edge contact with no arbitrary mandatory spacing
  - Create `utils.ts` with helper functions (polygon area, signed area, coordinate conversion)
  - _Requirements: 2.2, 3.3-3.5, 3.9, 8.1-8.8_
  - **Complexity**: Complex

- [x] 5. Implement Zustand store for state management with version tracking
  - Create `model/floor-plan-store.ts` using Zustand
  - Define state shape: `FloorPlanState` with instances mapping to `floorAuthoringSchema`
  - Implement actions: `addObject`, `updateObject`, `deleteObject`, `selectObject`
  - Implement drag-and-drop actions: `startDrag`, `updateDrag`, `endDrag`
  - Implement save status actions: `markDirty`, `saveSuccess`, `saveError`
  - Track editor/save revisions separately; delegate publication version management to the existing client and do not access its private maps
  - _Requirements: 7.10-7.11, 9.1-9.5, 9.15-9.19, 12.3_
  - **Complexity**: Complex

- [x] 6. Create API client for floor plan operations with version management
  - Create `api/floor-plan-client.ts` with API functions
  - Reuse existing `getLayout()`, `saveLayout()`, `getLayoutDraft()`, `saveLayoutDraft()` from `layouts-client.ts`
  - Implement `finalizeLayout()` for publishing changes via `/api/events/:eventId/layout` endpoint
  - Implement authorized draft load/save without a publication-version header or publication-version advancement
  - Accept a fetched version only when adopting its published document; never reaccept an old object after successful publication
  - Use existing API client patterns and schemas from `dto.ts`
  - _Requirements: 9.2-9.20, 12.5_
  - **Complexity**: Moderate

- [x] 7. Create main page component
  - Create `components/AdminFloorPlanPage.tsx`
  - Set up routing for `/admin/floor-plan`
  - Implement floor navigation with `FloorSelector`
  - Implement inventory sidebar with `InventorySidebar`
  - Implement main canvas with `FloorCanvas`
  - Implement validation panel with `ValidationPanel`
  - _Requirements: 1.1-1.8, 2.1-2.8, 7.1-7.15, 8.9_
  - **Complexity**: Complex

- [x] 8. Create floor selector component
  - Create `components/FloorSelector.tsx`
  - Implement floor dropdown/selector UI
  - Handle floor switching logic with state persistence
  - Display current floor information
  - _Requirements: 1.2, 7.1-7.2, 7.10, 13.2, 13.17_
  - **Complexity**: Simple

- [x] 9. Create inventory sidebar component
  - Create `components/InventorySidebar.tsx`
  - Organize inventory by categories (booths, stairs, tents, amenities, avatars)
  - Implement draggable inventory items with proper drag types
  - Add inventory item count badges
  - _Requirements: 2.1-2.8, 5.1-5.11, 11.1-11.10_
  - **Complexity**: Moderate

- [x] 10. Implement inventory drag-and-drop functionality
  - Create `hooks/use-inventory-drag.ts` custom hook
  - Implement drag start from inventory sidebar
  - Implement drag ghost rendering in 3D canvas
  - Implement drop detection and object placement
  - Handle drag cancellation and cleanup
  - _Requirements: 2.1-2.8, 8.1, 10.13, 13.14, 13.18_
  - **Complexity**: Complex

- [x] 11. Create main floor canvas component
  - Create `components/FloorCanvas.tsx`
  - Set up R3F Canvas with proper camera configuration
  - Implement floor background rendering
  - Implement walkable zones visualization
  - Handle object selection and highlighting
  - Implement hit detection for object placement
  - _Requirements: 2.1-2.8, 6.1-6.8, 7.2, 7.9, 7.15_
  - **Complexity**: Complex

- [x] 12. Create booth 3D rendering component
  - Create `components/booths/Booth3D.tsx`
  - Implement polygonal rendering using `extrudeGeometry` (unique vertices, implicit closure); do not copy the demo booth renderer
  - Support dynamic surface-based coloring from floor texture
  - Implement selection highlighting
  - Implement hover visual feedback
  - _Requirements: 3.1-3.9, 4.1-4.8, 6.1-6.8, 13.4_
  - **Complexity**: Complex

- [x] 13. Create stairs 3D rendering component
  - Create `components/stairs/Stairs3D.tsx`
  - Implement multi-step stairs geometry using `boxGeometry`
  - Add handrail support
  - Support configurable steps, tread, and rise
  - _Requirements: 5.2, 6.1-6.8, 7.12, 11.3, 11.8_
  - **Complexity**: Moderate

- [x] 14. Create tent 3D rendering component
  - Create `components/tents/Tent3D.tsx`
  - Implement barn, gazebo, and marquee tent styles
  - Support configurable width, depth, and height
  - Add roof geometry details
  - _Requirements: 5.3, 5.10, 6.1-6.8, 11.4, 11.9_
  - **Complexity**: Moderate

- [x] 15. Create amenity 3D rendering components
  - Create `components/amenities/Washroom3D.tsx`
  - Create `components/amenities/KidsZone3D.tsx`
  - Create `components/amenities/Entrance3D.tsx`
  - Implement appropriate signage and visual representation
  - Support gender selection for washrooms
  - _Requirements: 5.4-5.6, 5.11, 6.1-6.8, 7.12, 11.5, 13.19_
  - **Complexity**: Moderate

- [x] 16. Create avatar 3D rendering component
  - Create `components/avatars/Avatar3D.tsx`
  - Implement standing-person representation using R3F primitives (cylinder body, sphere head)
  - Support positioning and rotation in 3D space
  - Implement selection highlighting
  - _Requirements: 5.7, 5.11, 6.1-6.8, 7.13_
  - **Complexity**: Moderate

- [x] 17. Create booth editor component
  - Create `components/booths/BoothEditor.tsx`
  - Implement polygon vertex editing UI
  - Add vertex manipulation controls (add, remove, move)
  - Validate polygon in real-time using `isSimplePolygon`
  - Show preview of booth with edited polygon
  - _Requirements: 3.1-3.9, 8.2-8.5, 13.10, 13.12, 13.18_
  - **Complexity**: Complex

- [x] 18. Implement dynamic surface-based coloring
  - Create `hooks/use-floor-color.ts` custom hook
  - Sample floor texture color at booth position
  - Calculate bounded median color from interior booth-footprint samples using source calibration and original image dimensions, including legacy image-size fallback
  - Update booth material color dynamically
  - Support fallback to configurable default color
  - _Requirements: 4.1-4.8_
  - **Complexity**: Complex

- [x] 19. Implement procedural-only rendering for Phase 1 and retain the constraint for later phases
  - Create `components/procedural/ProceduralBooth.tsx`
  - Create `components/procedural/ProceduralStairs.tsx`
  - Create `components/procedural/ProceduralTent.tsx`
  - Create `components/procedural/ProceduralAmenity.tsx`
  - Define procedural geometry for each object type
  - Retain hyper-realistic geometry/material details as later procedural work; never introduce external model loading
  - _Requirements: 5.1-5.11, 6.1-6.8, 11.1-11.10_
  - **Complexity**: Moderate

- [x] 20. Create floor plan editor hook with shortcut handling
  - Create `hooks/use-floor-manager.ts` custom hook
  - Encapsulate complex state transitions
  - Provide undo/redo functionality with per-floor history
  - Handle object grouping operations
  - Manage selection history
  - Implemented in GroupingPanel, transformGroup and per-floor selection trails: rigid group move/rotation/duplication; individual shape edits; previous/next selection
  - _Requirements: 7.9-7.12, 10.1-10.19, 13.9-13.14, 13.17-13.23_
  - **Complexity**: Complex

- [x] 21. Implement drag ghost rendering
  - Update `components/FloorCanvas.tsx` with drag ghost
  - Render ghost representation during drag operations
  - Update ghost position in real-time
  - Show collision feedback on ghost
  - Implement drag opacity and styling
  - _Requirements: 2.1-2.8, 8.1-8.9, 13.18-13.19_
  - **Complexity**: Moderate

- [x] 22. Implement collision highlighting
  - Add collision detection feedback to `FloorCanvas`
  - Highlight colliding objects when dragging
  - Show collision distance indicators
  - Implement visual feedback for actual overlaps/boundary violations; optional clearance measurement must not impose an unrequested 0.5m aisle
  - _Requirements: 2.2, 2.8, 8.1, 8.5-8.9_
  - **Complexity**: Moderate

- [x] 23. Implement object selection system
  - Update `model/floor-plan-store.ts` with selection management
  - Implement selection highlighting in `FloorCanvas`
  - Add selection keyboard shortcuts
  - Support multi-selection if needed
  - _Requirements: 8.9, 10.3-10.4, 10.10-10.13, 13.1-13.2, 13.14_
  - **Complexity**: Moderate

- [x] 24. Implement polygon editing validation
  - Create `model/polygon-validator.ts` for polygon validation
  - Import and use `isSimplePolygon` from `@/utils/geometry/polygon.ts`
  - Implement simple polygon check (no self-intersections)
  - Implement implicit final-edge handling; do not require an explicit closing vertex
  - Implement unique vertices check (no repeated vertices)
  - Implement positive area check
  - Provide detailed error messages for each validation failure
  - _Requirements: 3.1-3.9, 8.2, 8.5, 8.8-8.9_
  - **Complexity**: Complex

- [x] 25. Implement undo/redo system with per-floor history
  - Extend `model/floor-plan-store.ts` with history management
  - Implement command pattern for undo/redo operations
  - Add undo/redo keyboard shortcuts (Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z); Shift+Z remains zone drawing and Shift+X remains armed removal
  - Implement per-floor history stacks
  - Implement history stack limits
  - _Requirements: 7.10-7.11, 10.11, 13.17, 13.22-13.23_
  - **Complexity**: Complex

- [x] 26. Add routing configuration
  - Configure route for `/admin/floor-plan` in routing system
  - Use explicit event ID query identity and the deployment `/floorplan/` prefix
  - Add unsaved authoring navigation guards and existing venue sign-in UI
  - Keep server role checks authoritative; URL access alone is not authorization
  - _Requirements: 1.1-1.8, 7.10, 9.9, 9.19, 12.9_
  - **Complexity**: Simple

- [x] 27. Create inventory definition schema with acceptance scenarios
  - Create `model/inventory-definition.ts` with complete inventory schema
  - Define schema for all object types with: id, name, category, procedural geometry, dimensions, collidable
  - Define booths: shape, dimensions/limits, default color, procedural recipe identity; instance assetId comes from the metadata adapter
  - Define stairs: steps, tread, riser, total height, width, material properties
  - Define tents: base dimensions, peak height, overhang, pole positions, canopy
  - Define amenities: bounding box, collision behavior, visual representation
  - _Requirements: 5.1-5.11, 11.1-11.10, 12.8_
  - **Complexity**: Moderate

- [ ] 28. Create test infrastructure
  - **Deferred by user request: do not implement or run tests now**
  - Future infrastructure shall reuse Bun, React Testing Library and Playwright; do not introduce Jest
  - Configure test utilities and mocks
  - Set up CI/CD test integration
  - _Requirements: 12.7, 12.9_
  - **Complexity**: Simple

- [ ] 29. Write unit tests for validation logic
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test polygon validation functions using `isSimplePolygon`
  - Test exact polygon overlap, concavity, edge contact and legacy obstacle/wall handling without a mandatory spacing rule
  - Test field validation with backend schema
  - Test edge cases and error conditions
  - _Requirements: 2.2, 3.1-3.9, 8.1-8.11_
  - **Complexity**: Moderate

- [ ] 30. Write unit tests for store actions
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test state management actions
  - Test drag-and-drop state transitions
  - Test selection management
  - Test save status changes with version tracking
  - Test undo/redo operations with per-floor history
  - _Requirements: 7.10-7.12, 9.15-9.19, 10.11, 13.17, 13.22-13.23_
  - **Complexity**: Moderate

- [ ] 31. Write component tests for UI components
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test `AdminFloorPlanPage` integration
  - Test `FloorSelector` interaction
  - Test `InventorySidebar` rendering
  - Test `ValidationPanel` display
  - _Requirements: 1.1-1.8, 2.1-2.8, 7.1-7.15, 8.9, 13.1-13.23_
  - **Complexity**: Moderate

- [ ] 32. Write 3D rendering tests
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test booth rendering with polygon geometry (unique vertices, implicit closure)
  - Test stairs rendering with multiple steps
  - Test tent rendering with different styles
  - Test amenity rendering with various configurations
  - Test avatar rendering with R3F primitives
  - _Requirements: 3.1-3.9, 5.1-5.11, 6.1-6.8_
  - **Complexity**: Complex

- [ ] 33. Write drag-and-drop integration tests
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test inventory drag from sidebar
  - Test drop on floor and object creation with backend schema
  - Test drag cancellation and cleanup
  - Test collision feedback during drag
  - _Requirements: 2.1-2.8, 8.1-8.9, 10.13, 13.14_
  - **Complexity**: Complex

- [ ] 34. Write property test for polygon validity preservation
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - **Property 1: Polygon validity preservation**
  - **Validates: Requirements 3.1-3.9**
  - Run minimum 100 iterations
  - Generate random polygons with unique vertices, verify simple polygons with distinct finite vertices, implicit closure and positive area
  - **Complexity**: Complex

- [ ] 35. Write property test for collision avoidance
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - **Property 2: Object placement collision avoidance**
  - **Validates: Requirements 2.2, 8.6-8.7**
  - Run minimum 100 iterations
  - Generate random placements and verify exact positive-area overlap prevention while permitting touching edges
  - **Complexity**: Complex

- [ ] 36. Write property test for save/load data integrity (round-trip)
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - **Property 3: Save/load data integrity (Round-trip)**
  - **Validates: Requirements 9.11-9.14**
  - Run minimum 100 iterations
  - Generate random layouts, save/reload via API, verify data integrity with backend schema
  - **Complexity**: Complex

- [ ] 37. Write property test for finalize/publish workflow
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - **Property 4: Finalize workflow preserves layout version**
  - **Validates: Requirements 9.15-9.18**
  - Run minimum 100 iterations
  - Generate layouts with draft state, finalize, verify version increment and success response
  - **Complexity**: Complex

- [ ] 38. Write property test for drag-and-drop object creation
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - **Property 5: Drag-and-drop object creation**
  - **Validates: Requirements 2.1-2.8, 11.10**
  - Run minimum 100 iterations
  - Generate random inventory items and drop positions, verify object creation with backend schema
  - **Complexity**: Complex

- [ ] 39. Write property test for undo/redo consistency with per-floor history
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - **Property 6: Undo/redo consistency with per-floor history**
  - **Validates: Requirements 7.10-7.11, 13.17, 13.22-13.23**
  - Run minimum 100 iterations
  - Generate random edit sequences per floor, verify undo restores original state
  - **Complexity**: Complex

- [ ] 40. Write integration tests for full workflows
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test complete floor plan creation workflow with backend schema
  - Test object placement and editing workflow with polygon validation
  - Test validation and error resolution workflow
  - Test save/draft and finalize/publish workflow
  - Test version management with `X-Venue-Version` header
  - _Requirements: 1.1-1.8, 2.1-2.8, 7.1-7.15, 9.1-9.20, 13.1-13.23_
  - **Complexity**: Complex

- [ ] 41. Performance testing
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Measure the retained 50+ object / 60 FPS target with declared viewport, DPR, browser and hardware
  - Test floor plan load time under 2 seconds
  - Measure the original five-second save transport budget separately from the two-second autosave debounce
  - Record finalize latency and its API/network environment; do not assert a universal two-second pass
  - Profile memory usage with complex layouts
  - _Requirements: Non-Functional Performance, 12.9_
  - **Complexity**: Complex

- [ ] 42. Accessibility testing
  - **Deferred by user request: retain criteria; do not implement or run tests now**
  - Test keyboard navigation for all features including shortcut handlers
  - Verify ARIA labels on interactive elements
  - Test screen reader compatibility
  - Fix any accessibility issues
  - _Requirements: Non-Functional Accessibility, 13.1-13.23_
  - **Complexity**: Moderate

- [x] 43. Final checkpoint - non-test checks; tests deferred
  - **Updated scope: deferred tests remain unchecked; this checkpoint cannot certify them**
  - Run feature TypeScript, lint, formatting and production build; do not run the deferred test suites
  - Review the rendered development page and console; final refreshed preview showed no new errors or warnings
  - Record performance/accessibility acceptance as unverified until later execution; do not claim fixed FPS/latency guarantees
  - Document full-application baseline blockers separately from feature checks
  - Verify adapter/client/schema compatibility by review; keep a successful live save/reload as outstanding evidence
  - _Requirements: 12.9_
  - **Complexity**: Simple

## Additional tasks: retained gaps and Demo parity

- [ ] 44. Complete reversible metadata and legacy-record persistence
  - Preserve editor metadata in a bounded/versioned `fpb:v1:` envelope in instance.assetId; normal transforms/dimensions/collidable remain wire fields
  - Synchronize Room/POI/Zone/Portal records without adding server/schema fields
  - Handle malformed/unknown reserved versions with recovery, and preserve unrelated legacy records
  - Review encode -> actual buildingLayoutSchema parse -> decode and retain successful live save/reload as outstanding evidence
  - _Requirements: 5.8, 9.10-9.14, 12.2, 12.6-12.8_
  - **Status**: Metadata serialization and canonical record preservation are implemented in adapter.ts; generated documents pass through the unchanged schema. Authenticated save/publish/reload remains outstanding. Wire-shape compatibility does not establish physical-consumer compatibility: see task 49 and the implementation audit. The local backend on port 8000 refused a read-only connection during this audit.

- [x] 45. Complete zone authoring and directory behavior
  - Retain rectangle/polygon walkable/blocked/display zones with names/types and vertex add/remove/move controls
  - Support selected-zone move, duplicate, staged removal, numeric editing and directory picking
  - Keep invalid drafts correctable; use task 63 for point-undo and task 62 for removal application
  - _Requirements: 7.9, 8.5, 10.9, 13.20, 13.23_
  - **Status**: Implemented: rectangle/polygon zones, label/type/vertices, directory selection, move/duplicate, point-undo and staged removal.

- [x] 46. Complete floor-form transactions, image lifecycle and calibration
  - Register name/elevation/dimension/calibration form changes in unfinished draft state, including invalid input
  - Block switches/reload/destructive actions while draft-action history exists, including redo-only history
  - Apply/discard all fields consistently; sync form values after undo/redo and reject gestures that would overwrite another pending edit
  - Confirm image removal and floor deletion; preserve all data on Cancel and reject deletion of the last floor
  - Reproject objects/zones/obstacles/walls/POIs/landings coherently from the prior calibration; do not re-scale a freshly drafted metric boundary twice
  - Retain the current image on upload failure and handle uploads finishing after floor/document changes
  - _Requirements: 7.6-7.11, 13.17, 13.21_
  - **Status**: Implemented: floor drafts and guards, image/floor confirmations, upload revision guards and calibration reprojection through an immutable reference basis. Live upload/calibration acceptance is unverified.

- [x] 47. Port exact demo shortcuts, presets and editor focus
  - Preserve all Requirement 10 key meanings, including early return after undo/redo and editable-target guards
  - Port the actual demo preset chips/defaults/cycle order, independent of the selected inventory recipe
  - Keep POI stair/entrance cycle state independent of booth preset state; target move/duplicate by last selected entity
  - Reveal/focus matching editor sections and keep help synchronized with actual commands
  - _Requirements: 10.1-10.19, 13.10-13.13_
  - **Status**: Implemented: reference preset catalog and independent POI cursor, exact resolver guards, early undo/redo returns, editor-section focus and matching help.

- [x] 48. Complete color sampling for legacy and replacement images
  - Use loaded natural image dimensions when authoring.imageSize is absent, even when the sampler texture is downsampled
  - Sample interior transformed footprints through calibration; exclude transparent pixels, retain fallback and explicit-color precedence
  - Resample after geometry/transform/image/calibration changes; heat/night/selection overlays must not overwrite base colors
  - _Requirements: 4.1-4.8, 13.3, 13.8_
  - **Status**: Implemented: original/natural-size sampling basis, calibrated interior medians, explicit/fallback colors and independent display overlays.

- [ ] 49. Complete collision with legacy obstacles and walls
  - Use shared metric conversion and exact rotated/scaled footprints with no mandatory spacing
  - Include legacy obstacle polygons and wall thickness/segments; avoid double-counting booth Rooms/instances
  - Make ghost validity, apply, finalize and navigation agree about blocked geometry
  - _Requirements: 2.2, 2.8, 7.13-7.14, 8.6-8.7_
  - **Status**: Studio preview/Apply/Recast use exact transformed polygons, calibrated legacy obstacles, authored walls and non-booth room walls. The unchanged shared/server publication gate interprets unknown `fpb:v1:` assets using bounding boxes and also sees canonical booth Rooms. Therefore publication and preview can disagree for concave or skewed objects. This task is reopened pending backend physical-consumer integration; no server/schema changes or weakened collision flags were introduced to hide the mismatch.

- [x] 50. Complete separate draft and saved-step histories
  - Keep unfinished draft actions, applied per-floor saved steps, and server-save revision identity distinct
  - Preserve original AuthoringHistory floor scope; never store whole-building snapshots as per-floor undo
  - Keep synchronized records and connector ownership coherent through undo/removal/floor deletion
  - Block floor change for unresolved draft undo or redo history, then clear only the resolved draft scope
  - _Requirements: 7.10-7.12, 9.15-9.19, 13.16-13.17, 13.22-13.23_
  - **Status**: Implemented: bounded per-floor draft/saved-step stacks, pending removals and revision-aware saves. Connector inverses change related records only and guard later edits; incoming links survive unrelated saved-step undo.

- [x] 51. Replace the studio grid router with the existing Recast engine
  - Encode/normalize the current applied document into the existing navigation input and use the shared Recast worker/client
  - Support walkable masks, collidable footprints, legacy obstacles/walls and individually positioned portal landings
  - Cancel/ignore stale route results after document revision/floor/destination changes
  - Show actionable no-route/readiness feedback and per-floor instructions; use task 57 for endpoint markers
  - Remove the standalone grid/Dijkstra implementation from the accepted route path; do not port demo grid A*
  - _Requirements: 7.12-7.14, 13.5, 13.25_
  - **Status**: Implemented: owned NavigationClient using the existing Recast worker; normalized footprint obstacles, Room dedupe, cancellation, endpoint clearance and labelled route segments. No studio grid router remains.

- [x] 52. Complete validation feedback and accessible editing
  - Highlight invalid vertices/fields and related conflicting objects, with a structured summary and actionable corrections
  - Expose vertex controls, resize handles, numeric placement/rotation, object/zone directories and error recovery without Canvas-only operations
  - Preserve invalid forms and document state through recoverable errors/context loss
  - _Requirements: 3.7-3.8, 8.1-8.11, Non-Functional Accessibility_
  - **Status**: Implemented: structured placement errors, invalid field/vertex indicators, conflict highlighting, numeric alternatives, Canvas error boundary and context-loss recovery. Full accessibility acceptance is unverified.

- [x] 53. Retain complete inventory parameter definitions
  - Keep all required and extended recipes, fresh-instance semantics and stable renderer/recipe identity
  - Expose or explicitly derive stair steps/tread/rise/width/material parameters consistently
  - Preserve barn/gazebo/marquee styles, tent overhang/pole/canopy parameters, booth limits and amenity signage
  - Keep realistic procedural detailing deferred, while retaining these authored parameter contracts
  - _Requirements: 5.1-5.11, 6.1-6.8, 11.1-11.10_
  - **Status**: Implemented: 22 recipes, stable renderer identities and limits; stair step/rise/tread/rail/material controls; barn/gazebo/marquee, eaves/overhang/poles/canopies; amenity signage. Realistic detail remains deferred.

- [x] 54. Complete existing-app integration and non-test checks
  - Keep the new subtree and old routes/state isolated, and reuse shared UI/API/schema/navigation helpers
  - Record isolated feature check results independently of full application build results
  - Fix feature compiler/lint/format errors and document pre-existing missing Vite helper blockers
  - Document standalone dev/build/preview usage, backend requirement and reserved-recipe compatibility limits
  - _Requirements: 1.1-1.8, 12.1-12.9_
  - **Status**: Feature TypeScript, lint and formatting pass; standalone production build and development rendering pass. README records usage, compatibility limits and the three pre-existing root Vite helper blockers.

- [x] 55. Port viewer sidebar, booth directory and hover details first
  - Implement the new frontend's BoothDrawer-equivalent rows: booth no/name/size/price/status/company/contacts and Focus
  - Place the booth directory in Floors with demo status colors, selection and click-to-focus
  - Show hover booth no/status/price and clear stale tooltips after leave/removal/floor changes
  - Keep all values backed by the same canonical instance/room; optional missing fields remain legible
  - _Requirements: 1.6, 13.1-13.2, 13.4_
  - **Status**: Implemented in ViewerPanel/FloorCanvas: full readonly booth rows, status-colored Floors directory, focus and bounded hover details with stale-tooltip cleanup.

- [x] 56. Port heat, availability and night ViewOptions
  - Expose heat/availability toggles in visitor/preview sidebar and night/heat controls in ViewOptions
  - Use demo legend/status visual language and reversible display-material overrides
  - Retain base explicit/automatic surface colors independently of display mode; do not write view preferences into booth metadata
  - _Requirements: 4.5, 13.3, 13.8_
  - **Status**: Implemented: preview/sidebar heat, availability legends and night lighting; view state stays separate from authored colors/metadata.

- [x] 57. Port labelled START/REACHED route markers
  - Draw START and REACHED at actual route endpoints, on the correct floors, with readable labels and DOM equivalents
  - Clear markers with route cancellation/document changes; do not substitute snapped grid nodes for selected destinations
  - _Requirements: 7.13-7.14, 13.5_
  - **Status**: Implemented: START/REACHED scene labels on actual endpoints, route DOM labels and cancellation/invalidation cleanup.

- [x] 58. Port camera presets and orbit lock
  - Add iso/top/reset controls to the world/preview HUD with labels and active state
  - Separate rotation lock from the gesture-owned controls lock; recover both consistently after cancellation
  - Fit the active floor/object bounds across viewport resizing and preserve usable pan/zoom in locked mode
  - _Requirements: 7.15, 13.6_
  - **Status**: Implemented: iso/top/reset HUD, aspect-aware floor framing, selection focus and orbit lock separate from gesture ownership.

- [x] 59. Port 1200 ms auto-tour
  - Cycle the current floor's booth directory every 1200 ms, highlighting and focusing the selected booth
  - Handle empty floors and deleted targets; stop on manual authoring/floor change/unmount and expose explicit Start/Stop
  - Respect reduced-motion preferences without removing access to the tour controls
  - _Requirements: 13.7_
  - **Status**: Implemented: owned 1200 ms interval, selection/focus, Start/Stop and cancellation for manual work, hidden page, floor/revision changes and unmount; camera changes do not animate.

- [x] 60. Complete click/drag disambiguation and Shift-drag parity
  - Maintain one owner for each pointer gesture and explicit movement thresholds
  - Prevent pointer-up/click events after drag from selecting, placing or applying twice
  - Keep original geometry during duplicate drag; cancel/lost capture/outside drop must leave document/history unchanged
  - _Requirements: 2.6, 10.13, 13.14_
  - **Status**: Implemented: 3 px threshold, pointer capture/ownership, original-preserving Shift-drag duplication and cancellation cleanup. Full pointer-interaction acceptance remains unverified.

- [x] 61. Port dev-only coordinate debug and AUDIT helpers
  - Add `?debug` coordinate/calibration overlay showing pointer source/world positions and scene transform information
  - Gate helpers to the explicit dev/debug policy; install/remove narrowly scoped read-only console AUDIT helpers
  - Report boundary/vertex/recipe/room/portal consistency without logging auth/contact payloads or mutating production state
  - _Requirements: 13.15_
  - **Status**: Implemented: development plus ?debug gate, source/world overlay, scoped readonly FLOOR_PLAN_AUDIT helpers, wire/room/portal validity and cleanup without auth/contact payloads.

- [x] 62. Port pending-remove preview and Apply/Discard
  - Stage booth/POI/zone removal, hide it in the scene/directory preview, and display "Apply to save"
  - Preserve canonical records and local/server snapshots until Apply; commit deletion once, including related Room/POI/Portal data
  - Restore the exact target/selection on Escape/Discard; include staged removal in draft history and floor-switch guards
  - _Requirements: 7.10-7.11, 10.10, 13.17, 13.22-13.23_
  - **Status**: Implemented: hidden pending-remove preview, Apply to save, exact selection restoration on Discard and owned canonical cleanup through the adapter.

- [x] 63. Port zone point-undo
  - Add a labelled Remove last point action for unfinished zone rectangle/polygon drawing
  - Remove only the most recent point, keep earlier points/tool active, and redraw the ghost
  - Keep this separate from whole-operation undo and avoid changing committed document/history/save revisions
  - _Requirements: 7.9, 13.20_
  - **Status**: Implemented: Remove last point stages only the last unfinished drawing vertex; tool/earlier points/applied document remain intact.

## Demo parity traceability (all supplied TODO items)

All P01-P23 items now have implementation paths. This table records code coverage; full interaction and live backend acceptance remain unverified.
The original TODO component names map to equivalent new frontend roles; the old frontend is not rewritten.

| ID | Supplied TODO item | Requirement | Tasks | Current new-studio status |
|---|---|---|---|---|
| P01 | BoothDrawer rows and Focus | 13.1 | 17, 55 | Implemented: viewer rows, optional placeholders and Focus |
| P02 | Status-colored booth directory in Floors; click-to-focus | 13.2 | 8, 23, 55 | Implemented: Floors booth directory, demo colors and focus |
| P03 | Visitor heat/availability toggle | 13.3 | 56 | Implemented: reversible display preference |
| P04 | Hover tooltip: booth no/status/price | 13.4 | 12, 55 | Implemented: booth hover details and cleanup |
| P05 | START/REACHED route endpoints | 13.5 | 51, 57 | Implemented: endpoint labels, floor scope and safe Recast joins |
| P06 | Iso/top/reset camera presets and orbit lock | 13.6 | 58 | Implemented: HUD and separate orbit lock |
| P07 | Auto-tour every 1200 ms | 13.7 | 59 | Implemented: owned 1200 ms tour and cleanup |
| P08 | Night/heat ViewOptions | 13.8 | 56 | Implemented: night/heat ViewOptions |
| P09 | Human-friendly NameUtils dedupe | 13.9 | 20, 47 | Implemented: shared name pool, trimming and free -2/-3 suffix |
| P10 | Height/rotation presets, YouTube, gate, tags, contacts | 13.10 | 17, 47, 53 | Implemented: fields and actual reference preset chips |
| P11 | POI move/duplicate shortcut modes | 13.11 | 20, 47 | Implemented: independent POI modes and selected-entity transforms |
| P12 | Right-click/double-click polygon finish | 13.12 | 17, 24 | Implemented: finish handlers without repeated closing vertex |
| P13 | Shift-letter suite with input-focus guards | 13.13 | 20, 47 | Implemented: guarded resolver, focus and early undo/redo returns |
| P14 | Click-vs-drag disambiguation | 13.14 | 10, 60 | Implemented: 3 px threshold and pointer ownership; acceptance unverified |
| P15 | Dev-only coordinate panel and console AUDIT | 13.15 | 61 | Implemented: dev-only overlay and scoped readonly audit |
| P16 | Saving/Saved/Unsynced finalize/save-all | 13.16 | 5, 6, 50 | Implemented: serialized revision-aware saves; live persistence unverified |
| P17 | Block switching with unsaved draft history | 13.17 | 46, 50 | Implemented: floor/object/zone/drawing and redo-only draft guards |
| P18 | Rect/polygon/drag-place/ghost/resize beside presets | 13.18 | 10, 17, 21, 47, 52 | Implemented: freeform/presets/ghosts/handles/aspect/snap |
| P19 | Stair/entrance ghost, rotation, connects editing | 13.19 | 15, 20, 47, 51 | Implemented: stair/entrance placement and independent landing coordinates |
| P20 | Zone point-undo | 13.20 | 45, 63 | Implemented: staged last-point removal |
| P21 | Confirm floor-image removal and floor deletion | 13.21 | 46 | Implemented: image/floor confirmations and stale-action guards |
| P22 | Per-floor saved-step AuthoringHistory | 13.22 | 25, 50 | Implemented: draft/saved-step separation and related-object inverses |
| P23 | Pending-remove hide + Apply to save | 13.23 | 45, 50, 62 | Implemented: pending hide, Apply/Discard and canonical cleanup |
| P24 | Blazor HostBridge command channel | 13.24 | Declined | Declined: no Blazor host; share URLs/iframe embedding |
| P25 | Demo grid A* engine port | 13.25 | Declined; repair 51 | Declined demo engine port; shared Recast replacement implemented in 51 |

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases

### Implementation guidance

1. Reuse the existing structure/model/client foundation (1-6, 26-27, 44), fixing only incomplete acceptance.
2. Establish the minimum scene/selection path and port viewer sidebar/directory/hover detail (7-8, 11-12, 19, 23, 55).
3. Complete authoring forms, floor/zone transactions, inventory controls, collision and metadata (9-18, 21-24, 45-46, 48-50, 52-53, 60, 62-63).
4. Port exact keyboard semantics and the real preset catalog after the authoring paths are available (20, 25, 47).
5. Finish Recast directions, viewer/HUD polish, auto-tour and dev-only diagnostics (51, 56-59, 61).
6. Complete integration and non-test checks (54, 43), reporting deferred acceptance separately.
7. Keep all original verification tasks 28-42 deferred under the user's instruction; do not run them now.

### Dependency summary

- Work groups are logical phases, not authorization to spawn parallel agents.
- Types/schema/adapter precede persistence and whole-document transactions.
- Minimum scene, selection and data supply precede the viewer sidebar; viewer parity precedes new authoring polish.
- Collision and source-coordinate conversion must agree before calibration, placement and navigation are accepted.
- Draft/saved-step boundaries precede shortcuts, pending removal and unsaved-floor guards being marked complete.
- Recast input adaptation precedes route-marker acceptance; a separate grid route is not a passing implementation.
- Keep implementation evidence and acceptance evidence distinct. Deferred tests remain unchecked; a successful build does not prove live backend or interaction behavior.

## Task dependency graph

Tasks within a phase may depend on an earlier listed task; the groups do not imply all tasks run concurrently.

~~~json
{
  "waves": [
    {
      "id": 0,
      "label": "Isolated structure and route",
      "tasks": [
        1,
        26
      ]
    },
    {
      "id": 1,
      "label": "Types, schemas, geometry and inventory contract",
      "tasks": [
        2,
        3,
        4,
        27
      ]
    },
    {
      "id": 2,
      "label": "Document state and unchanged transport",
      "tasks": [
        5,
        6,
        44
      ]
    },
    {
      "id": 3,
      "label": "Minimum scene and selection foundation",
      "tasks": [
        7,
        8,
        11,
        12,
        19,
        23
      ]
    },
    {
      "id": 4,
      "label": "Viewer sidebar first",
      "tasks": [
        55
      ]
    },
    {
      "id": 5,
      "label": "Authoring forms, inventory and geometry",
      "tasks": [
        9,
        10,
        13,
        14,
        15,
        16,
        17,
        18,
        21,
        22,
        24,
        45,
        46,
        48,
        49,
        52,
        53
      ]
    },
    {
      "id": 6,
      "label": "Draft transactions and pointer behavior",
      "tasks": [
        25,
        50,
        60,
        62,
        63
      ]
    },
    {
      "id": 7,
      "label": "Reference keyboard shortcuts",
      "tasks": [
        20,
        47
      ]
    },
    {
      "id": 8,
      "label": "Navigation, view polish and developer tools",
      "tasks": [
        51,
        56,
        57,
        58,
        59,
        61
      ]
    },
    {
      "id": 9,
      "label": "Integration and non-test checkpoint",
      "tasks": [
        54,
        43
      ]
    }
  ],
  "deferredTests": [
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
    37,
    38,
    39,
    40,
    41,
    42
  ]
}
~~~

## Declined items retained with reasons

- [-] P24 — Blazor HostBridge command channel: no Blazor host exists in this stack; share URLs and iframe embedding cover the integration need.
- [-] P25 — Demo grid A* engine port: Recast remains the engine; port interaction and visual language only. Task 51 replaces the former separate studio grid router with the shared Recast worker.
