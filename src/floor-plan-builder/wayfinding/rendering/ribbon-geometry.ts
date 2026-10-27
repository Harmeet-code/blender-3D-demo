export type RibbonPoint = [number, number];
export interface RibbonGeometryData {
  positions: Float32Array;
  centers: Float32Array;
  offsets: Float32Array;
  distances: Float32Array;
  sides: Float32Array;
  indices: Uint32Array | Uint16Array;
  totalLength: number;
  samples: { point: RibbonPoint; distance: number; yaw: number }[];
}

/** Bounded miter joins; immutable buffers. Width is subsequently clamped in the vertex shader. */
export function buildRibbonGeometry(
  points: RibbonPoint[],
  y: number,
  width: number,
): RibbonGeometryData | null {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(y)) {
    return null;
  }
  const clean: RibbonPoint[] = [];
  for (const point of points) {
    if (!point.every(Number.isFinite)) {
      return null;
    }
    const last = clean.at(-1);
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 1e-5) {
      clean.push(point);
    }
  }
  if (clean.length < 2) {
    return null;
  }
  const count = clean.length;
  const positions = new Float32Array(count * 6),
    centers = new Float32Array(count * 6),
    offsets = new Float32Array(count * 6);
  const distances = new Float32Array(count * 2),
    sides = new Float32Array(count * 2);
  const normals: RibbonPoint[] = [],
    arcs = [0];
  for (let i = 1; i < count; i++) {
    const a = clean[i - 1]!,
      b = clean[i]!,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    normals.push([-dz / length, dx / length]);
    arcs.push(arcs[i - 1]! + length);
  }
  for (let i = 0; i < count; i++) {
    const before = normals[Math.max(0, i - 1)]!,
      after = normals[Math.min(normals.length - 1, i)]!;
    let nx = before[0] + after[0],
      nz = before[1] + after[1];
    const norm = Math.hypot(nx, nz);
    if (norm < 1e-5) {
      [nx, nz] = after;
    } else {
      nx /= norm;
      nz /= norm;
    }
    const miter = Math.min(2, 1 / Math.max(0.5, Math.abs(nx * after[0] + nz * after[1])));
    const [x, z] = clean[i]!;
    for (let side = 0; side < 2; side++) {
      const sign = side ? -1 : 1,
        vertex = i * 2 + side;
      centers.set([x, y, z], vertex * 3);
      offsets.set([nx * miter * sign, 0, nz * miter * sign], vertex * 3);
      positions.set(
        [x + (nx * miter * sign * width) / 2, y, z + (nz * miter * sign * width) / 2],
        vertex * 3,
      );
      distances[vertex] = arcs[i]!;
      sides[vertex] = sign;
    }
  }
  const indices =
    count * 2 > 65535 ? new Uint32Array((count - 1) * 6) : new Uint16Array((count - 1) * 6);
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  }
  const samples: RibbonGeometryData['samples'] = [];
  for (let i = 1; i < count; i++) {
    const a = clean[i - 1]!,
      b = clean[i]!,
      length = arcs[i]! - arcs[i - 1]!,
      steps = Math.ceil(length / 0.25);
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      samples.push({
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        distance: arcs[i - 1]! + length * t,
        yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
      });
    }
  }
  const end = clean.at(-1)!,
    before = clean.at(-2)!;
  samples.push({
    point: end,
    distance: arcs.at(-1)!,
    yaw: Math.atan2(end[0] - before[0], end[1] - before[1]),
  });
  return {
    positions,
    centers,
    offsets,
    distances,
    sides,
    indices,
    totalLength: arcs.at(-1)!,
    samples,
  };
}

/** Exact arc-length interpolation, including nonintegral sample intervals and global offsets. */
export function tickPositions(samples: RibbonGeometryData['samples'], everyM: number, offset = 0) {
  const result: { point: RibbonPoint; yaw: number; distance: number }[] = [];
  if (everyM <= 0 || !Number.isFinite(everyM) || samples.length < 2) {
    return result;
  }
  let next = (Math.floor(offset / everyM) + 1) * everyM;
  const total = offset + samples.at(-1)!.distance;
  for (let i = 1; i < samples.length && next < total - 1e-5; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!;
    while (next <= offset + b.distance && next < total - 1e-5) {
      const t = (next - offset - a.distance) / Math.max(1e-9, b.distance - a.distance);
      result.push({
        point: [
          a.point[0] + (b.point[0] - a.point[0]) * t,
          a.point[1] + (b.point[1] - a.point[1]) * t,
        ],
        yaw: b.yaw,
        distance: next,
      });
      next += everyM;
    }
  }
  return result;
}
