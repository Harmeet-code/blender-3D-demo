import { useEffect, useMemo } from 'react';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Shape,
  ExtrudeGeometry,
  Vector3,
} from 'three';

export type ChairStyle =
  | 'plastic-stackable'
  | 'wooden-cafe'
  | 'bistro-wire'
  | 'banquet-padded'
  | 'bar-stool';
export type ChairLod = 'near' | 'medium' | 'far';
export interface DiningChairPlacement {
  x: number;
  z: number;
  yaw: number;
  style: ChairStyle;
}

type ChairPart = { geometry: BufferGeometry; color: string; matrix?: Matrix4 };
type Point3 = [number, number, number];

const palette = {
  plastic: '#D9E3DC',
  plasticDark: '#B8C8BE',
  ash: '#B99062',
  ashDark: '#765333',
  steel: '#303A3C',
  chrome: '#BCC5C5',
  brass: '#B99A5D',
  velvet: '#6A3444',
  velvetLight: '#945565',
  rubber: '#34383A',
};

const cylinderBetween = (
  start: Vector3,
  end: Vector3,
  radius: number,
  color: string,
  radialSegments: number,
): ChairPart => {
  const direction = end.clone().sub(start);
  const geometry = new CylinderGeometry(radius * 0.92, radius, direction.length(), radialSegments);
  const matrix = new Matrix4().compose(
    start.clone().add(end).multiplyScalar(0.5),
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
    new Vector3(1, 1, 1),
  );
  return { geometry, color, matrix };
};

function box(
  size: [number, number, number],
  position: [number, number, number],
  color: string,
  rotation?: [number, number, number],
): ChairPart {
  const geometry = new BoxGeometry(...size);
  const matrix = new Matrix4().makeRotationFromEuler(new Euler(...(rotation ?? [0, 0, 0])));
  matrix.setPosition(...position);
  return { geometry, color, matrix };
}

function chairParts(style: ChairStyle, lod: ChairLod): ChairPart[] {
  const parts: ChairPart[] = [];
  const radial = lod === 'near' ? 8 : 3;
  const detail = lod === 'near' ? 1 : lod === 'medium' ? 0.72 : 0.42;
  const addBox = (
    size: [number, number, number],
    position: [number, number, number],
    color: string,
    rotation?: [number, number, number],
  ) => parts.push(box(size, position, color, rotation));
  const addCylinder = (
    from: [number, number, number],
    to: [number, number, number],
    radius: number,
    color: string,
  ) => parts.push(cylinderBetween(new Vector3(...from), new Vector3(...to), radius, color, radial));

  if (lod === 'far') {
    // Thirty-two triangles preserve the back, seat, legs and stretcher silhouette beyond 40 m.
    const geometry = new BufferGeometry();
    const vertices: number[] = [];
    const quad = (a: Point3, b: Point3, c: Point3, d: Point3, doubleSided = false) => {
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d);
      if (doubleSided) {
        vertices.push(...c, ...b, ...a, ...d, ...c, ...a);
      }
    };
    quad([-0.22, 0.45, -0.19], [0.22, 0.45, -0.19], [0.22, 0.45, 0.2], [-0.22, 0.45, 0.2], true);
    quad([-0.22, 0.47, -0.2], [0.22, 0.47, -0.2], [0.22, 0.84, -0.21], [-0.22, 0.84, -0.21], true);
    for (const x of [-0.2, 0.2]) {
      for (const z of [-0.17, 0.17]) {
        quad(
          [x - 0.009, 0.02, z],
          [x + 0.009, 0.02, z],
          [x + 0.009, 0.45, z],
          [x - 0.009, 0.45, z],
          true,
        );
      }
    }
    quad([-0.2, 0.23, -0.16], [-0.18, 0.23, -0.16], [-0.18, 0.25, 0.16], [-0.2, 0.25, 0.16]);
    quad([0.18, 0.23, -0.16], [0.2, 0.23, -0.16], [0.2, 0.25, 0.16], [0.18, 0.25, 0.16]);
    quad([-0.18, 0.23, 0.15], [0.18, 0.23, 0.15], [0.18, 0.25, 0.17], [-0.18, 0.25, 0.17]);
    quad([-0.18, 0.23, -0.17], [0.18, 0.23, -0.17], [0.18, 0.25, -0.15], [-0.18, 0.25, -0.15]);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    geometry.computeVertexNormals();
    const farColor =
      style === 'plastic-stackable'
        ? palette.plastic
        : style === 'banquet-padded'
          ? palette.velvet
          : style === 'wooden-cafe'
            ? palette.ash
            : palette.steel;
    return [{ geometry, color: farColor }];
  }

  if (style === 'bar-stool') {
    // 75cm seat and a genuine foot ring at 30cm, as on commercial counter stools.
    addCylinder([0, 0.02, 0], [0, 0.75, 0], 0.027, palette.steel);
    parts.push({
      geometry: new CylinderGeometry(0.28, 0.3, 0.045, radial),
      color: palette.steel,
      matrix: new Matrix4().makeTranslation(0, 0.035, 0),
    });
    parts.push({
      geometry: new CylinderGeometry(0.25, 0.25, 0.06, radial),
      color: palette.ash,
      matrix: new Matrix4().makeTranslation(0, 0.77, 0),
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const x = Math.cos(angle) * 0.16;
      const z = Math.sin(angle) * 0.16;
      addCylinder([x * 1.12, 0.04, z * 1.12], [x, 0.75, z], 0.018, palette.steel);
    }
    // Four slim chords form a footrest rather than a decorative floating hoop.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const b = ((i + 1) * Math.PI) / 2;
      addCylinder(
        [Math.cos(a) * 0.19, 0.3, Math.sin(a) * 0.19],
        [Math.cos(b) * 0.19, 0.3, Math.sin(b) * 0.19],
        0.009,
        palette.chrome,
      );
    }
    return parts;
  }

  // Shared floor-contact frame. Vertical dimensions intentionally do not scale from
  // a generic cube: the seat is at 450mm and the back reaches 850mm.
  if (style === 'wooden-cafe') {
    for (const x of [-0.21, 0.21]) {
      addCylinder([x * 1.1, 0.02, 0.2], [x, 0.45, 0.15], 0.022, palette.ashDark);
      addCylinder([x * 1.1, 0.02, -0.2], [x, 0.45, -0.18], 0.022, palette.ashDark);
      addCylinder([x, 0.44, -0.18], [x, 0.84, -0.236], 0.021, palette.ashDark);
    }
    const seatSlats = lod === 'near' ? 5 : 2;
    for (let slat = 0; slat < seatSlats; slat++) {
      const z = -0.18 + (slat * 0.36) / Math.max(1, seatSlats - 1);
      addBox([0.43, 0.025, 0.055], [0, 0.455, z], palette.ash, [0, 0, slat < 2 ? -0.015 : 0]);
    }
    const backSlats = lod === 'near' ? 4 : 2;
    for (let slat = 0; slat < backSlats; slat++) {
      const y = 0.53 + (slat * 0.24) / Math.max(1, backSlats - 1);
      addBox([0.39, 0.045, 0.024], [0, y, -0.2 - (y - 0.53) * 0.14], palette.ash, [-0.14, 0, 0]);
    }
    for (const x of [-0.21, 0.21]) {
      addCylinder([x, 0.22, -0.13], [x, 0.22, 0.14], 0.014, palette.ashDark);
    }
    return parts;
  }

  if (style === 'bistro-wire') {
    // Crosshatched seat/back wires: spacing is deliberately open so the woven silhouette reads.
    const wireCount = lod === 'near' ? 4 : 2;
    for (let index = 0; index < wireCount; index += 1) {
      const t = index / (wireCount - 1);
      const x = -0.18 + t * 0.36;
      const y = 0.53 + t * 0.28;
      const z = -0.15 + t * 0.3;
      addCylinder([x, 0.44, -0.18], [x, 0.84, -0.236], 0.006 * detail, palette.steel);
      addCylinder([x, 0.46, -0.2], [x, 0.46, 0.2], 0.006 * detail, palette.steel);
      addCylinder(
        [-0.2, y, -0.2],
        [0.2, y, -0.2 - (y - 0.5) * 0.14],
        0.006 * detail,
        palette.steel,
      );
      addCylinder([-0.2, 0.45, z], [0.2, 0.45, z], 0.006 * detail, palette.steel);
    }
    for (const x of [-0.21, 0.21]) {
      addCylinder([x * 1.12, 0.02, 0.19], [x, 0.45, 0.16], 0.012, palette.steel);
      addCylinder([x * 1.12, 0.02, -0.19], [x, 0.45, -0.18], 0.012, palette.steel);
      addCylinder([x, 0.44, -0.18], [x, 0.84, -0.236], 0.012, palette.steel);
    }
    return parts;
  }

  // Plastic stackable seat and shell. Extrusion holes are actual breathing slots.
  if (style === 'plastic-stackable') {
    // Distinct seat pan plus a curved shell with three open breather slots.
    if (lod === 'near') {
      addBox([0.46, 0.04, 0.41], [0, 0.455, 0.015], palette.plastic);
    } else {
      const seat = new PlaneGeometry(0.46, 0.41);
      seat.applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2));
      seat.translate(0, 0.455, 0.015);
      parts.push({ geometry: seat, color: palette.plastic });
    }
    const shell = new Shape();
    shell.moveTo(-0.22, 0.45);
    shell.quadraticCurveTo(-0.24, 0.64, -0.21, 0.82);
    shell.quadraticCurveTo(0, 0.88, 0.21, 0.82);
    shell.quadraticCurveTo(0.24, 0.64, 0.22, 0.45);
    shell.quadraticCurveTo(0, 0.43, -0.22, 0.45);
    for (let slot = 0; slot < 3; slot++) {
      const y = 0.58 + slot * 0.085;
      const hole = new Shape();
      hole.absellipse(0, y, 0.014, 0.038, 0, Math.PI * 2, false, 0);
      shell.holes.push(hole);
    }
    const back = new ExtrudeGeometry(shell, {
      depth: 0.026,
      bevelEnabled: false,
      curveSegments: lod === 'near' ? radial : 3,
    });
    back.translate(0, 0, -0.22);
    const pivot = new Vector3(0, 0.45, -0.22);
    back.applyMatrix4(
      new Matrix4()
        .makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(new Matrix4().makeRotationX((-8 * Math.PI) / 180))
        .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)),
    );
    parts.push({ geometry: back, color: palette.plastic });
    if (lod === 'near') {
      parts.push({
        geometry: new CylinderGeometry(0.018, 0.018, 0.44, radial),
        color: palette.plasticDark,
        matrix: new Matrix4().makeTranslation(0, 0.447, 0.01),
      });
    }
    // molded under-seat ribs, reduced away from the camera
    if (lod === 'near') {
      for (const x of [-0.17, 0.17]) {
        addCylinder([x, 0.42, -0.14], [x, 0.42, 0.16], 0.009 * detail, palette.plasticDark);
        addCylinder([x, 0.42, -0.14], [0, 0.42, -0.14], 0.009 * detail, palette.plasticDark);
      }
    }
    for (const x of [-0.19, 0.19]) {
      for (const z of [-0.16, 0.16]) {
        addCylinder([x * 1.08, 0.02, z * 1.08], [x, 0.43, z], 0.018, palette.plasticDark);
      }
    }
    return parts;
  }

  // Banquet chair: velvet-padded seat and reclined back over a chrome frame.
  const backRotation: [number, number, number] = [(-8 * Math.PI) / 180, 0, 0];
  addBox([0.46, 0.07, 0.43], [0, 0.455, 0.015], palette.velvet);
  addBox([0.43, 0.04, 0.4], [0, 0.5, 0.015], palette.velvetLight);
  addBox([0.45, 0.39, 0.065], [0, 0.655, -0.19], palette.velvet);
  addBox([0.42, 0.34, 0.035], [0, 0.66, -0.15], palette.velvetLight, backRotation);
  for (const x of [-0.2, 0.2]) {
    addCylinder([x * 1.12, 0.02, 0.18], [x, 0.45, 0.15], 0.012, palette.chrome);
    addCylinder([x * 1.12, 0.02, -0.18], [x, 0.45, -0.18], 0.012, palette.chrome);
    addCylinder([x, 0.44, -0.18], [x, 0.84, -0.21], 0.014, palette.chrome);
    // Brass ganging hook at the frame side keeps banquet rows connected.
    addCylinder([x * 1.02, 0.43, 0.16], [x * 1.3, 0.43, 0.16], 0.009, palette.brass);
  }
  return parts;
}

/** Build the canonical chair geometry (forward is +Z; local origin is floor contact). */
export function createProceduralChairGeometry(
  style: ChairStyle = 'wooden-cafe',
  lod: ChairLod = 'near',
): BufferGeometry {
  const geometries = chairParts(style, lod).map(({ geometry, color, matrix }) => {
    if (matrix) {
      geometry.applyMatrix4(matrix);
    }
    const compatible = geometry.index ? geometry.toNonIndexed() : geometry;
    if (compatible !== geometry) {
      geometry.dispose();
    }
    compatible.computeVertexNormals();
    const tint = new Color(color);
    const { count } = compatible.getAttribute('position');
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      tint.toArray(colors, index * 3);
    }
    compatible.setAttribute('color', new BufferAttribute(colors, 3));
    return compatible;
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) {
    throw new Error(`Could not merge ${style} chair geometry.`);
  }
  merged.computeBoundingSphere();
  return merged;
}

/** Bake placement transforms and style variants into one vertex-colored draw batch. */
export function createDiningChairBatch(
  placements: readonly DiningChairPlacement[],
  lod: ChairLod = 'near',
): BufferGeometry {
  const pieces = placements.map(({ x, z, yaw, style }) => {
    const geometry = createProceduralChairGeometry(style, lod);
    geometry.applyMatrix4(
      new Matrix4().compose(
        new Vector3(x, 0, z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
        new Vector3(1, 1, 1),
      ),
    );
    return geometry;
  });
  if (!pieces.length) {
    return new BufferGeometry();
  }
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((geometry) => geometry.dispose());
  if (!merged) {
    throw new Error('Could not merge dining chair instances.');
  }
  merged.computeBoundingSphere();
  return merged;
}

export function ProceduralChair({
  style = 'wooden-cafe',
  width = 0.5,
  depth = 0.5,
  height = 0.85,
  lod = 'near',
  color = '#FFFFFF',
  ghost = false,
}: {
  style?: ChairStyle;
  width?: number;
  depth?: number;
  height?: number;
  lod?: ChairLod;
  color?: string;
  ghost?: boolean;
}) {
  const geometry = useMemo(() => createProceduralChairGeometry(style, lod), [style, lod]);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color,
        vertexColors: true,
        roughness: style === 'bistro-wire' ? 0.52 : style === 'banquet-padded' ? 0.88 : 0.72,
        metalness: style === 'bistro-wire' ? 0.62 : style === 'banquet-padded' ? 0.48 : 0.02,
        transparent: ghost,
        opacity: ghost ? 0.38 : 1,
        depthWrite: !ghost,
      }),
    [color, style, ghost],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      scale={[width / 0.5, height / 0.85, depth / 0.5]}
      castShadow={!ghost}
      receiveShadow
    />
  );
}
