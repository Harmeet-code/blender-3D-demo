## Purpose

Provide reusable Blender authoring sources and portable browser assets with measurable scale, appearance, interaction interfaces, and production limits.

## ADDED Requirements

### Requirement: Initial venue asset kit

The library SHALL deliver versioned editable sources, GLB exports, preview images, and metadata for floor tile, wall panel, booth frame, chair, table, display case, safe, pallet, forklift, banner stand, elevator entrance, stairs, and escalator entrance. Each asset MUST identify its source, export version, license, dimensions, material roles, attachment points, and collision representation.

#### Scenario: Inspect a released asset

- **WHEN** a developer selects the chair asset release
- **THEN** its source, GLB, preview, license, measured dimensions, and matching metadata version are available without requiring access to an external generation service.

### Requirement: Portable spatial interface

Assets SHALL use meters, exported Y-up coordinates, +Z facing for directional props, and a root with unit scale and no corrective root rotation. Floor-contact props MUST have their ground contact at root Y=0 within 0.005 m; slabs MUST have their walkable top at root Y=0; portal assets MUST declare a lower-entry anchor. Metadata MUST distinguish these anchor conventions.

#### Scenario: Place a chair on either floor

- **WHEN** an exported chair is placed at a floor height of 0 m or -4 m with unit scale
- **THEN** its feet contact that floor within 0.005 m, its dimensions match metadata within 1%, and it faces +Z before placement rotation.

#### Scenario: Stack a structural floor

- **WHEN** a slab root is placed at floor height -4 m
- **THEN** the slab top is at -4 m and its thickness extends below the walkable surface.

### Requirement: Asset production budgets

The initial exports MUST stay within the following project limits, measured on exported triangles across all render primitives; collision proxies MUST be measured separately. Every prop export MUST be at most 1 MiB, and each structural or portal export MUST be at most 2 MiB. Props MUST use textures no larger than 1024 by 1024; structural and portal assets MUST use textures no larger than 2048 by 2048.

| Asset              | Maximum render triangles | Maximum material slots |
| ------------------ | -----------------------: | ---------------------: |
| floor tile         |                      100 |                      1 |
| wall panel         |                      200 |                      1 |
| booth frame        |                    2,000 |                      2 |
| chair              |                      800 |                      1 |
| table              |                      500 |                      1 |
| display case       |                    1,500 |                      2 |
| safe               |                    1,000 |                      1 |
| pallet             |                      500 |                      1 |
| forklift           |                    6,000 |                      3 |
| banner stand       |                      500 |                      2 |
| elevator entrance  |                    3,000 |                      3 |
| stairs             |                    2,000 |                      2 |
| escalator entrance |                    4,000 |                      3 |

#### Scenario: Reject an oversized export

- **WHEN** a chair export contains 801 render triangles or a 2048 by 2048 texture
- **THEN** the asset release check fails with the asset ID, measured value, and permitted limit.

### Requirement: Browser-compatible appearance

Exported assets SHALL preserve their intended base colors, roughness, metallic response, normals, and any authored ambient occlusion under the website's reference lighting. Procedural source materials MUST be converted to exportable material data. Branding surfaces MUST remain independently identifiable and replaceable; collision-only objects MUST be absent from visible rendering.

#### Scenario: Export a procedural finish

- **WHEN** a source object uses a procedural wood finish
- **THEN** its browser export includes an equivalent baked or supported finish and renders without missing-texture colors.

#### Scenario: Replace branding

- **WHEN** a booth banner receives a new logo texture
- **THEN** only its declared branding surface changes and neighboring booth instances retain their original materials.

### Requirement: Stable attachments and portal parts

The booth frame SHALL expose a branding attachment and entrance marker. Banner stands MUST expose their branding surface. Elevator entrances MUST expose separately named door parts and entry anchors; stairs and escalator entrances MUST expose lower and upper route anchors. Optimization MUST preserve these declared names and transforms.

#### Scenario: Inspect an optimized portal asset

- **WHEN** the elevator export is optimized and reloaded
- **THEN** its door parts and entry anchors remain identifiable at the same positions within 0.005 m.

### Requirement: Reproducible asset release checks

The release process SHALL validate file structure, required nodes, dimensions, origins, budgets, and source-to-export version consistency, and produce a report plus front, side, top, and browser preview evidence. A failed asset MUST remain excluded from the released catalog until corrected.

#### Scenario: Detect a missing attachment

- **WHEN** an otherwise valid booth export omits its declared branding attachment
- **THEN** validation rejects that release and leaves the previous compatible release available.
