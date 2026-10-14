# spatial-world Specification

## Purpose

Interactive 3D spatial web app: custom floor-plan admin builder, multi-floor
navigation, avatar interaction, e-commerce booth add-ons, realtime multiplayer.

## Requirements

### Requirement: 2D-to-3D floor-plan admin

The system SHALL let admins upload a floor image and annotate booth polygons,
portal markers (elevator/escalator/stairs with targetFloorId), and walkable zones,
exporting a validated `BuildingLayout` JSON.

#### Scenario: Admin exports a layout

- **WHEN** an admin draws booth + portal annotations on floor F1
- **THEN** the system exports floors/rooms/portals JSON that passes
  `buildingLayoutSchema` validation.

### Requirement: Procedural 3D world generation

The system SHALL extrude valid wall polygons into 3D meshes with preset heights, assemble compatible modular venue and booth assets from calibrated layout coordinates, and provide baked/HDRI lighting. Assets MUST align with floor heights and preserve real-world furniture scale. Normal viewing MUST activate the current floor; dollhouse viewing MUST separate floors visually without changing saved layout coordinates. Asset failures MUST retain selectable footprint-compatible placeholders and usable website controls.

#### Scenario: Layout renders in 3D

- **WHEN** a valid layout with 2 floors and 1 booth loads
- **THEN** the viewer renders one walkable surface per floor and one booth assembly matching the room footprint, with only the active floor rendered in normal viewing.

#### Scenario: Dollhouse view preserves the layout

- **WHEN** the viewer enters dollhouse mode and returns to normal viewing
- **THEN** floors return to their saved height offsets, booth selection persists, and no asset receives a duplicate floor offset.

#### Scenario: Booth asset fails to load

- **WHEN** a booth asset request fails
- **THEN** its room remains selectable through a labeled footprint-compatible placeholder and the camera and customizer remain usable.

### Requirement: Avatar movement and cross-floor pathfinding

The system SHALL provide a WASD + orbit avatar with Rapier capsule colliders,
single-floor NavMesh paths drawn as neon lines, and multi-floor routing via the
portal graph (floor BFS + elevator transition).

#### Scenario: Multi-floor route

- **WHEN** routing from B1 to F1
- **THEN** `findFloorPath` returns `['B1', 'F1']` via `lift-01`.

### Requirement: Booth interaction and e-commerce add-ons

The system SHALL open a customizer drawer on booth inspect, toggle compatible 3D prop previews, branding surfaces, and logistics options, persist selections to cart, and mark booths reserved with invoice records. Physical previews MUST obey the asset-placement contract; nonvisual services MUST remain selectable without requiring a mesh. Placement and loading failures MUST NOT silently remove cart items or change reservation request fields.

#### Scenario: Reserve a booth

- **WHEN** a user toggles 2 add-ons and reserves `room-101`
- **THEN** `POST /api/events/:eventId/booths/reserve` returns `{ reserved: true }`.

#### Scenario: Selected prop becomes visible

- **WHEN** a chair is selected for a compatible booth
- **THEN** one correctly scaled chair preview appears inside that booth, and deselecting it removes only that preview.

#### Scenario: Service has no physical object

- **WHEN** early-setup is selected
- **THEN** the service persists in the cart without spawning a physical prop.

### Requirement: Realtime crowd visualization

The system SHALL sync `AvatarState {x,y,z,rotationY,floorId,animationState}` over
WebSockets at 15-20 Hz with client-side lerp interpolation at 60 FPS.

#### Scenario: Avatar broadcast

- **WHEN** a client sends a valid `AvatarState` to `/ws/avatars`
- **THEN** the hub rebroadcasts it to peers without jitter-inducing drops.

### Requirement: Canonical authored features and units

New authoring documents SHOULD declare schemaVersion 2. Floors SHALL support image-free metric canvases and calibrated pixel sources. Source positions for walls, zones, POIs, instances, starts and portal entries SHALL normalize to world meters once. Wall thickness/height and opening dimensions SHALL remain metric during image replacement or coordinate re-expression. A wall opening offset SHALL measure its center from wall.start in meters, with clear span offset ± width/2.

#### Scenario: Image calibration is incomplete

- **WHEN** a new image is uploaded or replaces the current image
- **THEN** calibration SHALL be marked required and physical placement SHALL wait for two-point, rectangle or explicit manual confirmation.
- **AND** changing the origin alone SHALL NOT confirm scale.
- **AND** admins MAY save the unfinished document as a draft.

#### Scenario: Blank metric floor

- **WHEN** an admin adds a blank floor
- **THEN** it SHALL have no inherited image, model, obstacle or instance, a unique identity and a valid metric boundary.

### Requirement: Separate draft storage and publication

GET/PUT `/api/events/:eventId/layout/draft` SHALL store an unpublished document independently from GET/PUT `/api/events/:eventId/layout`. Drafts SHALL require structural schema validity but MAY contain required calibration and unfinished portal entries. Publication SHALL enforce shared client/server readiness. New v2/canonical-feature documents SHALL provide entries on every connected portal floor and safe starts/POIs/entries with physical clearance. Existing legacy-only documents SHALL retain their historical connector compatibility. Draft responses SHALL use no-store caching. Authentication/authorization is a separate requirement; unpublished does not mean access-controlled.

#### Scenario: Draft does not replace visitors' venue

- **WHEN** an admin saves an unfinished draft
- **THEN** the visitor layout SHALL remain unchanged, and older published-query results SHALL NOT overwrite newer editor work.
- **WHEN** a delayed draft load completes after editing or leaving the editor
- **THEN** it SHALL NOT replace the active source.

### Requirement: Shared wall collision and routing solids

Rendered authored walls, Rapier collision and Recast rasterization SHALL use the same split wall solids, including sill and lintel heights. A doorway SHALL preserve clear navigation headroom; a low sill SHALL NOT be treated as a step the character cannot climb. Blocked zones SHALL preserve their actual concave polygon, not an enclosing box. Nonblocking zone overlays SHALL NOT add obstacles.

### Requirement: Stable named destinations

Visitor search SHALL support existing room IDs and scoped POI/avatar-start destinations. Destination selection SHALL preserve the avatar's actual origin; routing through portals SHALL own floor changes. Moving or removing a destination SHALL cancel stale pending/active routes, while a label-only edit SHALL not rebuild the navigation mesh. Arbitrary two-endpoint preview planning remains a subsequent UI feature.

### Requirement: Reversible reference archive and safe cutover

Reference snapshots SHALL record verified SHA-256 identities and visual references. Currently used sources/assets SHALL remain available until their replacements satisfy dimensions, material, socket, physical and appearance contracts. Runtime source/build and saved-layout DTOs SHALL reject archive asset paths. The archive is not a runtime asset catalog.
