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
  // Reject near reversals: their offset edges cross and cannot form a valid ribbon.
  for (let i = 1; i < directions.length; i++) {
    const [ax, az] = directions[i - 1]!;
    const [bx, bz] = directions[i]!;
    if (ax * bx + az * bz < -0.95) return { supported: false, connectorId: record.id, reason: `Path reverses direction too sharply at sample ${i}.` };
  }
  const vertices = new Float32Array(path.points.length * 2 * 3);
  for (let i = 0; i < path.points.length; i++) {
    const p = path.points[i]!;
    const before = path.points[Math.max(0, i - 1)]!;
    const after = path.points[Math.min(path.points.length - 1, i + 1)]!;
    const dx = after[0] - before[0];
    const dz = after[2] - before[2];
    const horizontalLength = Math.hypot(dx, dz);
    if (horizontalLength <= 1e-8) {
      return { supported: false, connectorId: record.id, reason: `Path has no horizontal direction at sample ${i}.` };
    }
    const halfWidth = path.widthM / 2;
    const sideX = -dz / horizontalLength * halfWidth;
    const sideZ = dx / horizontalLength * halfWidth;
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
