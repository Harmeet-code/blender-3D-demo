## ADR: Treat a Blender asset as a versioned spatial interface

- **Date:** 2026-10-01
- **Change:** blender-asset-pipeline

**Status:** Proposed

## Context

The same model will be placed in multiple rooms, selected through booth identities, used to derive collision, and potentially optimized or replaced between releases. A visually similar GLB with a changed origin, scale, socket, or material role can break these consumers without a TypeScript error.

## Decision

Release each asset together with a versioned, validated spatial interface describing meter dimensions, exported axes, anchor convention, bounds/footprint, named attachments, material roles, and collision proxies. Placement consumes that interface and applies floor height once; browser URLs remain a separate frontend concern.

## Rationale / Alternatives

Per-model corrective JSX transforms couple placement logic to undocumented authoring details. One monolithic venue export removes independent room/prop identity and makes optional assets expensive to load. A validated modular interface allows visual geometry to change while compatible placement and picking remain stable.

## Consequences

Asset tooling must inspect the exported GLB rather than trust the source scene. Changes to an origin, footprint, socket transform, or required name require an interface-compatible revision or a new asset version and corresponding catalog update. Resource sharing and independent instance identity remain separate runtime responsibilities.
