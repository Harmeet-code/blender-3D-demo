# Physical connector handoff

`connectorRecordForLeg(leg, document)` binds a compiled procedural circulation
leg to its portal and dimensions. Register the returned records with
`CollisionWorld.connectors`, all stacked snapshots with `connectorFloors`, and
the shared building-to-physics Y offset with `originY`. Keep route points and
capsule validation in the same absolute frame; apply the offset only at the
Rapier boundary. Recreate records when authored dimensions or transforms change.

Inside the collision provider, create one `createConnectorSession(request,
policyStatus)` for each connector leg. Supply the explicit role and bind:

- `validateSweep` to `validateConnectorSweep(record.id, from, to)`.
- `validateEndpoint` to `validateConnectorEndpoint(record.id, floorId, feet)`.
- `validatePathBinding` to a check against the current document's selected
  portal, authored object ID and compiled path. Do not return a constant true.

Call `advance(dt)` from the existing shared capsule controller. Apply only its
accepted `feet` through that controller's collision-aware kinematic movement;
stop if the physical resolved pose differs from the proposed pose. Feed resolved
distance and `walking` into gait. Do not drive the avatar directly from
`sampleConnectorTraversal`; that function only samples a timeline. Replace a
session after document, role, door/collision-world or route context changes.
Cancel with `stop()`; preserve the last accepted pose. Blocked sessions cannot
be resumed. Do not finish a route leg until the session reports `complete`.

Stairs retain actual tread and landing surfaces; ramps and escalators retain
the existing continuous support proxies. Escalator belt travel does not advance
walking gait. Reverse traversal uses the same surfaces and checks with reversed
path order. Runtime role restrictions preserve the solid object blocker when
the connector is not allowed. Policy availability is mandatory at session creation.

## Physical elevator adapter

Recipe-derived elevator records now retain the authored object, base elevation and
four-point boarding/cabin/exit path. CollisionWorld mounts stacked slabs with
triangulated apertures, stacked obstacle proxies, a compound cabin, enclosing
shaft, landing jambs/headers and centre-opening kinematic door leaves. Invalid,
touching, overlapping or out-of-boundary openings retain the solid slab and deny
traversal. Scaled/sheared connectors remain disabled.

The session has explicit opening, boarding, closing, riding, destination opening
and exit stages. Cabin translation is forbidden while either the current or next
door state is open. Doors open only at a stop. WalkthroughLayer submits cabin and
door targets on the shared capsule's fixed physics step, and updates visual
TraversalMotionContext state from the same frame. Destination floor handoff is
committed only after the final capsule movement is resolved.

During ride stages the SAME capsule body switches to CCD dynamic simulation,
with the requested passenger velocity, gravity and cabin contacts resolved by
Rapier. Boarding and exit retain character-controller sweeps. This avoids the
observed Rapier character-controller failure on downward moving supports without
excluding the cabin collider. Physical displacement disagreement stops the
session at the actual accepted pose. Stop/pause freezes the next cabin target;
manual steering stays locked during a passenger session.

Free mode can engage the same sessions by walking toward a route-linked source
landing within 0.35 m. It does not discover connectors absent from the current
compiled route. Ordinary walking samples physical support along its intended
segment to avoid hovering across apertures.

## Evidence and remaining verification

Inline Rapier experiments (no test files authored) reproduced a rejected 0.02 m
kinematic descent, then exercised dynamic passengers upward/downward for 120
fixed steps at 1.5 m/s: maximum displacement error approximately 0.001704 m.
Bun transpilation parsed the edited TS/TSX files. These are isolated physics and
syntax evidence only. Lint/typecheck were not run, per the current instruction.

Full browser traversal, rendered slab aperture visibility (the builder's visual
floor renderer is outside this ownership), stop/resume, repeated round trips,
multiple passengers, free-mode route coverage and staircase/escalator support
remain unverified. D8 must not be reported PASS from these source changes or the
isolated experiment. Cabin initialization currently spawns at the requested
source stop; dispatching an existing cabin from another stop is not implemented.
