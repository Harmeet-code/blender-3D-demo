# Parking lot layout notes

The parking layout is derived from a simple authored polygon in metres. Rows align with the longest inset edge unless a baseline angle is authored. The area-weighted polygon centroid is emitted as renderer origin. The default edge inset is 1.2 m. Bay dimensions and aisle widths come from the parking-angle rule table; candidate stalls that do not fit the polygon in full are discarded rather than bent or stretched. Concave aisle centerlines are split into intervals inside the inset footprint, with width checks at the interval midpoint.

Stable fractional `u,v` coordinates identify per-bay overrides across recomputes. Existing string-valued overrides are still parsed; `{type, pinned}` is also accepted. Accessible bays reserve a neighboring 1.2 m hatch strip and mark the companion bay unavailable, preserving the actual usable-capacity count. Occupancy is deterministic from seed, capped at 400 vehicles, and checks body dimensions against the bay rule before emitting a car.

The layout output retains prior fields (`capacity`, `bays`, `aisles`, `islands`, `poles`, `inset`) and adds renderer/navigation metadata. Current limitations and unimplemented contract fields are tracked in `parking-lot-implementation-status.md`.
