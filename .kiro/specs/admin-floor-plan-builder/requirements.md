# Requirements Document

## Restoration and implementation status

The detailed twelve-requirement document has been recovered from Kiro local history and
cross-checked against the Codex session's pre-rewrite file inventory. Original requirement numbers
remain stable. Exact recovered copies and the later condensed copies are preserved in `snapshots/`.
Corrections below resolve the earlier P1 findings; they do not certify implementation completion.
See `tasks.md` for the original 43 tasks, added gap tasks, and outstanding acceptance work.
Requirement 13 and the P01-P25 traceability table retain every item from the user's Demo parity TODO.
Automated tests and test execution are deferred by the user's instruction, "forget about tests".
Acceptance criteria remain part of the product contract even when their automated checks are deferred.

The implementation audit is recorded in [implementation-audit.md](implementation-audit.md).
Requirements 8.7 and 9.13-9.16 still have backend compatibility/acceptance limits tracked by
tasks 44 and 49. A valid wire document alone does not establish agreement with existing physical
consumers. These criteria remain required; this status note does not relax them.

## Introduction

The Admin Floor Plan Builder is a new admin-facing feature that provides a dedicated 3D floor planning interface. This feature enables venue administrators to create, edit, and manage 3D booth layouts with polygon-shaped (non-rectangular) booths, drag-and-drop inventory management, and dynamic visual feedback.

### Goals

- Provide an intuitive 3D floor planning interface for venue administrators
- Enable creation of polygon-shaped booths (not just rectangles)
- Implement drag-and-drop inventory system for placing objects directly in 3D scene
- Support dynamic booth coloring based on underlying surface color
- Create procedural 3D placeholders using R3F (React Three Fiber) without external GLB files
- Provide a new dedicated URL route for floor planning
- Establish clean separation from existing admin-builder functionality

## Glossary

- **Admin Floor Plan Builder**: The new admin interface for 3D floor planning with drag-and-drop capabilities
- **Booth**: A retail or exhibition space that can be placed on a floor with polygon shape
- **Inventory**: Collection of reusable 3D object definitions with metadata for placement in the scene
- **R3F (React Three Fiber)**: React rendering library for Three.js used to create 3D graphics
- **Polygon-shaped**: Simple shapes defined by distinct vertices with an implicit final edge, including concave shapes
- **Dynamic Coloring**: Automatic booth material color matching to the underlying floor texture
- **Drag-and-Drop**: Direct manipulation of 3D objects using mouse/touch interactions
- **Walkable Zones**: Areas designated for pedestrian movement on the floor plan
- **Source Coordinates**: Pixel-based coordinates from floor images, converted to meters via calibration
- **World Meters**: Metric coordinates used for 3D rendering and collision detection
- **Layout Version**: Backend-managed version identifier for concurrent edit handling
- **Draft**: Applied editor changes saved independently of the published layout; an unfinished gesture/form is separate
- **Finalize**: Publish changes from draft to live layout

## Requirements

### Requirement 1: Admin Interface with New URL Route

**User Story:** As a venue administrator, I want to access a dedicated floor planning interface through a new URL, so that I can manage floor layouts without interfering with visitor-facing views.

#### Acceptance Criteria

1. WHEN the user navigates to `/admin/floor-plan?eventId=<id>` (also under `/floorplan/`), THE dedicated admin studio SHALL be displayed
2. THE interface SHALL include navigation controls to switch between floors
3. WHEN navigating away from the admin floor plan URL, THE system SHALL preserve the current state for later return
4. ALL new frontend logic, styles, stores, renderers, and entrypoints SHALL live under `src/floor-plan-builder/`; existing frontend changes SHALL be limited to mounting integration and project scripts
5. THE studio SHALL use its own store and Canvas, reuse shared shadcn primitives, and leave existing editor routes/state isolated
6. THE interface SHALL be heavily inspired by `C:/Users/HarmeetSingh/Desktop/Projects/demo`: floor/booth directory, expandable editor sections, POI/zone tools, calibration, save status, finalize, and shortcut help
7. THE studio SHALL port reference authoring behavior into typed React; booth/extrusion rendering SHALL be newly implemented
8. Event identity and local recovery SHALL be scoped by event ID; the default studio event SHALL be separate from existing visitor events

### Requirement 2: Inventory System with Drag-and-Drop

**User Story:** As a venue administrator, I want to drag inventory items from a sidebar and drop them onto the 3D floor plan, so that I can quickly populate the venue with booths and amenities.

#### Acceptance Criteria

1. WHEN a user drags an inventory item from the sidebar, THE system SHALL display a ghost representation of the item in the 3D scene
2. WHEN an inventory item is dropped onto a floor, THE system SHALL validate its transformed footprint against the floor boundary, blocked regions and collidable objects; invalid placement SHALL be blocked with an error; valid placement SHALL create an instance of the selected recipe
3. WHERE multiple inventory items are available, THE system SHALL organize them into categories (booths, stairs, tents, amenities)
4. WHEN an item is successfully placed, THE system SHALL add it to the floor's instances array with position, rotation, and scale data
5. EVERY placement SHALL create a fresh stable instance ID without mutating the inventory definition
6. Dropping outside Canvas, dropping outside the valid floor, Escape, lost pointer capture, and drag cancellation SHALL create no document/history changes and restore camera controls
7. THE inventory SHALL support search, category grouping, per-recipe placed counts, click-to-place, and numeric placement alternatives
8. Ghost validity SHALL use the same geometry rules as final placement, including legacy obstacles/walls; noncollidable references and walkable zones SHALL not prevent placement

### Requirement 3: Polygon-Shaped Booths

**User Story:** As a venue administrator, I want to create booths with polygon shapes, so that I can match booth placement to irregular floor spaces and architectural features.

#### Acceptance Criteria

1. WHEN a new booth is created, THE system SHALL accept an array of unique polygon vertices defining the booth boundary
2. WHILE creating a booth shape, THE system SHALL display a preview polygon that updates in real-time as vertices are added
3. WHERE a booth polygon has nonfinite/repeated vertices, self-intersections, fewer than three distinct vertices or area below 0.01 m², THE system SHALL prevent placement and display an error; closure SHALL be implicit, and repeating the first vertex at the end SHALL be rejected
4. WHEN a booth is moved or resized, THE system SHALL maintain the polygon vertex relationships and update bounding geometry accordingly
5. WHERE source coordinates are used (pixel-based), THE system SHALL convert to world meters using floor calibration for rendering
6. THE system SHALL provide rectangle, free polygon and preset placement tools; Enter, double-click and right-click SHALL finish a polygon; Escape SHALL discard its preview only
7. THE polygon editor SHALL offer explicit add/remove/move vertex controls with numeric alternatives and preserve an invalid edit for correction instead of silently committing it
8. Resize SHALL preserve the polygon's proportions along each resized axis, provide visible handles, and support aspect-lock/grid-snap options
9. Object polygons SHALL use local meters; scale/yaw/position SHALL produce world footprints; persistence SHALL convert world geometry to source coordinates once

### Requirement 4: Dynamic Surface-Based Coloring

**User Story:** As a venue administrator, I want booths to automatically match the color of the floor surface they're placed on, so that the venue has a cohesive visual appearance.

#### Acceptance Criteria

1. WHEN a booth is placed on a floor, THE system SHALL sample the floor texture color at the booth's position
2. WHILE a booth remains on the floor, THE system SHALL update the booth material color whenever the underlying floor texture color changes
3. IF a booth is moved or its geometry/rotation/scale/calibration changes, THE system SHALL sample the underlying image inside that booth's transformed footprint; the whole-floor dominant color SHALL not be used
4. WHERE floor textures are not available, THE system SHALL immediately revert to a default booth color configurable in settings
5. An explicit per-booth color SHALL override automatic sampling without selection/hover rewriting the stored base color
6. Sampling SHALL use original image dimensions, including images downsampled for rendering; legacy images without persisted `imageSize` SHALL use their loaded natural dimensions
7. Transparent pixels SHALL be excluded and bounded interior median samples SHALL reduce contamination from text/line marks
8. CORS/load/pixel-read failures SHALL show a notice and deterministic fallback, without discarding authored objects

### Requirement 5: Supported Object Types

**User Story:** As a venue administrator, I want to place various venue elements including booths, stairs, tents, and amenities, so that I can create a complete floor plan with all necessary features.

#### Acceptance Criteria

1. WHEN placing a booth, THE system SHALL create a retail/exhibition space with configurable dimensions and polygon shape
2. WHEN placing stairs, THE system SHALL create a stair structure connecting different floors with appropriate slope and tread dimensions
3. WHEN placing barn tents, THE system SHALL create a tent structure with configurable size and position
4. WHEN placing an entrance, THE system SHALL mark a floor location as a primary entry point with directional guidance
5. WHEN placing washrooms (men/women), THE system SHALL create restroom facilities with appropriate signage and dimensions
6. WHEN placing a kids zone, THE system SHALL mark an area designated for children's activities
7. WHEN placing an avatar, THE system SHALL create a reference point for attendee navigation or meeting locations with explicit rendering task
8. FOR ALL object types, THE system SHALL map to existing backend schema with required fields (assetId or url, dimensions, collidable)
9. THE inventory SHALL also retain the extended recipes: elevator, escalator, accessible ramp, information desk, food kiosk, water, first aid, emergency exit, bench, table, barrier, planter and waste bin
10. THE restored tent plan SHALL retain barn, gazebo and marquee style parameters, including bays, eaves, overhang, poles and canopy settings
11. Washrooms SHALL expose gender-specific signage; the standing person SHALL be recognisable and floor-contacting; these are authoring placeholders, not completed realistic assets

### Requirement 6: Procedural-Only Rendering

**User Story:** As a venue administrator, I want to see procedural 3D placeholders for venue elements, so that I can plan layouts without requiring external 3D model files.

#### Acceptance Criteria

1. WHEN rendering any object type, THE system SHALL use R3F primitives (boxes, cylinders, cones) to generate shapes programmatically
2. WHERE realistic objects are needed, THE system SHALL defer implementation to a later phase
3. FOR inventory definitions, THE system SHALL define procedural placeholder geometry for each type
4. WHEN rendering an avatar, THE system SHALL use a standing-person representation composed of R3F primitives
5. WHEN lighting conditions change, THE system SHALL update object appearance to reflect real-time lighting using R3F materials
6. ALL phases, including later realistic rendering, SHALL remain procedural; no Blender, GLB or GLTF model pipeline SHALL be introduced
7. Polygon solids SHALL use Shape/ExtrudeGeometry or valid custom geometry; a curved tube outline SHALL not substitute for a booth surface
8. Native R3F JSX, bounded DPR, demand rendering, resource disposal and floor-contact transforms SHALL follow the existing codebase's conventions

### Requirement 7: Floor Management and Navigation

**User Story:** As a venue administrator, I want to manage multiple floors and navigate between them, so that I can organize the venue layout across different levels.

#### Acceptance Criteria

1. WHEN multiple floors exist, THE system SHALL display a floor selector in the interface
2. WHEN switching floors, THE system SHALL update the 3D scene to show the selected floor's layout
3. WHILE editing a floor, THE system SHALL scope object edits to that floor; explicit connector-link/floor-delete operations SHALL update only their related cross-floor records atomically
4. WHEN a new floor is created, THE system SHALL initialize it with default dimensions and coordinate system
5. WHEN deleting a floor, THE system SHALL confirm action and, IF confirmed, THE system SHALL remove all objects and data associated with that floor; IF cancelled, THE system SHALL leave the floor and all objects fully intact and unmodified
6. THE system SHALL rename/reorder floors, prevent deleting the last floor, and update connector/portal references atomically when floors are removed
7. THE system SHALL upload/replace/remove floor images via the existing media API, preserve the old image on upload failure, and confirm image removal
8. Calibration SHALL use three noncollinear source-pixel corners and known metric width/depth; all objects, zones, obstacles, POIs and portal landings SHALL retain alignment with the image
9. Walkable, blocked and display zones SHALL support rectangle/polygon drawing, labels/types, vertex editing, move, duplicate and removal
10. Unapplied floor-form, object-form, zone-form and drawing changes SHALL block floor switching and destructive/reload operations until explicitly applied or discarded
11. Per-floor undo/redo SHALL replace only that floor's state and related canonical records; undo on floor A SHALL not revert edits on B
12. Stair/elevator/escalator connections SHALL have a stable portal ID, connected floor IDs and individually positioned landings on each connected floor
13. A direction preview SHALL connect selected starts/booths/POIs across walkable areas and paired floor landings, with avatar clearance and obstacle/wall avoidance
14. Disconnected, outside-floor or obstructed destinations SHALL produce actionable errors; route segments SHALL remain clear through the existing Recast engine, without a separate grid route engine
15. Floor selection/camera focus SHALL work through labelled DOM controls; resizing the page SHALL preserve a usable viewport

### Requirement 8: Validation and Error Handling

**User Story:** As a venue administrator, I want clear feedback when my actions are invalid, so that I can quickly identify and fix issues in my floor plan.

#### Acceptance Criteria

1. WHEN a collidable booth footprint overlaps other collidable or blocked geometry, THE system SHALL display an error message and prevent placement; noncollidable references remain allowed
2. WHEN a polygon vertex is placed invalidly, THE system SHALL provide immediate feedback and suggest corrections
3. IF a required field is missing when saving, THE system SHALL display validation errors and prevent save
4. WHEN network operations fail, THE system SHALL display error messages with retry options
5. IF invalid geometry is detected, THE system SHALL highlight problematic areas and suggest fixes
6. Collision SHALL use rotated/scaled exact polygons after broad-phase bounds checks; legacy/unbuffered footprints may touch edges with no arbitrary mandatory 0.5 m spacing. The user's later detailed booth brief explicitly adds editable 0.10 m rectangular / 0.15 m polygon clearances to refined booth recipes; two snapped closed walls may share an edge
7. Legacy authoring obstacles and walls SHALL participate in placement and navigation using the correct calibration; canonical booth rooms and visual instances SHALL be deduplicated
8. THE system SHALL validate positive finite dimensions/scale, unique names/booth numbers, required labels and bounded metadata before applying/persisting
9. Validation feedback SHALL identify related objects/vertices/fields, highlight both invalid ghosts and conflicting objects, and provide a visible summary
10. WebGL context loss/render failures SHALL retain the document and offer viewport recovery; invalid drafts SHALL not crash the whole studio
11. Stale loads, late save acknowledgements and failed imports SHALL not replace newer or invalidated local work

### Requirement 9: Data Persistence with Backend Integration

**User Story:** As a venue administrator, I want my floor plan changes saved automatically while preserving backend compatibility, so that I don't lose work and can track changes over time.

#### Acceptance Criteria

1. WHEN an object is added, moved, or removed, THE system SHALL mark the layout as dirty
2. WHILE idle for 2 seconds after a change, THE system SHALL automatically save the layout to the server as a draft
3. WHEN saving succeeds, THE system SHALL display a success confirmation
4. WHEN saving fails, THE system SHALL maintain unsaved changes and provide retry options
5. IF a draft exists on the server, THE system SHALL indicate draft status and provide options to load or discard
6. WHEN the user finalize changes, THE system SHALL publish the layout via `/api/events/:eventId/layout` endpoint
7. WHEN finalizing succeeds, THE system SHALL receive `{ saved: boolean }` response and update layout version
8. Publication SHALL use the existing client's accepted `X-Venue-Version`; draft saves SHALL neither require this header nor advance the publication version
9. THE system SHALL reuse existing venue authorization for protected writes/draft reads and existing published-read behavior; credentials SHALL remain in memory
10. API access SHALL reuse `getLayout`, `saveLayout`, `getLayoutDraft` and `saveLayoutDraft`; backend endpoints, schemas and database SHALL remain unchanged
11. Procedural instance metadata SHALL be encoded in a bounded, versioned `fpb:v1:` assetId envelope because the server strips undeclared instance fields; metadata SHALL not depend on unknown top-level properties surviving
12. Generated booths SHALL synchronize canonical Room IDs/polygons/labels/prices, connectors SHALL synchronize Portal landings, entrances SHALL synchronize POIs, and zones SHALL use authoring.zones
13. Encode -> buildingLayoutSchema parse -> decode SHALL preserve all editable booth, recipe, color, connector and geometry fields; unrelated legacy data SHALL survive updates
14. Malformed/reserved-version-unknown envelopes SHALL require visible recovery; unknown legacy references SHALL be preserved and rendered procedurally without model loading
15. Draft writes SHALL be serialized and revision-aware; an older acknowledgement SHALL not mark a newer document Saved; failure SHALL preserve local recovery and dirty state
16. Publication SHALL require structural and physical readiness, explicitly flush the current draft, reject intervening edits, and leave new edits dirty when an earlier publication completes
17. `acceptLayoutVersion` SHALL be called only when adopting a fetched published object; after `saveLayout` success the client owns version advancement and no old fetched object SHALL reset it
18. 409/428/auth/network failures SHALL preserve drafts and offer explicit reload/compare/retry/sign-in; automatic blind rebase or publication retry SHALL not occur
19. Local recovery keys SHALL include event/schema identity; restoring/discarding server or local drafts SHALL be explicit and shall guard unfinished/dirty work
20. JSON export/import SHALL validate the complete document and event identity before replacing state

### Requirement 10: Shortcut Handler Parity with Existing Demo

**User Story:** As a venue administrator, I want all keyboard shortcuts to work consistently with the existing demo, so that I can efficiently manage floor plans using keyboard controls.

#### Acceptance Criteria

1. WHEN Shift+S is pressed AND input is not focused, THE system SHALL apply dirty editor/drawing changes
2. WHEN Shift+R is pressed AND input is not focused, THE system SHALL enter booth resize mode
3. WHEN Shift+M is pressed AND input is not focused, THE system SHALL enter move mode for the last selected booth/POI
4. WHEN Shift+D is pressed AND input is not focused, THE system SHALL enter duplicate-placement mode for the last selected booth/POI
5. WHEN Shift+B is pressed AND input is not focused, THE system SHALL enter rectangle booth drawing
6. WHEN Shift+P is pressed AND input is not focused, THE system SHALL enter polygon booth drawing
7. WHEN Shift+T is pressed AND input is not focused, THE system SHALL cycle the actual demo booth preset catalog and enter preset placement; toggling rectangle/polygon recipes is insufficient
8. WHEN Shift+I is pressed AND input is not focused, THE system SHALL cycle stair/entrance POI placement, independently of the booth preset cursor
9. WHEN Shift+Z is pressed AND input is not focused, THE system SHALL enter rectangular walkable-zone drawing
10. WHEN Shift+X is pressed AND input is not focused, THE system SHALL arm cancellable removal and wait for a booth/POI/zone target click
11. WHEN Ctrl/Cmd+Z is pressed AND input is not focused, THE system SHALL undo the active floor's applied edit; Ctrl/Cmd+Shift+Z SHALL redo and return before Shift+Z handling
12. WHEN input fields are focused, THE system SHALL allow standard text editing without triggering shortcuts
13. WHEN an object is being moved, THE system SHALL keep the original object at its start position while creating and moving a duplicate if the Shift key is held
14. WHEN switching floors, THE system SHALL validate that floor-specific operations are permitted
15. FOR all shortcut handlers, THE system SHALL check `isEditableTarget()` before executing shortcuts
16. THE system SHALL ignore repeated/defaultPrevented/conflicting-modifier events and respect contenteditable and shadcn text/combobox/spinbutton controls
17. Escape SHALL cancel an unfinished gesture/drawing/armed removal; Enter/double-click/right-click SHALL finish polygon drawing without inserting repeated vertices
18. Keyboard commands SHALL reveal/focus their matching editor section, and the UI SHALL display help plus labelled buttons for every command
19. Reference truth SHALL be `demo/src/main.js` (`handleAdminShortcut`, `cycleBoothPresetShortcut`, `cyclePoiPlacementShortcut`) and the demo editor modules, not a similarly named existing React handler

### Requirement 11: Inventory Definition

**User Story:** As a venue administrator, I want clearly defined inventory types with their properties, so that I can understand what objects are available and how to use them.

#### Acceptance Criteria

1. FOR ALL inventory types, THE system SHALL define a consistent schema with: id, name, category, procedural geometry definition, dimensions, collidable flag
2. WHEN defining booths, THE system SHALL specify: booth shape (polygon), minimum/maximum dimensions, default color, asset reference
3. WHEN defining stairs, THE system SHALL specify: number of steps, tread depth, riser height, total height, width, material properties
4. WHEN defining tents, THE system SHALL specify: base dimensions, peak height, roof overhang, pole positions, canopy material
5. WHEN defining amenities, THE system SHALL specify: bounding box, collision behavior, visual representation
6. FOR all inventory types, THE system SHALL provide example acceptance scenarios for placement, movement, and editing
7. Definitions SHALL bind stable recipe IDs to procedural renderer identity, validated defaults/limits and supported editor controls; per-instance metadata SHALL be distinct from recipe definitions
8. Stair controls SHALL preserve the relation depth = steps × tread and height = steps × rise, or clearly expose those as derived values; independent inconsistent values SHALL be rejected
9. Tent overhang/pole/canopy settings, material controls, booth dimension limits and explicit type signage from the original plan SHALL be supported by the editor, validated metadata and procedural renderer
10. Two placements of each recipe SHALL have different instance IDs while retaining recipe identity after save/reload

### Requirement 12: Integration with Existing Codebase

**User Story:** As a developer, I want the new admin floor plan builder to follow existing conventions, so that it's consistent with the rest of the application and maintainable.

#### Acceptance Criteria

1. WHEN creating new components, THE system SHALL follow shadcn UI patterns and component structure
2. WHEN defining data types, THE system SHALL compose/import existing BuildingLayout/Floor wire types and spatial helpers; editor metadata SHALL be isolated without changing backend/shared wire schemas
3. WHEN managing state, THE system SHALL use Zustand stores following the pattern of `viewer-store.ts` and `layout-store.ts`
4. WHEN implementing 3D rendering, THE system SHALL use R3F patterns consistent with existing venue components
5. WHEN integrating transport, THE system SHALL follow the existing API client structure in `src/features/building/api/` without creating new backend endpoints
6. FOR all instances, THE system SHALL ensure compatibility with existing schema requiring: assetId or url, dimensions, collidable
7. Existing React 19, TypeScript, R3F, Three.js, Zustand, Zod 3 and shadcn conventions SHALL be reused; the studio SHALL not call old editor/world stores
8. The procedural adapter SHALL remain replaceable when the actual app payload is provided, without changing authoring or geometry semantics
9. Compiler/lint/format/build failures SHALL be reported accurately; isolated feature checks SHALL not be represented as a passing full application build

### Requirement 13: Complete Demo Parity TODO

**User Story:** As an administrator reviewing a one-to-one port, I want every demo parity item
retained with explicit acceptance and implementation status, so that viewer polish and authoring
details are not silently lost during spec consolidation.

The original twelve requirements stay numbered 1-12. This additive requirement tracks the supplied
TODO verbatim in scope. P01-P25 map to the criteria below and to `tasks.md`. Port order remains:
viewer sidebar, authoring forms, keyboard shortcuts, then debug/polish. Viewer behavior belongs in
the new frontend's preview/viewer composition; equivalent old component names are references,
not authorization to rewrite the existing frontend. Existing routes/backend remain isolated.

#### Acceptance Criteria

1. **P01 — BoothDrawer fields:** THE viewer sidebar SHALL show booth number/name/size/price/status/company/contact rows and a Focus button, including graceful handling of empty optional values
2. **P02 — Floor booth directory:** THE Floors area SHALL show the booth directory with demo status colors and click-to-select/focus behavior
3. **P03 — Heat/availability toggle:** THE visitor/preview sidebar SHALL expose heat and availability display modes without modifying booth data
4. **P04 — Hover tooltip:** Booth picking SHALL display booth number, status and price on hover, clear on leave/floor change, and keep equivalent information accessible through DOM selection
5. **P05 — Route endpoints:** Route previews SHALL show labelled START and REACHED endpoint markers at the actual start/destination on their respective floors
6. **P06 — Camera HUD:** THE world/preview HUD SHALL expose isometric, top and reset camera presets plus an orbit-rotation lock, with labels and consistent active state
7. **P07 — Auto-tour:** Auto-tour SHALL cycle booths every 1200 ms, highlight and focus the current booth, and stop cleanly on user cancellation, manual authoring, floor change or unmount
8. **P08 — ViewOptions:** ViewOptions SHALL expose night and heat toggles with demo visual language and preserve explicit/automatic base booth colors underneath temporary display modes
9. **P09 — NameUtils:** Booth/zone/POI names SHALL use the demo's human-friendly unique-name rules, including normalization, case handling and duplicate suffix behavior
10. **P10 — Booth form:** THE editor SHALL retain height/rotation presets, YouTube URL, gate, tags and contacts alongside booth dimensions, number/name, company, status and price
11. **P11 — POI shortcuts:** The PortalEditor-equivalent controls SHALL support selected-POI move and duplicate-placement modes with correct keyboard targeting
12. **P12 — Polygon finish:** Right-click and double-click SHALL finish valid polygons without adding duplicate final vertices; invalid geometry SHALL remain correctable
13. **P13 — Shift suite:** Shift+S/R/M/D/B/P/T/I/Z/X SHALL follow Requirement 10 exactly, including input-focus guards, command-section focus and actual booth preset cycling
14. **P14 — Click vs drag:** Selection SHALL distinguish clicks from drags; a drag completion SHALL not trigger an unintended select/place action; Shift-drag duplication SHALL retain the original until Apply
15. **P15 — Developer debug:** A coordinate-debug panel SHALL be enabled only by the dev/debug policy and `?debug`; console AUDIT helpers SHALL report coordinate/calibration/scene consistency without mutating live documents or exposing credentials
16. **P16 — Save-all status:** THE studio SHALL display Saving/Saved/Unsynced and error states for the correct revision across all floors; Shift+S Apply SHALL remain distinct from backend save/finalize
17. **P17 — Draft floor guard:** Unsaved draft-action history, including redo entries after undo, SHALL block floor switching until Save/Apply or Discard resolves it, matching `demo/src/main.js:canChangeFloor`; outstanding network autosave by itself SHALL not be confused with draft-action history
18. **P18 — Freeform tools:** Rectangle/polygon/drag-place tools SHALL coexist beside actual booth presets, with ghost previews, visible resize handles and numeric alternatives
19. **P19 — POI placement:** In-canvas stair/entrance placement SHALL show a ghost, expose rotation, and allow connected-floor and per-floor landing editing
20. **P20 — Zone point-undo:** A labelled Remove last point command SHALL remove only the last drawn zone vertex, retaining the remainder of the unfinished shape and avoiding a document/history transaction
21. **P21 — Confirm removal:** Floor-image removal and floor deletion SHALL each require confirmation; Cancel SHALL preserve image/geometry/floor/related records and Delete SHALL never remove the last floor
22. **P22 — Saved-step history:** Saved-step undo/redo SHALL be scoped per floor following AuthoringHistory; temporary draft actions SHALL have their own apply/discard boundary and SHALL not rewind unrelated floors
23. **P23 — Pending-remove preview:** Booth/POI/zone deletion SHALL first hide the target in a reversible preview with "Apply to save"; only Apply SHALL commit removal; Escape/Discard SHALL restore the target and selection/related records
24. **P24 — Declined Blazor HostBridge:** The Blazor command channel remains declined because this stack has no Blazor host; share URLs and iframe embedding cover that integration need
25. **P25 — Declined grid A* port:** The demo grid A* engine port remains declined because Recast stays the navigation engine; only interaction and visual language SHALL be ported. A separate grid route engine is not an accepted exception; the studio now uses the existing Recast worker

## Non-Functional Requirements

### Performance

- Preserve the original 50+ object / 60 FPS target as a measurement goal, with viewport, DPR, browser and hardware/renderer specified; do not claim a universal pass
- Preserve the original 2-second initial-load and 5-second save targets as environment-dependent budgets, measured separately for rendering, API and image latency
- Current implementation has no recorded performance pass; performance/test execution remains deferred by the user

### Accessibility

- WHEN using keyboard navigation, THE system SHALL allow all floor plan operations without mouse
- WHEN screen readers are active, THE system SHALL provide appropriate ARIA labels for interactive elements

### Maintainability

- WHEN adding new object types, THE system SHALL require minimal changes to existing code
- WHEN updating 3D rendering, THE system SHALL separate concerns between logic, rendering, and state management
- WHEN modifying inventory definitions, THE system SHALL support new types without breaking existing functionality

## Constraints and Dependencies

### Technical Constraints

- MUST use React 19, TypeScript, and R3F as the core rendering technology
- MUST use existing shadcn UI components for interface elements
- MUST use Zustand for state management following existing patterns
- MUST reuse existing wire types and spatial utilities, keeping validated editor-specific metadata in the new subtree without extending backend schemas
- MUST use existing backend endpoints: `/api/events/:eventId/layout` and `/api/events/:eventId/layout/draft`

### Integration Constraints

- MUST integrate with existing floor plan data structures without breaking existing admin-builder functionality
- MUST share backend API endpoints where possible (no backend changes required)
- MUST use existing navigation and routing infrastructure
- MUST preserve all existing shortcut handler behaviors from demo

### Resource Constraints

- MUST not require external 3D model files (GLB/GLTF) - all objects must be procedurally generated with R3F primitives
- MUST work within existing asset delivery infrastructure without new CDN requirements

## Out of Scope

- Real-time multiplayer editing (multiple admins working simultaneously)
- Booth reservation or booking workflow
- Customer-facing booth customization
- Financial transactions or payment processing
- Advanced analytics or usage tracking
- General-purpose mesh/model creation tools; required booth polygon authoring and procedural recipe parameter editing remain in scope
- Hyper-realistic procedural detail/material work is deferred except for the subsequently authorized booth and circulation refinements documented below; external model loading remains prohibited in every phase
- User authentication/authorization (handled by existing venue authorization)

## Later authorized circulation refinement — 15 October 2026

The supplied stairs/elevator/escalator/ramp brief extends Requirements 5, 6, 7, 8 and 11.
Implement procedural construction/materials, straight/switchback flights, valid rise/run/landing
proportions, transient mechanical animation with persisted targets, clear landing approaches and
an isolated preview. Use corrected defaults: stair depth 7.48 m includes both 1.5 m landings;
elevator shaft height is floor rise plus 2.6 m headroom; a 3 m escalator rise needs approximately
7.20 m overall depth; a 0.5 m ramp rise at 1:12 needs 9 m including both landings. Switchback
overall width contains two clear-width flights. Do not treat visual wheelchair symbols as a code
or accessibility certification. Preserve backend contracts and existing imports. Detailed
acceptance, dimension conflicts and outstanding physics/native navigation integration are tracked
in `src/floor-plan-builder/circulation-design.md`; flat portal routing alone does not fulfill those
future engine requirements. Original task identifiers and deferred tests remain unchanged.
