import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';

export type Point2 = [number, number];
export type V3 = [number, number, number];

/**
 * Shared procedural primitives for tents, entrances, and future structures.
 * Procedural R3F/Three.js only — no GLB/GLTF, no external assets.
 *
 * Ownership: every builder returns a NEW geometry owned by the caller.
 * Merge it (see `BoothObject.buildBooth`) or mount it declaratively and let
 * R3F dispose it on unmount; never dispose a geometry still mounted elsewhere.
 * The `materials.ts` registry holds plain tokens and needs no disposal.
 */

export const TENT_BASE_PLATE_SIZE: V3 = [0.3, 0.02, 0.3];
export const TENT_POLE_RADIUS = 0.04;
export const TENT_COLLISION_RADIUS = 0.05;
export const GUY_ROPE_RADIUS = 0.005;
export const GUY_ANCHOR_OFFSET = 1.0;
export const VALANCE_HEIGHT = 0.25;

/** Steel ground footing under every corner / mid pole. Spec §2 `BasePlates`. */
export function basePlateGeometry(): BufferGeometry {
  return new BoxGeometry(...TENT_BASE_PLATE_SIZE);
}

/** Vertical tubular aluminum column. Caller positions at (±W/2, eavesH/2, ±D/2). */
export function tentPoleGeometry(eavesHeight: number): BufferGeometry {
  const geometry = new CylinderGeometry(TENT_POLE_RADIUS, TENT_POLE_RADIUS, eavesHeight, 12);
  geometry.translate(0, eavesHeight / 2, 0);
  return geometry;
}

/** Corner + mid-pole ground positions. Mid poles every 2.5 m along D edges. */
export function tentPolePositions(width: number, depth: number): Point2[] {
  const corners: Point2[] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
  if (depth <= 2.5) {
    return corners;
  }
  const mids: Point2[] = [];
  const segments = Math.floor(depth / 2.5);
  for (let i = 1; i <= segments; i++) {
    const z = -depth / 2 + (i * depth) / (segments + 1);
    mids.push([-width / 2, z], [width / 2, z]);
  }
  return [...corners, ...mids];
}

/** Catenary-ish sag used on valance edges and roof ridges. Spec §5 `[always]`. */
export function catenarySag(u: number, amplitude = 0.05): number {
  return -amplitude * Math.sin(Math.PI * u);
}

/** Marquee scallop displacement. Spec §2 `z_sag = -0.05 · sin(π·u)`. */
export function marqueeScallop(u: number): number {
  return -0.05 * Math.sin(Math.PI * u);
}

/** Vertical fabric trim skirt encircling the eaves perimeter. Spec §2 `ValanceEdge`. */
export function valanceGeometry(
  width: number,
  depth: number,
  eavesHeight: number,
  height = VALANCE_HEIGHT,
): BufferGeometry {
  const shape = new Shape();
  const hw = width / 2,
    hd = depth / 2;
  shape.moveTo(-hw, -hd);
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, hd);
  shape.lineTo(-hw, hd);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, eavesHeight, 0);
  return geometry;
}

/** Tension cable from eaves corner to a ground anchor 1 m outside footprint. Spec §2. */
export function guyRopeGeometry(from: V3, to: V3): BufferGeometry {
  const curve = new CatmullRomCurve3([
    new Vector3(...from),
    new Vector3(...lerpV3(from, to, 0.5)).add(new Vector3(0, -0.06, 0)),
    new Vector3(...to),
  ]);
  return new TubeGeometry(curve, 8, GUY_ROPE_RADIUS, 6, false);
}

function lerpV3(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Ground anchor positions 1 m outside each corner (45° plan angle). Spec §2. */
export function guyAnchorPositions(width: number, depth: number): Point2[] {
  const hw = width / 2 + GUY_ANCHOR_OFFSET,
    hd = depth / 2 + GUY_ANCHOR_OFFSET;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
}

/** Small ground stake cylinder at an anchor point. Owns its geometry. */
export function stakeGeometry(): BufferGeometry {
  const geometry = new CylinderGeometry(0.02, 0.015, 0.25, 8);
  geometry.translate(0, 0.125, 0);
  return geometry;
}

/** Sliding-door glass leaf. Spec §2 `AutomatedSlidingDoors` 0.85 × 2.4 × 0.02 m. */
export function doorLeafGeometry(): BufferGeometry {
  return new BoxGeometry(0.85, 2.4, 0.02);
}

/** Waist-height turnstile housing. Spec §2 0.3 × 1.0 × 1.0 m. */
export function turnstileHousingGeometry(): BufferGeometry {
  return new BoxGeometry(0.3, 1.0, 1.0);
}

/** Tripod barrier arm. Spec §2 radius 0.02 m, length 0.5 m. */
export function barrierArmGeometry(): BufferGeometry {
  const geometry = new CylinderGeometry(0.02, 0.02, 0.5, 8);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}
