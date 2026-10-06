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
