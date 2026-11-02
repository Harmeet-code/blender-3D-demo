import type { ConnectorRecord, ConnectorPath, ConnectorPoint } from '../connectors/connector-runtime.ts';

export interface ConnectorSurfaceProxy {
  connectorId: string;
  authoredInstanceId: string;
  kind: 'stairs' | 'ramp' | 'escalator';
  /** Interleaved XYZ vertices suitable for a static Rapier trimesh adapter. */
  vertices: Float32Array;
  indices: Uint32Array;
}

export type ConnectorProxyResult =
  | { supported: true; proxy: ConnectorSurfaceProxy }
  | { supported: false; connectorId: string; reason: string };

const finitePoint = (point: ConnectorPoint) => point.length === 3 && point.every(Number.isFinite);

/**
 * Create a physical walk surface only from explicit authored path samples and width.
 * This does not infer a slope from portal endpoints. Each sample pair contributes a
 * two-triangle ribbon whose elevation follows the supplied path.
 */
export function createConnectorSurfaceProxy(record: ConnectorRecord, capsuleDiameterM: number): ConnectorProxyResult {
  if (!record || typeof record.id !== 'string' || !record.id.trim()) {
    return { supported: false, connectorId: '', reason: 'Connector identity is missing.' };
  }
  if (!Number.isFinite(capsuleDiameterM) || capsuleDiameterM <= 0) {
    return { supported: false, connectorId: record.id, reason: 'A finite positive capsule diameter is required to validate surface width.' };
  }
  if (record.kind === 'elevator') {
    return { supported: false, connectorId: record.id, reason: 'Elevators use explicit stop and cabin collision adapters, not a surface ribbon.' };
  }
  const path: ConnectorPath | undefined = record.path;
  if ((record.kind !== 'stairs' && record.kind !== 'ramp' && record.kind !== 'escalator') || !path || path.points.length < 2 || !path.points.every(finitePoint) || !Number.isFinite(path.widthM) || path.widthM < capsuleDiameterM || !path.authoredInstanceId?.trim() || (path.source !== 'document' && path.source !== 'existing-asset-metadata')) {
    return { supported: false, connectorId: record.id, reason: 'No usable authored connector path and width are available.' };
  }
  if (record.kind === 'stairs') {
    const treads = path.treads;
    const surfaces = [...(treads ?? []), ...(path.landings ?? [])];
    if (!treads?.length || surfaces.some((tread) => tread.polygon.length !== 4 || !Number.isFinite(tread.y) || tread.polygon.some((point) => point.length !== 2 || !point.every(Number.isFinite)))) {
      return { supported: false, connectorId: record.id, reason: 'Stairs require authored tread polygons and elevations.' };
    }
    const vertices = new Float32Array(surfaces.length * 12);
    const indices = new Uint32Array(surfaces.length * 6);
    for (let i = 0; i < surfaces.length; i++) {
      const tread = surfaces[i]!;
      for (let vertex = 0; vertex < 4; vertex++) {
        const point = tread.polygon[vertex]!;
        const offset = (i * 4 + vertex) * 3;
        vertices[offset] = point[0];
        vertices[offset + 1] = tread.y;
        vertices[offset + 2] = point[1];
      }
      const base = i * 4;
      const offset = i * 6;
      indices[offset] = base;
      indices[offset + 1] = base + 1;
      indices[offset + 2] = base + 2;
      indices[offset + 3] = base;
      indices[offset + 4] = base + 2;
      indices[offset + 5] = base + 3;
    }
    return { supported: true, proxy: { connectorId: record.id, authoredInstanceId: path.authoredInstanceId, kind: 'stairs', vertices, indices } };
  }
  const directions: Array<[number, number]> = [];
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i]!;
    const b = path.points[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    if (length <= 1e-8) return { supported: false, connectorId: record.id, reason: `Path has duplicate or vertically aligned samples at segment ${i}.` };
    directions.push([dx / length, dz / length]);
  }
  const vertices = new Float32Array(path.points.length * 2 * 3);
  for (let i = 0; i < path.points.length; i++) {
    const p = path.points[i]!;
    const halfWidth = path.widthM / 2;
    const beforeIndex = Math.max(0, i - 1);
    const afterIndex = Math.min(path.points.length - 1, i + 1);
    const previous = directions[Math.max(0, i - 1)]!;
    const next = directions[Math.min(directions.length - 1, i)]!;
    const previousNormal: [number, number] = [-previous[1], previous[0]];
    const nextNormal: [number, number] = [-next[1], next[0]];
    let sideX: number;
    let sideZ: number;
    if (beforeIndex === i || afterIndex === i) {
      const normal = beforeIndex === i ? nextNormal : previousNormal;
      sideX = normal[0] * halfWidth;
      sideZ = normal[1] * halfWidth;
    } else {
      const mx = previousNormal[0] + nextNormal[0];
      const mz = previousNormal[1] + nextNormal[1];
      const miterLength = Math.hypot(mx, mz);
      if (miterLength <= 1e-8) return { supported: false, connectorId: record.id, reason: `Path reverses direction at sample ${i}.` };
      const miterX = mx / miterLength;
      const miterZ = mz / miterLength;
      const denominator = miterX * nextNormal[0] + miterZ * nextNormal[1];
      if (Math.abs(denominator) < 0.2) return { supported: false, connectorId: record.id, reason: `Path turn is too tight for a capsule-width surface at sample ${i}.` };
      const miterScale = halfWidth / denominator;
      sideX = miterX * miterScale;
      sideZ = miterZ * miterScale;
    }
    const offset = i * 6;
    vertices[offset] = p[0] - sideX;
    vertices[offset + 1] = p[1];
    vertices[offset + 2] = p[2] - sideZ;
    vertices[offset + 3] = p[0] + sideX;
    vertices[offset + 4] = p[1];
    vertices[offset + 5] = p[2] + sideZ;
  }
  const indices = new Uint32Array((path.points.length - 1) * 6);
  for (let i = 0; i < path.points.length - 1; i++) {
    const left = i * 2;
    const nextLeft = left + 2;
    const offset = i * 6;
    indices[offset] = left;
    indices[offset + 1] = nextLeft;
    indices[offset + 2] = left + 1;
    indices[offset + 3] = left + 1;
    indices[offset + 4] = nextLeft;
    indices[offset + 5] = nextLeft + 1;
  }
  return {
    supported: true,
    proxy: {
      connectorId: record.id,
      authoredInstanceId: path.authoredInstanceId,
      kind: record.kind,
      vertices,
      indices,
    },
  };
}
