## MODIFIED Requirements

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
