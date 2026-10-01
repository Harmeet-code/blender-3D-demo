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

The system SHALL extrude wall polygons into 3D meshes with preset heights,
spawn GLTF booth assets at coordinate offsets, and provide baked/HDRI lighting.

#### Scenario: Layout renders in 3D

- **WHEN** a valid layout with 2 floors and 1 booth loads
- **THEN** `FloorStack` renders one ground plane per floor and one booth mesh.

### Requirement: Avatar movement and cross-floor pathfinding

The system SHALL provide a WASD + orbit avatar with Rapier capsule colliders,
single-floor NavMesh paths drawn as neon lines, and multi-floor routing via the
portal graph (floor BFS + elevator transition).

#### Scenario: Multi-floor route

- **WHEN** routing from B1 to F1
- **THEN** `findFloorPath` returns `['B1', 'F1']` via `lift-01`.

### Requirement: Booth interaction and e-commerce add-ons

The system SHALL open a customizer drawer on booth inspect, toggling 3D props,
branding decals, and logistics options, persisting to cart and marking booths
reserved with invoice records.

#### Scenario: Reserve a booth

- **WHEN** a user toggles 2 add-ons and reserves `room-101`
- **THEN** `POST /api/events/:eventId/booths/reserve` returns `{ reserved: true }`.

### Requirement: Realtime crowd visualization

The system SHALL sync `AvatarState {x,y,z,rotationY,floorId,animationState}` over
WebSockets at 15-20 Hz with client-side lerp interpolation at 60 FPS.

#### Scenario: Avatar broadcast

- **WHEN** a client sends a valid `AvatarState` to `/ws/avatars`
- **THEN** the hub rebroadcasts it to peers without jitter-inducing drops.
