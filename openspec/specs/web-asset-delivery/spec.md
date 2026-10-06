# web-asset-delivery Specification

## Purpose

Deliver reusable 3D assets to the website with recoverable loading, predictable resource use, and measured performance on a reproducible venue scene.

## Requirements

### Requirement: Versioned asset resolution

The website SHALL resolve each supported asset ID and version to its release URL and validated metadata in development and production, including deployment below a non-root base path. Unknown or incompatible asset versions MUST yield a visible fallback and a typed diagnostic without invalidating the layout or cart.

#### Scenario: Production deployment below a base path

- **WHEN** the built website is served below `/expo/`
- **THEN** every registered asset resolves successfully without requests to development filesystem paths.

#### Scenario: Unknown asset reference

- **WHEN** a layout references an unregistered asset version
- **THEN** the website displays a labeled placeholder and preserves the room identity and selected add-ons.

### Requirement: Isolated loading and recovery

Each asset load SHALL expose loading, ready, and failed states. A failed request or decoding error MUST keep the website controls usable, render a footprint-compatible fallback, and offer a retry of the failed resource.

#### Scenario: Recover from an asset request failure

- **WHEN** a chair request fails and subsequently succeeds after retry
- **THEN** the chair placeholder becomes the real asset while booth selection, camera state, and cart contents persist.

### Requirement: Independent instances with shared resources

Repeated static assets SHALL reuse compatible geometry and textures while maintaining independent transforms, picking identities, and instance-specific appearance. Removing one placement MUST NOT dispose resources still used by another placement.

#### Scenario: Two booths use the same chair

- **WHEN** chairs appear in two booths and one chair is removed
- **THEN** the remaining chair retains its position, appearance, interaction identity, and live rendering resources.

### Requirement: Floor resource lifetime

Normal viewing SHALL render and expose picking and physics only for the active floor. Transition mode SHALL enable at most the current and destination floors; dollhouse mode SHALL render both reference floors without active walkthrough physics. The asset cache MUST retain the common kit and at most two floor-specific resource sets, evicting unused owned resources without disposing shared live resources.

#### Scenario: Switch floors repeatedly

- **WHEN** the viewer switches between F1 and B1 twenty times
- **THEN** inactive rooms cannot be picked or collided with, and geometry and texture resource counts stabilize after the second complete cycle.

### Requirement: Measured scene budgets

The released reference venue SHALL include two floors, twenty 4 by 4 m booths per floor, and one chair, table, and display case per booth. Normal viewing MUST stay within 200,000 visible triangles, 150 main-pass draw calls, 64 MiB estimated decoded texture storage including mipmaps, and 8 MiB cold asset transfers for the initial floor kit. Low-quality viewing MUST stay within 100 main-pass draw calls, use pixel ratio 1, and disable dynamic shadows and transmissive glass. Extra rendering passes MUST be reported separately.

#### Scenario: Profile the reference venue

- **WHEN** the release reference scene is measured after loading completes
- **THEN** the report records visible triangles, main and additional pass draw calls, decoded texture estimates, transfer bytes, and whether every limit passed.

### Requirement: Defined device acceptance

Before asset release, the project SHALL record an integrated-GPU laptop reference device with browser version, CPU/GPU, viewport 1280 by 720, and low-quality settings. Across a scripted 60-second camera tour after a 10-second warm-up, the low-quality reference scene MUST achieve at least 30 average frames per second and a 95th percentile frame time no greater than 33.3 ms. Any higher-quality 60 FPS goal MUST be reported as a measured target rather than a universal guarantee.

#### Scenario: Reference device misses the frame budget

- **WHEN** the reference-device tour exceeds the frame-time limit
- **THEN** release remains blocked until assets or rendering are adjusted and a new measurement passes; the report identifies the tested device and settings.
