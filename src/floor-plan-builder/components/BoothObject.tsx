import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { BufferGeometry, Mesh } from 'three';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  NoColorSpace,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  Vector2,
  ExtrudeGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { polygonBounds, signedArea } from '@/utils/geometry/polygon.ts';
import {
  boothDesign,
  boothEdges,
  closetFootprint,
  cornerInset,
  cornerPostPolygon,
  edgePoint,
  wallPolygon,
  wallRuns,
  type BoothEdge,
  type BoothPoint,
} from '../model/booth.ts';
import type { PlanObject } from '../model/types.ts';

type Batch =
  | 'carpet'
  | 'panels'
  | 'aluminum'
  | 'fascia'
  | 'rubber'
  | 'plan'
  | 'light'
  | 'roof'
  | 'roofMetal';
const tokens = {
  carpet: { roughness: 0.95, metalness: 0 },
  panels: { roughness: 0.85, metalness: 0.05 },
  aluminum: { roughness: 0.35, metalness: 0.85 },
  fascia: { roughness: 0.85, metalness: 0.05 },
  rubber: { roughness: 1, metalness: 0 },
  plan: { roughness: 0.8, metalness: 0 },
  light: { roughness: 0.4, metalness: 0 },
  roof: { roughness: 0.85, metalness: 0.05 },
  roofMetal: { roughness: 0.35, metalness: 0.85 },
};
function polygonSolid(points: BoothPoint[], height: number, y: number) {
  const shape = new Shape(points.map(([x, z]) => new Vector2(x, -z)));
  const geometry = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}
function useSignTexture(company: string, number: string) {
  const texture = useMemo(() => {
    const companyName = company.trim(),
      boothNumber = number.trim();
    if (!companyName && !boothNumber) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#1E2022';
    context.fillRect(0, 0, 1024, 128);
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (companyName) {
      let size = 66;
      context.font = `600 ${size}px Arial, sans-serif`;
      while (context.measureText(companyName).width > 960 && size > 12) {
        context.font = `600 ${--size}px Arial, sans-serif`;
      }
      context.fillText(companyName, 512, boothNumber ? 43 : 64, 960);
    }
    if (boothNumber) {
      context.font = companyName ? '500 28px Arial, sans-serif' : '600 66px Arial, sans-serif';
      context.fillStyle = companyName ? '#DDE4E8' : '#FFFFFF';
      context.fillText(
        companyName ? `BOOTH ${boothNumber}` : boothNumber,
        512,
        companyName ? 102 : 64,
        960,
      );
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [company, number]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
function useCarpetBump() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const pixels = context.createImageData(64, 64);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = 95 + (((i * 1103515245 + 12345) >>> 16) % 85);
      pixels.data[i] = value;
      pixels.data[i + 1] = value;
      pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const value = new CanvasTexture(canvas);
    value.colorSpace = NoColorSpace;
    value.wrapS = RepeatWrapping;
    value.wrapT = RepeatWrapping;
    value.repeat.set(18, 18);
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
function buildBooth(
  polygon: PlanObject['polygon'],
  dimensions: PlanObject['dimensions'],
  designOptions: PlanObject['boothDesign'],
  gate: PlanObject['gate'],
  floorColor: string,
  colorOverride: boolean,
) {
  const object = { polygon, dimensions, boothDesign: designOptions, gate };
  const [, h] = dimensions;
  const design = boothDesign(object),
    edges = boothEdges(object);
  const parts = new Map<Batch, BufferGeometry[]>();
  const surface = (id: string, fallback: string) =>
    colorOverride && !id.startsWith('header') ? floorColor : (design.surfaceColors[id] ?? fallback);
  const add = (
    batch: Batch,
    geometry: BufferGeometry,
    color: string,
    outerColor?: string,
    inward?: BoothPoint,
  ) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) {
      geometry.dispose();
    }
    const vertexColors = new Float32Array(flat.attributes.position!.count * 3);
    const inside = new Color(color),
      outside = new Color(outerColor ?? color),
      normal = flat.attributes.normal!;
    for (let i = 0; i < normal.count; i++) {
      const tint =
        inward && normal.getX(i) * inward[0] + normal.getZ(i) * inward[1] < -0.5 ? outside : inside;
      tint.toArray(vertexColors, i * 3);
    }
    flat.setAttribute('color', new Float32BufferAttribute(vertexColors, 3));
    const list = parts.get(batch) ?? [];
    list.push(flat);
    parts.set(batch, list);
  };
  const box = (
    batch: Batch,
    size: [number, number, number],
    position: [number, number, number],
    color: string,
    yaw = 0,
  ) => {
    const geometry = new BoxGeometry(...size);
    geometry.rotateY(yaw);
    geometry.translate(...position);
    add(batch, geometry, color);
  };
  const beam = (
    batch: Batch,
    edge: BoothEdge,
    from: number,
    to: number,
    y: number,
    height: number,
    thickness: number,
    color: string,
  ) => {
    if (to - from < 1e-5) {
      return;
    }
    const p = edgePoint(edge, (from + to) / 2, thickness / 2);
    box(
      batch,
      [to - from, height, thickness],
      [p[0], y, p[1]],
      color,
      -Math.atan2(edge.tangent[1], edge.tangent[0]),
    );
  };
  add('carpet', polygonSolid(object.polygon, 0.05, 0), surface('floor', floorColor));
  for (const edge of edges) {
    const innerColor = surface(`wall-${edge.index}-inner`, design.primaryColor);
    const outerColor = surface(`wall-${edge.index}-outer`, design.primaryColor);
    const aluminum = surface(`plinth-${edge.index}`, '#C0C4C8');
    for (const [from, to] of wallRuns(edge)) {
      if (to - from < 1e-5) {
        continue;
      }
      add(
        'panels',
        polygonSolid(wallPolygon(edges, edge, from, to), Math.max(0.05, h - 0.4), 0.05),
        innerColor,
        outerColor,
        edge.inward,
      );
      beam('aluminum', edge, from, to, 0.04, 0.08, 0.05, aluminum);
      beam('aluminum', edge, from, to, h - 0.025, 0.05, 0.055, aluminum);
      {
        for (let distance = from + 1; distance < to - 0.05; distance += 1) {
          const p = edgePoint(edge, distance, 0.04);
          const post = new CylinderGeometry(0.025, 0.025, h, 8);
          post.translate(p[0], h / 2, p[1]);
          add('aluminum', post, aluminum);
          // Two 2 mm recesses read as panel-edge grooves without expensive bevel topology.
          for (const side of [0.002, 0.078]) {
            const q = edgePoint(edge, distance - 0.014, side);
            box(
              'rubber',
              [0.002, Math.max(0.05, h - 0.44), 0.002],
              [q[0], h / 2 - 0.15, q[1]],
              '#8E969A',
            );
          }
        }
      }
    }
    if (edge.mode !== 'wall') {
      const from = (edge.length - edge.opening) / 2,
        to = from + edge.opening;
      beam(
        'fascia',
        edge,
        from,
        to,
        h - 0.175,
        0.35,
        0.06,
        surface(`header-${edge.index}`, '#1E2022'),
      );
      {
        beam('light', edge, from, to, h - 0.36, 0.018, 0.04, '#E6ECEF');
      }
      if (edge.mode === 'entrance') {
        for (const distance of [from - 0.025, to + 0.025]) {
          const p = edgePoint(edge, distance, 0.04);
          const jamb = new CylinderGeometry(0.025, 0.025, h, 8);
          jamb.translate(p[0], h / 2, p[1]);
          add('aluminum', jamb, aluminum);
        }
      }
    }
    const corner = cornerInset(edges, edge.index, 0.028);
    // A mitered corner prism follows both incident wall normals, including concave joints.
    const cap = cornerPostPolygon(edges, edge.index);
    if (Math.abs(signedArea(cap)) > 1e-7) {
      add('aluminum', polygonSolid(cap, h, 0), aluminum);
    }
    {
      const foot = new CylinderGeometry(0.015, 0.015, 0.022, 8);
      foot.translate(corner[0], 0.011, corner[1]);
      add('rubber', foot, '#20252A');
      beam('rubber', edge, 0.02, edge.length - 0.02, 0.052, 0.004, 0.01, '#20252A');
    }
    // Dedicated plan symbols remain readable above headers and optional roofs.
    for (const [from, to] of wallRuns(edge)) {
      beam('plan', edge, from, to, h + 0.006, 0.008, 0.045, '#1E2022');
    }
    if (edge.mode !== 'wall') {
      for (let s = 0; s < edge.opening; s += 0.3) {
        beam(
          'plan',
          edge,
          (edge.length - edge.opening) / 2 + s,
          (edge.length - edge.opening) / 2 + Math.min(s + 0.17, edge.opening),
          h + 0.009,
          0.008,
          0.025,
          '#06B6D4',
        );
      }
    }
  }
  if (design.roof === 'solid') {
    add(
      'roof',
      polygonSolid(object.polygon, 0.04, h - 0.04),
      colorOverride ? floorColor : design.primaryColor,
    );
  }
  if (design.roof === 'truss') {
    const bounds = polygonBounds(object.polygon);
    // Clipped interior scan lines avoid beams crossing the empty courtyard of a concave polygon.
    for (const axis of [0, 1] as const) {
      const min = axis ? bounds.minZ : bounds.minX,
        max = axis ? bounds.maxZ : bounds.maxX;
      const count = Math.min(20, Math.max(1, Math.ceil(max - min)));
      for (let line = 1; line < count; line++) {
        const coordinate = min + ((max - min) * line) / count;
        const hits = edges
          .filter((edge) => edge.a[axis] > coordinate !== edge.b[axis] > coordinate)
          .map((edge) => {
            const t = (coordinate - edge.a[axis]) / (edge.b[axis] - edge.a[axis]);
            return edge.a[1 - axis]! + t * (edge.b[1 - axis]! - edge.a[1 - axis]!);
          })
          .sort((a, b) => a - b);
        for (let i = 0; i + 1 < hits.length; i += 2) {
          const from = hits[i]! + 0.06,
            to = hits[i + 1]! - 0.06;
          if (to <= from) {
            continue;
          }
          box(
            'roofMetal',
            axis ? [to - from, 0.045, 0.035] : [0.035, 0.045, to - from],
            axis
              ? [(from + to) / 2, h - 0.025, coordinate]
              : [coordinate, h - 0.025, (from + to) / 2],
            '#C0C4C8',
          );
        }
      }
    }
  }
  const result = [...parts].map(([kind, geometries]) => {
    const geometry = mergeGeometries(geometries, false)!;
    geometries.forEach((part) => part.dispose());
    geometry.computeBoundingSphere();
    return { kind, geometry };
  });
  return result;
}
function Closet({ object, ghost }: { object: PlanObject; ghost: boolean }) {
  const door = useRef<Mesh>(null),
    invalidate = useThree((state) => state.invalidate);
  const transition = useRef({ from: 0, to: 0, elapsed: 0.4 });
  const bounds = polygonBounds(closetFootprint(object)),
    height = Math.min(2.08, object.dimensions[1] - 0.07);
  const target = boothDesign(object).closetDoorOpen ? 0.8 : 0;
  const origin = bounds.minX + 0.48;
  useEffect(() => {
    transition.current = {
      from: (door.current?.position.x ?? origin) - origin,
      to: target,
      elapsed: 0,
    };
    invalidate();
  }, [target, origin, invalidate]);
  useFrame((_, delta) => {
    const animation = transition.current;
    if (!door.current || animation.elapsed >= 0.4) {
      return;
    }
    animation.elapsed = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0.4
      : Math.min(0.4, animation.elapsed + Math.min(delta, 0.1));
    const t = animation.elapsed / 0.4,
      eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    door.current.position.x = origin + animation.from + (animation.to - animation.from) * eased;
    if (animation.elapsed < 0.4) {
      invalidate();
    }
  });
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, key: string) => (
    <mesh key={key} position={[x, y, z]} castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={boothDesign(object).primaryColor}
        {...tokens.panels}
        transparent={ghost}
        opacity={ghost ? 0.45 : 1}
      />
    </mesh>
  );
  return (
    <group name="StorageCloset">
      {panel(1.7, height, 0.08, bounds.minX + 0.85, height / 2 + 0.05, bounds.minZ + 0.04, 'rear')}
      {panel(0.08, height, 1.1, bounds.minX + 0.04, height / 2 + 0.05, bounds.minZ + 0.55, 'left')}
      {panel(0.08, height, 1.1, bounds.maxX - 0.04, height / 2 + 0.05, bounds.minZ + 0.55, 'right')}
      {panel(
        0.82,
        height,
        0.08,
        bounds.maxX - 0.41,
        height / 2 + 0.05,
        bounds.maxZ - 0.04,
        'front',
      )}
      {panel(
        0.88,
        Math.max(0.02, height - 2),
        0.08,
        bounds.minX + 0.44,
        2.05 + (height - 2) / 2,
        bounds.maxZ - 0.04,
        'lintel',
      )}
      <mesh ref={door} position={[origin, 1.05, bounds.maxZ - 0.09]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 2, 0.035]} />
        <meshStandardMaterial
          color="#E7EAEC"
          {...tokens.panels}
          transparent={ghost}
          opacity={ghost ? 0.45 : 1}
        />
        <mesh position={[0.3, 0, 0.025]}>
          <boxGeometry args={[0.018, 0.16, 0.018]} />
          <meshStandardMaterial
            color="#C0C4C8"
            {...tokens.aluminum}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      </mesh>
    </group>
  );
}
export function BoothObject({
  object,
  color,
  colorOverride = false,
  ghost = false,
}: {
  object: PlanObject;
  color: string;
  colorOverride?: boolean;
  ghost?: boolean;
}) {
  const batches = useMemo(
    () =>
      buildBooth(
        object.polygon,
        object.dimensions,
        object.boothDesign,
        object.gate,
        color,
        colorOverride,
      ),
    [
      object.polygon,
      object.dimensions,
      object.boothDesign,
      object.gate,
      color,
      ghost,
      colorOverride,
    ],
  );
  useEffect(() => () => batches.forEach(({ geometry }) => geometry.dispose()), [batches]);
  const text = useSignTexture(object.company, object.boothNumber),
    bump = useCarpetBump();
  const edges = boothEdges(object);
  return (
    <group name="ModularBooth">
      {batches.map(({ kind, geometry }) => (
        <mesh
          key={kind}
          userData={{ routeOccluder: kind === 'roof' || kind === 'roofMetal' }}
          geometry={geometry}
          castShadow={!ghost && kind !== 'plan'}
          receiveShadow={!ghost}
        >
          <meshStandardMaterial
            vertexColors
            {...tokens[kind]}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
            depthWrite={!ghost}
            bumpMap={kind === 'carpet' && !ghost ? bump : null}
            bumpScale={0.0015}
            emissive={kind === 'light' ? '#E6ECEF' : '#000000'}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
      {!ghost &&
        text &&
        edges
          .filter((edge) => edge.mode !== 'wall' && edge.opening > 1.5)
          .map((edge) => {
            const p = edgePoint(edge, edge.length / 2, -0.001);
            const orientation = Math.atan2(-edge.inward[0], -edge.inward[1]);
            return (
              <mesh
                key={edge.index}
                name={`FasciaSign-${edge.index}`}
                position={[p[0], object.dimensions[1] - 0.175, p[1]]}
                rotation={[0, orientation, 0]}
              >
                <planeGeometry args={[Math.max(0.1, edge.opening - 0.12), 0.29]} />
                <meshBasicMaterial map={text} toneMapped={false} />
              </mesh>
            );
          })}
      {boothDesign(object).storage && <Closet object={object} ghost={ghost} />}
    </group>
  );
}
