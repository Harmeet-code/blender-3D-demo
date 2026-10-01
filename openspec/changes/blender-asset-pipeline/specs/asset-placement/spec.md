## Purpose

Place venue modules and catalog props at floor-relative positions with predictable alignment, valid room containment, and clear distinction between physical previews and purchased services.

## ADDED Requirements

### Requirement: Calibrated layout coordinates

Placement SHALL treat legacy layout coordinates as meters and convert floor-plan image pixels using explicit positive meters-per-pixel calibration and an image-space origin before rendering. Invalid calibration, non-finite coordinates, self-intersecting polygons, and zero-area room polygons MUST produce a typed validation error and preserve the last valid layout.

#### Scenario: Render a calibrated image annotation

- **WHEN** a room spans 400 image pixels and its calibration is 0.01 meters per pixel
- **THEN** the room spans 4 m in the website without applying the conversion twice.

#### Scenario: Preserve existing layouts

- **WHEN** the existing uncalibrated meter layout containing a 10 by 8 room loads
- **THEN** it remains a 10 by 8 m room on its declared floor.

### Requirement: Floor-relative transforms

Placed assets SHALL preserve their authored real-world scale and resolve position from the floor transform, room transform, and asset anchor. The floor height MUST be applied exactly once. New structural placements MUST snap their origins to a 1 m grid; imported calibrated room vertices MUST retain their original positions. Prop placement MUST snap to a 0.25 m grid and rotate in 90-degree increments. Snapping MUST NOT invalidate containment or change a saved floor height.

#### Scenario: Place a prop underground

- **WHEN** a ground-contact chair has a room-local vertical position of 0 on B1 with height -4 m
- **THEN** its ground contact is at world height -4 m, including after switching floors and returning.

#### Scenario: Preserve an imported off-grid boundary

- **WHEN** a calibrated room boundary includes a vertex at X=4.3 m
- **THEN** room assembly retains that boundary position and fits compatible module end sections without snapping the room to 4 m.

### Requirement: Footprint-compatible booth assembly

Booth visuals SHALL follow the full simple room polygon and maintain a usable entrance. The standard 4 by 4 m booth frame MUST retain its proportions; other room shapes MUST use compatible structural modules or polygon-derived geometry. Selection MUST retain the room ID independently of the asset's internal node names.

#### Scenario: Render a concave booth

- **WHEN** a valid concave booth polygon loads
- **THEN** its floor and boundary visuals match the complete polygon without filling the bounding-box area outside the booth or blocking its declared entrance.

### Requirement: Deterministic valid prop placement

An add-on with a physical preview SHALL resolve to a stable asset version and a deterministic room-local placement. Its full rotated footprint MUST stay inside the polygon with at least 0.05 m boundary clearance, avoid other blocking props, and preserve a 1 m entrance-to-interaction route. The system MUST NOT shrink furniture or move it into another booth to force a fit.

#### Scenario: Toggle a chair repeatedly

- **WHEN** the same chair is added, removed, and added again to a compatible booth
- **THEN** it returns to the same valid position and rotation without duplicate visual instances.

#### Scenario: No available room placement

- **WHEN** a selected display case cannot fit within a narrow booth
- **THEN** the cart selection remains visible with a placement warning, no invalid physical preview is spawned, and the application does not crash.

### Requirement: Catalog service semantics

Chair, table, and display-case selections SHALL show contained room props. Safe-service MUST show a safe only when valid room space exists. Forklift-service and pallet-service MUST remain service purchases with optional explicitly labeled previews at designated logistics anchors; forklift preview MUST never spawn inside a booth or circulation route. Early setup, early delivery, exhibitor parking, and visa letter MUST remain nonvisual selections.

#### Scenario: Request a forklift service

- **WHEN** forklift-service is selected and the layout has no designated logistics anchor
- **THEN** the service remains in the cart, the UI reports that no physical preview is available, and no forklift appears inside the booth.

### Requirement: Branding placement

Logo-banner selections SHALL attach branding to a declared branding surface while preserving the booth's default material when no logo is supplied. Logos MUST avoid coplanar flicker, preserve their aspect ratio within the surface, and affect only the selected booth. Unsupported or oversized images MUST yield a recoverable validation message.

#### Scenario: Brand one of two booths

- **WHEN** a valid logo is supplied to one booth and the camera is moved around the banner
- **THEN** its logo remains stable without flicker or distortion and the second booth retains its default branding.

### Requirement: Portal visuals follow logical connections

Portal visuals SHALL attach to explicit per-floor entry positions and the existing logical floor connections. Missing positions MUST produce a visible editor diagnostic instead of inventing a route or entrance. Stair and escalator assets MUST match the declared floor rise without distorting their geometry; incompatible rises MUST produce a diagnostic and suppress the incompatible visual. Door animation state MUST NOT modify the logical portal's connected-floor IDs.

#### Scenario: Legacy portal has no position

- **WHEN** the existing lift-01 connection loads without an entry position
- **THEN** the floor graph remains connected and the editor reports the missing placement without rendering a misleading entrance.

#### Scenario: Portal rise does not match the asset

- **WHEN** a 4 m-rise stair asset is assigned to a connection with a 3 m rise
- **THEN** the editor reports an incompatible portal asset, no distorted stair preview appears, and the logical floor connection persists.
