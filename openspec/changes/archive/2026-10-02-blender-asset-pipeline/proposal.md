> Change class: **L** — asset production, shared contracts, browser rendering, and placement across multiple modules.

## Why

The website currently shows placeholder floors and booth boxes, while its add-on catalog has no matching production assets or placement contract. A defined Blender-to-browser pipeline will make the venue and selectable objects consistent in scale, appearance, loading, and performance before the asset library grows.

## What Changes

- Produce a modular Blender library: floor tile, wall panel, booth frame, chair, table, display case, safe, pallet, forklift, banner stand, elevator entrance, stairs, and escalator entrance.
- Define asset dimensions, origins, orientation, material roles, attachment sockets, collision proxies, versions, and measurable export budgets.
- Build one convention-center reference layout with Ground Floor F1 and Underground B1; preserve arbitrary annotated room footprints and existing floor offsets.
- Deliver validated GLB assets with load/error states, bounded caching, repeated-prop batching, and low-quality viewing mode.
- Place booth assets and selected props deterministically inside room polygons; prevent invalid placements and keep service purchases semantically distinct from physical previews.
- Provide a production order, per-object modeling recipes, export gates, website integration steps, and acceptance evidence.

## Scope / Non-Goals

This proposal defines the future implementation; it does not create `.blend`/`.glb` files or change the running website. The first delivery is one asset kit and one reference venue. Additional mall/expo templates, AI-generated hero characters, multiplayer crowd simulation, free-form furniture editing, real elevator simulation, and full navigation-mesh implementation are separate changes. Portal assets include visual entrances and route anchors; connecting floors remains the existing application's responsibility.

## Capabilities

### New Capabilities

- `blender-asset-library`: Reusable source assets and browser exports with an explicit asset interface and production budgets.
- `web-asset-delivery`: Reliable loading, reuse, failure recovery, resource lifetime, and browser performance acceptance.
- `asset-placement`: Floor-relative booth and add-on placement, polygon containment, branding attachments, and service-preview semantics.

### Modified Capabilities

- `spatial-world`: Replace placeholder venue rendering with compatible modular assets and make add-on previews visible while retaining existing reservation behavior.

## Impact

Blender authoring sources and export tooling; `src/frontend/assets`; new asset contracts under `src/frontend/entities/asset`; building layout contracts; the world viewport, booth customizer, viewer state, and admin floor-plan calibration. Existing layout DTOs gain backward-compatible optional calibration metadata; server services and clients reuse the shared schema. Reservation request fields, cart add-on IDs, and booth identity remain compatible. Development tools for asset inspection/validation are pinned when implementation starts; runtime dependencies are assessed against the installed R3F/drei/Three versions.

## Risks

- Axis or origin mismatches → prove a chair-and-table placement slice before batch modeling.
- Attractive assets exceeding browser budgets → validate exported primitives, textures, and reference-scene measurements.
- Pixel coordinates mistaken for meters → require explicit calibration for uploaded images and preserve existing meter layouts.
- Repeated or failed asset loads disrupting interaction → isolate asset errors and define shared-resource ownership.
- Logistics previews mistaken for fulfillment → show forklift/pallet previews only in designated service areas and keep nonvisual services in the cart.
