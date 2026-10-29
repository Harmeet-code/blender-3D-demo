import { useEffect, useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  LinearMipmapLinearFilter,
  LinearFilter,
  Float32BufferAttribute,
  type BufferGeometry,
} from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  parkingLayout,
  type LotLayout,
  type ParkingBay,
  type Point2,
} from '../model/parking-lot.ts';
import type { PlanObject } from '../model/types.ts';

type Props = {
  object: PlanObject;
  ghost: boolean;
  opacity: number;
  heatmap?: boolean;
  suppressBayTooltip?: boolean;
  onSelectParkingBay?: (bayId: string) => void;
  onSelectParkingBoundary?: () => void;
  onHoverParkingBay?: (bayId: string | null) => void;
};
type VehicleKind = 'sedan' | 'suv' | 'hatch' | 'van';
const specs: Record<VehicleKind, [number, number, number]> = {
  sedan: [4.6, 1.8, 1.4],
  suv: [4.8, 1.9, 1.7],
  hatch: [4.1, 1.7, 1.4],
  van: [5.2, 2, 2],
};
const vehicleColor = [
  '#73808A',
  '#A9B4B8',
  '#596A70',
  '#D0C6B3',
  '#334754',
  '#8A4B3F',
  '#E0DED5',
  '#37463F',
];
function vehicleKind(bay: ParkingBay): VehicleKind {
  const seeded: VehicleKind[] = ['sedan', 'suv', 'hatch', 'van'];
  return bay.vehicle?.model && bay.vehicle.model in specs
    ? (bay.vehicle.model as VehicleKind)
    : seeded[(Number.parseInt(bay.id.replace(/\D/g, ''), 10) || 0) % seeded.length]!;
}

function polygonGeometry(points: Point2[], y: number) {
  const shape = new Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

function makeAsphaltTexture(layout: LotLayout, object: PlanObject, heatmap: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const xs = object.polygon.map((p) => p[0]),
    zs = object.polygon.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const sx = 2048 / (maxX - minX),
    sz = 2048 / (maxZ - minZ);
  const px = (x: number) => (x - minX) * sx,
    py = (z: number) => (maxZ - z) * sz;
  ctx.fillStyle = '#262626';
  ctx.fillRect(0, 0, 2048, 2048);
  // A deterministic, low-contrast aggregate grain survives mip selection without shimmering.
  let seed = 0x51f15e;
  for (let i = 0; i < 90000; i++) {
    seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0;
    const x = (seed >>> 0) % 2048;
    seed = Math.imul(seed ^ (seed >>> 13), 1 | seed);
    const y = (seed >>> 0) % 2048;
    const a = 0.025 + ((seed >>> 0) % 10) / 500;
    ctx.fillStyle = seed & 1 ? `rgba(220,220,210,${a})` : `rgba(0,0,0,${a})`;
    const r = 1 + ((seed >>> 5) % 3);
    ctx.fillRect(x, y, r, r);
  }
  const line = (a: Point2, b: Point2, color = '#D9D9D4', width = 0.075) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, (width * (sx + sz)) / 2);
    ctx.lineCap = 'square';
    ctx.beginPath();
    ctx.moveTo(px(a[0]), py(a[1]));
    ctx.lineTo(px(b[0]), py(b[1]));
    ctx.stroke();
  };
  for (const bay of layout.bays) {
    const color = heatmap
      ? bay.type === 'accessible'
        ? '#58A9E8'
        : bay.type === 'ev'
          ? '#39D979'
          : bay.isOccupied
            ? '#DE625C'
            : '#45B978'
      : '#D8D8D2';
    const points = bay.polygon;
    line(points[0]!, points[1]!, color);
    line(points[1]!, points[2]!, color);
    line(points[2]!, points[3]!, color);
    if (bay.hatchPolygon?.length) {
      const hp = bay.hatchPolygon;
      for (let i = 0; i < 9; i++) {
        const t = i / 9;
        line(
          [hp[0]![0] + (hp[3]![0] - hp[0]![0]) * t, hp[0]![1] + (hp[3]![1] - hp[0]![1]) * t],
          [hp[0]![0] + (hp[1]![0] - hp[0]![0]) * t, hp[0]![1] + (hp[1]![1] - hp[0]![1]) * t],
          color,
          0.045,
        );
      }
    }
    const c = bay.center;
    const angle = bay.yaw;
    ctx.save();
    ctx.translate(px(c[0]), py(c[1]));
    ctx.rotate(-angle);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 25px Arial';
    if (bay.type === 'accessible') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(0, -5);
      ctx.lineTo(20, 1);
      ctx.lineTo(8, 18);
      ctx.lineTo(-8, 18);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(14, 23, 11, 0, Math.PI * 2);
      ctx.stroke();
    } else if (bay.type === 'ev') {
      ctx.font = 'bold 33px Arial';
      ctx.fillText('EV', 0, 0);
    } else {
      ctx.font = 'bold 19px Arial';
      ctx.fillText(bay.id.split('-').slice(-1)[0] ?? '', 0, 0);
    }
    ctx.restore();
  }
  layout.aisles.forEach((aisle) => {
    const [a, b] = aisle.centerline;
    if (!a || !b) {
      return;
    }
    // Longitudinal center dashes and directional chevrons are baked into the same surface map.
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      ux = dx / len,
      uz = dz / len;
    for (let d = 1.2; d < len - 0.5; d += 5.5) {
      line(
        [a[0] + ux * d, a[1] + uz * d],
        [a[0] + ux * Math.min(d + 2.8, len), a[1] + uz * Math.min(d + 2.8, len)],
        '#B6B2A5',
        0.045,
      );
    }
    ctx.save();
    ctx.translate(px((a[0] + b[0]) / 2), py((a[1] + b[1]) / 2));
    ctx.rotate(-Math.atan2(dz, dx));
    ctx.strokeStyle = '#C6C5BD';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.lineTo(38, 0);
    ctx.moveTo(12, -24);
    ctx.lineTo(38, 0);
    ctx.lineTo(12, 24);
    ctx.stroke();
    ctx.restore();
  });
  // STOP labels sit at the lot access edges; arrows, striping, labels and stains share this one map.
  for (const gate of layout.gates ?? []) {
    const p = gate.vehicleCenterline?.[0];
    if (!p) {
      continue;
    }
    ctx.save();
    ctx.translate(px(p[0]), py(p[1]));
    ctx.fillStyle = '#D65C50';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('STOP', 0, -12);
    ctx.restore();
  }
  for (let i = 0; i < 11; i++) {
    const x = 80 + ((i * 317) % 1850),
      y = 100 + ((i * 571) % 1840);
    const g = ctx.createRadialGradient(x, y, 3, x, y, 45 + (i % 4) * 12);
    g.addColorStop(0, 'rgba(10,9,8,.23)');
    g.addColorStop(1, 'rgba(10,9,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 70, y - 70, 140, 140);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = 'srgb';
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function modelGeometry(kind: VehicleKind, far = false) {
  const [length, width, height] = specs[kind];
  const parts: Mesh[] = [
    new Mesh(new BoxGeometry(length, 0.42, width), new MeshBasicMaterial()),
    new Mesh(new BoxGeometry(length * 0.46, height * 0.48, width * 0.82), new MeshBasicMaterial()),
  ];
  parts[0]!.position.y = 0.48;
  parts[1]!.position.set(-length * 0.05, 0.48 + height * 0.43, 0);
  for (const x of [-length * 0.32, length * 0.32]) {
    for (const side of [-1, 1]) {
      const wheel = new Mesh(
        new CylinderGeometry(0.32, 0.32, 0.16, far ? 6 : 72),
        new MeshBasicMaterial(),
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.34, side * (width * 0.5 - 0.04));
      parts.push(wheel);
    }
  }
  for (const side of far ? [] : [-1, 1]) {
    const mirror = new Mesh(new BoxGeometry(0.22, 0.12, 0.12), new MeshBasicMaterial());
    mirror.position.set(length * 0.28, 0.72, side * width * 0.52);
    parts.push(mirror);
  }
  const tints = ['#FFFFFF', '#6F818B', '#283239', '#B8C2C2'];
  const merged = mergeGeometries(
    parts.map((mesh, index) => {
      mesh.updateMatrix();
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrix);
      const tint = new Color(tints[index === 0 ? 0 : index === 1 ? 1 : index < 6 ? 2 : 3]!);
      const color = new Float32Array(g.getAttribute('position').count * 3);
      for (let vertex = 0; vertex < color.length; vertex += 3) {
        color[vertex] = tint.r;
        color[vertex + 1] = tint.g;
        color[vertex + 2] = tint.b;
      }
      g.setAttribute('color', new Float32BufferAttribute(color, 3));
      return g;
    }),
    false,
  )!;
  parts.forEach((part) => part.geometry.dispose());
  parts.forEach((part) => (part.material as MeshBasicMaterial).dispose());
  return merged;
}
// Small geometry constructors keep all model pieces inside a single draw per vehicle class.
function useVehicleBatches(layout: LotLayout, ghost: boolean) {
  const batches = useMemo(() => {
    const meshes: InstancedMesh[] = [];
    const lod: {
      mesh: InstancedMesh;
      near: BufferGeometry;
      far: BufferGeometry;
      center: Vector3;
      isFar: boolean;
    }[] = [];
    const kinds: VehicleKind[] = ['sedan', 'suv', 'hatch', 'van'];
    for (const kind of kinds) {
      const bays = layout.bays.filter((b) => b.isOccupied && vehicleKind(b) === kind);
      if (!bays.length) {
        continue;
      }
      const geometry = modelGeometry(kind);
      const farGeometry = modelGeometry(kind, true);
      const material = new MeshStandardMaterial({
        color: '#fff',
        roughness: 0.58,
        metalness: 0.18,
        transparent: ghost,
        opacity: ghost ? 0.4 : 1,
        vertexColors: true,
      });
      const mesh = new InstancedMesh(geometry, material, bays.length);
      mesh.name = `parking-vehicles-${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bays.forEach((bay, i) => {
        const pos = new Vector3(bay.center[0], 0.15, bay.center[1]),
          q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -bay.yaw);
        mesh.setMatrixAt(i, new Matrix4().compose(pos, q, new Vector3(1, 1, 1)));
        const index = Number.parseInt(bay.id.replace(/\D/g, ''), 10) || i;
        mesh.setColorAt(i, new Color(vehicleColor[index % vehicleColor.length]!));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      meshes.push(mesh);
      const center = bays
        .reduce((sum, bay) => sum.add(new Vector3(bay.center[0], 0, bay.center[1])), new Vector3())
        .multiplyScalar(1 / bays.length);
      lod.push({ mesh, near: geometry, far: farGeometry, center, isFar: false });
    }
    return { meshes, lod };
  }, [layout, ghost]);
  useFrame(({ camera }) => {
    for (const batch of batches.lod) {
      const isFar = camera.position.distanceTo(batch.center) > 30;
      if (isFar === batch.isFar) {
        continue;
      }
      batch.isFar = isFar;
      batch.mesh.geometry = isFar ? batch.far : batch.near;
    }
  });
  useEffect(
    () => () =>
      batches.meshes.forEach((mesh) => {
        (mesh.material as MeshStandardMaterial).dispose();
      }),
    [batches],
  );
  useEffect(
    () => () =>
      batches.lod.forEach((batch) => {
        batch.near.dispose();
        batch.far.dispose();
      }),
    [batches],
  );
  return batches.meshes;
}

function inside(point: Point2, polygon: Point2[]) {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      c = !c;
    }
  }
  return c;
}

export function ParkingLotObject({
  object,
  ghost,
  opacity,
  heatmap = false,
  suppressBayTooltip = false,
  onSelectParkingBay,
  onSelectParkingBoundary,
  onHoverParkingBay,
}: Props) {
  const layout = useMemo(() => parkingLayout(object), [object]);
  const geometry = useMemo(
    () => polygonGeometry(object.polygon, layout.asphaltY ?? 0.15),
    [object.polygon, layout.asphaltY],
  );
  const texture = useMemo(
    () => makeAsphaltTexture(layout, object, heatmap),
    [layout, object, heatmap],
  );
  const [tooltip, setTooltip] = useState<{
    bay: ParkingBay;
    position: [number, number, number];
  } | null>(null);
  const hoveredId = useMemo(() => tooltip?.bay.id, [tooltip]);
  const tooltipTimer = useRef<number>(0);
  const pendingBayId = useRef<string | null>(null);
  useEffect(
    () => () => {
      geometry.dispose();
      texture.dispose();
    },
    [geometry, texture],
  );
  const pick = (event: ThreeEvent<MouseEvent>) => {
    const localPoint = event.object.worldToLocal(event.point.clone());
    const local = [localPoint.x, localPoint.z] as Point2;
    const bay = layout.bays.find((item) => inside(local, item.polygon));
    if (bay) {
      onSelectParkingBay?.(bay.id);
    } else {
      onSelectParkingBoundary?.();
    }
    event.stopPropagation();
  };
  const move = (event: ThreeEvent<PointerEvent>) => {
    const localPoint = event.object.worldToLocal(event.point.clone());
    const point = [localPoint.x, localPoint.z] as Point2;
    const bay = layout.bays.find((item) => inside(point, item.polygon)) ?? null;
    onHoverParkingBay?.(bay?.id ?? null);
    if (!bay) {
      pendingBayId.current = null;
      window.clearTimeout(tooltipTimer.current);
      setTooltip(null);
      return;
    }
    if (pendingBayId.current === bay.id) {
      return;
    }
    pendingBayId.current = bay.id;
    const position: [number, number, number] = [
      localPoint.x,
      (layout.asphaltY ?? 0.15) + 0.03,
      localPoint.z,
    ];
    window.clearTimeout(tooltipTimer.current);
    tooltipTimer.current = window.setTimeout(() => setTooltip({ bay, position }), 380);
  };
  useEffect(() => () => window.clearTimeout(tooltipTimer.current), [tooltipTimer]);
  useEffect(() => {
    if (suppressBayTooltip) {
      pendingBayId.current = null;
      window.clearTimeout(tooltipTimer.current);
      setTooltip(null);
    }
  }, [suppressBayTooltip]);
  const vehicles = useVehicleBatches(layout, ghost);
  return (
    <group name="parking-lot-renderer">
      <mesh
        geometry={geometry}
        receiveShadow
        onPointerDown={(event) => event.stopPropagation()}
        onClick={pick}
        onDoubleClick={pick}
        onPointerMove={move}
        onPointerLeave={() => {
          pendingBayId.current = null;
          window.clearTimeout(tooltipTimer.current);
          setTooltip(null);
          onHoverParkingBay?.(null);
        }}
      >
        <meshStandardMaterial
          map={texture}
          color="#fff"
          roughness={0.88}
          metalness={0.05}
          transparent={ghost}
          opacity={ghost ? 0.22 : opacity}
          side={DoubleSide}
        />
      </mesh>
      <ParkingLotProps layout={layout} ghost={ghost} />
      <PoleBatch layout={layout} ghost={ghost} />
      <LandscapeBatch layout={layout} ghost={ghost} />
      {vehicles.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      {!suppressBayTooltip && tooltip && hoveredId === tooltip.bay.id && (
        <Html
          position={tooltip.position}
          center
          distanceFactor={16}
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
        >
          <div className="rounded-md border border-white/15 bg-slate-950/90 px-2.5 py-1.5 text-xs text-white shadow-xl">
            <strong>{tooltip.bay.id}</strong>
            <span className="ml-2 capitalize text-slate-300">{tooltip.bay.type}</span>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">
              {tooltip.bay.isOccupied ? 'Occupied' : 'Available'}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function boxAt(
  size: [number, number, number],
  center: [number, number, number],
  yaw = 0,
): BufferGeometry {
  const geometry = new BoxGeometry(...size);
  geometry.rotateY(yaw);
  geometry.translate(...center);
  return geometry;
}
function ParkingLotProps({ layout, ghost }: { layout: LotLayout; ghost: boolean }) {
  const geometry = useMemo(() => {
    const pieces: BufferGeometry[] = [];
    // Continuous curb perimeter with joints, wheel stops, bollards and compact service furniture.
    for (const bay of layout.bays) {
      if (!bay.isOccupied) {
        pieces.push(
          boxAt(
            [1.8, 0.15, 0.1],
            [bay.center[0], 0.14, bay.center[1] - Math.cos(bay.yaw) * 2.05],
            bay.yaw,
          ),
        );
      }
      if (bay.type === 'accessible') {
        pieces.push(boxAt([0.12, 0.95, 0.12], [bay.center[0] - 0.9, 0.58, bay.center[1]], 0));
      }
      if (bay.type === 'ev') {
        pieces.push(boxAt([0.28, 1.2, 0.2], [bay.center[0] - 1.2, 0.75, bay.center[1]], 0));
        pieces.push(
          boxAt([0.035, 0.36, 0.035], [bay.center[0] - 0.95, 0.48, bay.center[1] - 0.22], 0),
        );
      }
      if (bay.type === 'vip') {
        pieces.push(boxAt([1.25, 0.07, 0.06], [bay.center[0], 0.4, bay.center[1] + 1.7], 0));
      }
      if (bay.type === 'loading') {
        pieces.push(boxAt([0.5, 0.8, 0.05], [bay.center[0], 0.55, bay.center[1] - 2.35], bay.yaw));
      }
    }
    for (const gate of layout.gates ?? []) {
      const p = gate.vehicleCenterline?.[0];
      if (p) {
        pieces.push(
          boxAt([0.28, 1, 0.28], [p[0] - 1.7, 0.65, p[1]], 0),
          boxAt([0.28, 1, 0.28], [p[0] + 1.7, 0.65, p[1]], 0),
          boxAt([3.5, 0.12, 0.12], [p[0], 1.1, p[1]], 0),
        );
      }
    }
    // Entry booths and covered cart corals are part of this same shared-material batch.
    for (const gate of layout.gates ?? []) {
      const p = gate.vehicleCenterline?.[0];
      if (p) {
        pieces.push(boxAt([2, 2.5, 2], [p[0] - 3, 1.25, p[1] + 2]));
      }
    }
    for (const island of layout.islands) {
      const center = island.reduce(
        (sum, p) => [sum[0] + p[0] / island.length, sum[1] + p[1] / island.length],
        [0, 0] as Point2,
      );
      pieces.push(
        boxAt([2, 0.08, 4], [center[0], 0.85, center[1]]),
        boxAt([0.12, 1.6, 0.12], [center[0] - 0.85, 0.1, center[1] - 1.85]),
        boxAt([0.12, 1.6, 0.12], [center[0] + 0.85, 0.1, center[1] - 1.85]),
        boxAt([0.12, 1.6, 0.12], [center[0] - 0.85, 0.1, center[1] + 1.85]),
        boxAt([0.12, 1.6, 0.12], [center[0] + 0.85, 0.1, center[1] + 1.85]),
      );
    }
    const merged = mergeGeometries(pieces, false) ?? new BoxGeometry(0.01, 0.01, 0.01);
    pieces.forEach((piece) => piece.dispose());
    return merged;
  }, [layout]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#899294"
        roughness={0.68}
        metalness={0.28}
        transparent={ghost}
        opacity={ghost ? 0.35 : 1}
      />
    </mesh>
  );
}

function PoleBatch({ layout, ghost }: { layout: LotLayout; ghost: boolean }) {
  const mesh = useMemo(() => {
    if (!layout.poles.length) {
      return null;
    }
    const pole = new Mesh(new CylinderGeometry(0.055, 0.09, 5, 8), new MeshBasicMaterial());
    pole.position.y = 2.65;
    const arm = new Mesh(new BoxGeometry(0.55, 0.07, 0.08), new MeshBasicMaterial());
    arm.position.set(0.23, 5.05, 0);
    const lens = new Mesh(new BoxGeometry(0.32, 0.09, 0.22), new MeshBasicMaterial());
    lens.position.set(0.43, 4.98, 0);
    const geometry = mergeGeometries(
      [pole, arm, lens].map((part) => {
        part.updateMatrix();
        const g = part.geometry.clone();
        g.applyMatrix4(part.matrix);
        return g;
      }),
      false,
    )!;
    pole.geometry.dispose();
    arm.geometry.dispose();
    lens.geometry.dispose();
    const instances = new InstancedMesh(
      geometry,
      new MeshStandardMaterial({
        color: '#66777A',
        roughness: 0.55,
        metalness: 0.42,
        emissive: '#738680',
        emissiveIntensity: 0.28,
        transparent: ghost,
        opacity: ghost ? 0.35 : 1,
      }),
      layout.poles.length,
    );
    layout.poles.forEach(([x, z], index) =>
      instances.setMatrixAt(index, new Matrix4().makeTranslation(x, layout.asphaltY ?? 0.15, z)),
    );
    instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = true;
    return instances;
  }, [layout, ghost]);
  useEffect(
    () => () => {
      if (mesh) {
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
    },
    [mesh],
  );
  return mesh ? <primitive object={mesh} /> : null;
}

function LandscapeBatch({ layout, ghost }: { layout: LotLayout; ghost: boolean }) {
  const mesh = useMemo(() => {
    if (!layout.islands.length) {
      return null;
    }
    const trunk = new Mesh(new CylinderGeometry(0.11, 0.18, 2.5, 7), new MeshBasicMaterial());
    trunk.position.y = 1.4;
    const crown = new Mesh(new CylinderGeometry(0.18, 0.75, 2.1, 7), new MeshBasicMaterial());
    crown.position.y = 3.45;
    const geometry = mergeGeometries(
      [trunk, crown].map((part) => {
        part.updateMatrix();
        const g = part.geometry.clone();
        g.applyMatrix4(part.matrix);
        return g;
      }),
      false,
    )!;
    trunk.geometry.dispose();
    crown.geometry.dispose();
    const instances = new InstancedMesh(
      geometry,
      new MeshStandardMaterial({
        color: '#66765C',
        roughness: 0.92,
        transparent: ghost,
        opacity: ghost ? 0.35 : 1,
      }),
      layout.islands.length,
    );
    layout.islands.forEach((island, index) => {
      const center = island.reduce(
        (sum, p) => [sum[0] + p[0] / island.length, sum[1] + p[1] / island.length],
        [0, 0] as Point2,
      );
      instances.setMatrixAt(
        index,
        new Matrix4().makeTranslation(center[0], layout.asphaltY ?? 0.15, center[1]),
      );
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = true;
    return instances;
  }, [layout, ghost]);
  useEffect(
    () => () => {
      if (mesh) {
        mesh.geometry.dispose();
        (mesh.material as MeshStandardMaterial).dispose();
      }
    },
    [mesh],
  );
  return mesh ? <primitive object={mesh} /> : null;
}
