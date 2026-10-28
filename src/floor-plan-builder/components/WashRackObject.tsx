import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, InstancedMesh, Mesh } from 'three';
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  RGBAFormat,
  RepeatWrapping,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  UnsignedByteType,
} from 'three';

export type WashRackVariant = 'equestrian' | 'livestock' | 'vehicle-bay';
export interface WashRackRowConnections {
  left: boolean;
  right: boolean;
}

interface Props {
  variant: WashRackVariant;
  dimensions: [number, number, number];
  wetness: number;
  running: boolean;
  boomAngle: number;
  boomArc: 180 | 360;
  ghost?: boolean;
  rowConnections?: WashRackRowConnections;
}

const steel = new MeshStandardMaterial({ color: '#AEB8BE', metalness: 0.85, roughness: 0.35 });
const galvanized = new MeshStandardMaterial({ color: '#9AA6AC', metalness: 0.9, roughness: 0.2 });
const brass = new MeshStandardMaterial({ color: '#B88942', metalness: 0.82, roughness: 0.28 });
const coldWater = new MeshStandardMaterial({ color: '#3B82F6', metalness: 0.45, roughness: 0.34 });
const rubber = new MeshStandardMaterial({ color: '#1F2937', metalness: 0.05, roughness: 0.9 });
const blackRubber = new MeshStandardMaterial({ color: '#20252A', roughness: 0.9 });
const aluminum = new MeshStandardMaterial({ color: '#C0C4C8', metalness: 0.85, roughness: 0.35 });
const hoseMaterial = new MeshStandardMaterial({ color: '#14532D', roughness: 0.52 });
const dropletMaterial = new MeshPhysicalMaterial({
  color: '#91D8E9',
  roughness: 0.08,
  metalness: 0,
  transmission: 0.18,
  thickness: 0.04,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
});
const mistMaterial = new MeshPhysicalMaterial({
  color: '#D8F3FA',
  roughness: 0.18,
  metalness: 0,
  transmission: 0.7,
  transparent: true,
  opacity: 0.26,
  depthWrite: false,
  side: DoubleSide,
});
const splashMaterial = new MeshStandardMaterial({
  color: '#BCEAF6',
  roughness: 0.16,
  metalness: 0,
  transparent: true,
  opacity: 0.48,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide,
});
const slabGeometry = new BoxGeometry(1, 1, 1);
const slatGeometry = new BoxGeometry(1, 1, 1);
const postGeometry = new CylinderGeometry(0.04, 0.04, 1, 16);
const railGeometry = new CylinderGeometry(0.025, 0.025, 1, 12);
const ringGeometry = new TorusGeometry(0.055, 0.012, 8, 20);
const dropletGeometry = new CapsuleGeometry(0.014, 0.025, 3, 6);
const springHoseGeometry = new CylinderGeometry(0.012, 0.012, 1, 7);
const mistGeometry = new CylinderGeometry(0.05, 0.5, 2.35, 14, 1, true);
const splashGeometry = new RingGeometry(0.16, 0.22, 32);
const idlePuddleGeometry = new CircleGeometry(0.42, 28);
const tmpMatrix = new Matrix4();
const tmpPosition = new Vector3();
const tmpScale = new Vector3();
const tmpQuaternion = new Quaternion();
const dropUp = new Vector3(0, 1, 0);
const dropDirection = new Vector3();
const vehicleJetDirection: [number, number, number] = [-0.62, -0.75, 0.22];

function particleSeed(index: number, salt: number) {
  let value = (Math.imul(index + 1, 0x9e3779b1) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000;
}

function makeSignTexture(title: string, subtitle: string, instruction: string, caution = false) {
  const canvas = document.createElement('canvas');
  canvas.width = caution ? 768 : 1536;
  canvas.height = caution ? 768 : 384;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.fillStyle = '#101820';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#E5B74F';
  context.fillRect(0, 0, canvas.width, 18);
  if (caution) {
    context.fillStyle = '#FACC15';
    context.beginPath();
    context.moveTo(384, 42);
    context.lineTo(527, 290);
    context.lineTo(241, 290);
    context.closePath();
    context.fill();
    context.fillStyle = '#111827';
    context.beginPath();
    context.arc(384, 112, 13, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = 16;
    context.lineCap = 'round';
    context.strokeStyle = '#111827';
    context.beginPath();
    context.moveTo(379, 134);
    context.lineTo(346, 177);
    context.lineTo(385, 192);
    context.lineTo(422, 175);
    context.stroke();
    context.beginPath();
    context.moveTo(360, 161);
    context.lineTo(330, 143);
    context.moveTo(365, 183);
    context.lineTo(329, 219);
    context.moveTo(389, 191);
    context.lineTo(436, 218);
    context.stroke();
    context.fillStyle = '#FDE047';
    context.font = '700 44px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText('CAUTION - WET FLOOR', canvas.width / 2, 364);
    context.fillStyle = '#F8FAFC';
    context.font = '500 28px Arial, sans-serif';
    const words = instruction.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > 680 && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      lines.push(line);
    }
    lines
      .slice(0, 4)
      .forEach((text, index) => context.fillText(text, canvas.width / 2, 440 + index * 66));
  } else {
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#F8FAFC';
    context.font = '700 116px Arial, sans-serif';
    context.fillText(title, canvas.width / 2, 138);
    context.fillStyle = '#7DD3E8';
    context.font = '600 48px Arial, sans-serif';
    context.fillText(subtitle, canvas.width / 2, 260);
    context.fillStyle = '#34D399';
    context.beginPath();
    context.moveTo(canvas.width - 174, 94);
    context.bezierCurveTo(canvas.width - 74, 214, canvas.width - 84, 274, canvas.width - 174, 304);
    context.bezierCurveTo(canvas.width - 264, 274, canvas.width - 274, 214, canvas.width - 174, 94);
    context.fill();
    context.fillStyle = '#D1FAE5';
    context.beginPath();
    context.ellipse(canvas.width - 174, 220, 20, 60, -0.55, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = 'srgb';
  texture.anisotropy = 8;
  return texture;
}

const signTextureCache = new Map<string, CanvasTexture | null>();
function cachedSignTexture(title: string, subtitle: string, instruction: string, caution = false) {
  const key = `${title}|${subtitle}|${instruction}|${caution}`;
  let texture = signTextureCache.get(key);
  if (texture === undefined) {
    texture = makeSignTexture(title, subtitle, instruction, caution);
    signTextureCache.set(key, texture);
  }
  return texture;
}

function makeMatTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.fillStyle = '#1F2937';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 5;
  for (let i = -256; i < 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 6);
  return texture;
}

let diamondMatTexture: CanvasTexture | null | undefined;
function getDiamondMatTexture() {
  diamondMatTexture ??= makeMatTexture();
  return diamondMatTexture;
}

function wetMaterial(material: MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rackWetness = { value: material.userData.wetness ?? 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRackUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRackUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vRackUv;\nuniform float rackWetness;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
       float puddleEdge = 1.0 - smoothstep(0.18, 0.48, abs(vRackUv.x - 0.5));
       float puddleMask = puddleEdge * (1.0 - smoothstep(0.0, 0.12, abs(vRackUv.y - 0.5)));
       float rackWet = clamp(rackWetness, 0.0, 1.0);
       vec3 rackWetConcrete = vec3(0.07036, 0.09084, 0.12477);
       diffuseColor.rgb = mix(diffuseColor.rgb, rackWetConcrete, rackWet);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.028, 0.042), rackWet * puddleMask * 0.55);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
       vec3 rackPuddleNormal = vec3(sin(vRackUv.y * 62.0) * 0.016, 0.0, sin(vRackUv.x * 48.0) * 0.016);
       normal = normalize(normal + rackPuddleNormal * rackWet * puddleMask);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, rackWetness);',
      );
    material.userData.rackUniforms = shader.uniforms;
  };
  material.customProgramCacheKey = () => 'wash-rack-wet-floor-v1';
  return material;
}

const neutralMap = new DataTexture(
  new Uint8Array([255, 255, 255, 255]),
  1,
  1,
  RGBAFormat,
  UnsignedByteType,
);
neutralMap.needsUpdate = true;
const concreteNormalBytes = new Uint8Array(64 * 64 * 4);
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const index = (y * 64 + x) * 4;
    const brush = Math.sin((y % 8) * 0.78) * 7 + (((x * 31 + y * 17) % 7) - 3);
    concreteNormalBytes[index] = 128 + brush;
    concreteNormalBytes[index + 1] = 128 + (((x * 13 + y * 43) % 9) - 4);
    concreteNormalBytes[index + 2] = 255;
    concreteNormalBytes[index + 3] = 255;
  }
}
const concreteNormalTexture = new DataTexture(
  concreteNormalBytes,
  64,
  64,
  RGBAFormat,
  UnsignedByteType,
);
concreteNormalTexture.wrapS = concreteNormalTexture.wrapT = RepeatWrapping;
concreteNormalTexture.repeat.set(16, 24);
concreteNormalTexture.needsUpdate = true;
// Keep the water splash in the StandardMaterial lighting pipeline and vary only its UV alpha mask.
splashMaterial.map = neutralMap;
splashMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.splashTime = { value: splashMaterial.userData.splashTime ?? 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vSplashUv;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSplashUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vSplashUv;\nuniform float splashTime;',
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float splashGrain = sin(vSplashUv.x * 73.0 + splashTime * 4.0) * sin(vSplashUv.y * 91.0 - splashTime * 3.0);
       diffuseColor.a *= smoothstep(-0.58, 0.22, splashGrain);`,
    );
  splashMaterial.userData.splashUniforms = shader.uniforms;
};
splashMaterial.customProgramCacheKey = () => 'wash-rack-splash-uv-v1';
mistMaterial.map = neutralMap;
mistMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.mistTime = { value: mistMaterial.userData.mistTime ?? 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vMistUv;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMistUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vMistUv;\nuniform float mistTime;',
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float mistNoise = sin(vMistUv.x * 27.0 + mistTime * 1.3) * sin(vMistUv.y * 19.0 - mistTime * 0.9);
       diffuseColor.a *= smoothstep(-0.72, 0.52, mistNoise);`,
    );
  mistMaterial.userData.mistUniforms = shader.uniforms;
};
mistMaterial.customProgramCacheKey = () => 'wash-rack-mist-uv-v1';
function createWetFloorMaterial() {
  const material = wetMaterial(new MeshStandardMaterial({ color: '#9CA3AF', roughness: 0.85 }));
  material.map = neutralMap;
  material.normalMap = concreteNormalTexture;
  material.normalScale.set(0.014, 0.01);
  material.userData.wetness = 0;
  return material;
}
const slabSideMaterial = new MeshStandardMaterial({ color: '#7D858B', roughness: 0.9 });
const hiddenSlabCap = new MeshStandardMaterial({ visible: false });
const slabMaterials = [
  slabSideMaterial,
  slabSideMaterial,
  hiddenSlabCap,
  hiddenSlabCap,
  slabSideMaterial,
  slabSideMaterial,
];
const flakeBytes = new Uint8Array(64 * 64 * 4);
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 64; x++) {
    const index = (y * 64 + x) * 4;
    const grain = ((x * 73 + y * 151 + x * y * 19) % 13) - 6;
    flakeBytes[index] = 128 + grain;
    flakeBytes[index + 1] = 128 + (((grain * 5) % 11) - 5);
    flakeBytes[index + 2] = 255;
    flakeBytes[index + 3] = 255;
  }
}
const steelFlakeNormal = new DataTexture(flakeBytes, 64, 64, RGBAFormat, UnsignedByteType);
steelFlakeNormal.wrapS = steelFlakeNormal.wrapT = RepeatWrapping;
steelFlakeNormal.repeat.set(24, 24);
steelFlakeNormal.needsUpdate = true;
steel.normalMap = steelFlakeNormal;
steel.normalScale.set(0.025, 0.025);

function InstancedBars({
  positions,
  size,
  material,
}: {
  positions: readonly [number, number, number][];
  size: [number, number, number];
  material: MeshStandardMaterial;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) {
      return;
    }
    for (let index = 0; index < positions.length; index++) {
      tmpMatrix.compose(
        tmpPosition.set(...positions[index]!),
        tmpQuaternion.identity(),
        tmpScale.set(...size),
      );
      mesh.current.setMatrixAt(index, tmpMatrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [positions, size[0], size[1], size[2]]);
  return (
    <instancedMesh
      ref={mesh}
      args={[slatGeometry, material, positions.length]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  );
}

function Beam({
  start,
  end,
  radius = 0.025,
  material = steel,
}: {
  start: [number, number, number];
  end: [number, number, number];
  radius?: number;
  material?: MeshStandardMaterial;
}) {
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const delta = useMemo(() => new Vector3(ex - sx, ey - sy, ez - sz), [sx, sy, sz, ex, ey, ez]);
  const geometry = useMemo(
    () => new CylinderGeometry(radius, radius, delta.length(), 12),
    [delta, radius],
  );
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize()),
    [delta],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]}
      quaternion={quaternion}
      material={material}
      castShadow
      receiveShadow
    />
  );
}

function HoseCoil({
  position,
  radius = 0.18,
  loops = 4,
}: {
  position: [number, number, number];
  radius?: number;
  loops?: number;
}) {
  const curve = useMemo(() => {
    const points: Vector3[] = [];
    for (let i = 0; i <= loops * 12; i++) {
      const t = i / (loops * 12);
      const a = t * loops * Math.PI * 2;
      points.push(new Vector3(radius * Math.cos(a), 0.035 + t * 0.32, radius * Math.sin(a)));
    }
    return new CatmullRomCurve3(points);
  }, [radius, loops]);
  const geometry = useMemo(
    () => new TubeGeometry(curve, loops * 24, 0.018, 7, false),
    [curve, loops],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={position} material={hoseMaterial} castShadow />;
}

/** A low-cost 12-segment Verlet hose. It only advances while the water is running nearby. */
function HoseSpring({
  start,
  end,
  running,
}: {
  start: [number, number, number];
  end: [number, number, number];
  running: boolean;
}) {
  const { camera } = useThree();
  const root = useRef<Group>(null);
  const mesh = useRef<InstancedMesh>(null);
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const points = useMemo(() => {
    const from = new Vector3(sx, sy, sz);
    const to = new Vector3(ex, ey, ez);
    return Array.from({ length: 13 }, (_, index) => {
      const t = index / 12;
      return from
        .clone()
        .lerp(to, t)
        .add(new Vector3(0, -Math.sin(t * Math.PI) * 0.22, 0));
    });
  }, [sx, sy, sz, ex, ey, ez]);
  const previous = useMemo(() => points.map((point) => point.clone()), [points]);
  const restLength = useMemo(() => {
    const endToEnd = Math.hypot(ex - sx, ey - sy, ez - sz);
    return (endToEnd * 1.025) / 12;
  }, [sx, sy, sz, ex, ey, ez]);
  useLayoutEffect(() => {
    if (!mesh.current) {
      return;
    }
    for (let index = 0; index < 12; index++) {
      const direction = points[index + 1]!.clone().sub(points[index]!);
      tmpMatrix.compose(
        points[index]!.clone()
          .add(points[index + 1]!)
          .multiplyScalar(0.5),
        new Quaternion().setFromUnitVectors(dropUp, direction.clone().normalize()),
        new Vector3(1, direction.length(), 1),
      );
      mesh.current.setMatrixAt(index, tmpMatrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [points]);
  useFrame(({ clock }, delta) => {
    if (!running || !mesh.current || !root.current) {
      return;
    }
    const distance = camera.position.distanceTo(root.current.getWorldPosition(tmpPosition));
    if (distance > 15) {
      return;
    }
    const dt2 = Math.min(delta, 0.04) ** 2;
    points[0]!.set(sx, sy, sz);
    points[12]!.set(ex, ey, ez);
    for (let index = 1; index < 12; index++) {
      const point = points[index]!;
      const old = previous[index]!;
      const velocityX = (point.x - old.x) * 0.985;
      const velocityY = (point.y - old.y) * 0.985;
      const velocityZ = (point.z - old.z) * 0.985;
      old.copy(point);
      point.x += velocityX + Math.sin(clock.elapsedTime * 3 + index * 0.48) * dt2 * 1.6;
      point.y += velocityY - 9.81 * dt2 * 0.24;
      point.z += velocityZ + Math.sin(clock.elapsedTime * 2 + index * 0.34) * dt2;
    }
    for (let iteration = 0; iteration < 3; iteration++) {
      for (let index = 0; index < 12; index++) {
        const first = points[index]!;
        const second = points[index + 1]!;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const dz = second.z - first.z;
        const length = Math.hypot(dx, dy, dz) || 1;
        const correction = ((length - restLength) / length) * 0.5;
        if (index > 0) {
          first.x += dx * correction;
          first.y += dy * correction;
          first.z += dz * correction;
        }
        if (index < 11) {
          second.x -= dx * correction;
          second.y -= dy * correction;
          second.z -= dz * correction;
        }
      }
      points[0]!.set(sx, sy, sz);
      points[12]!.set(ex, ey, ez);
    }
    for (let index = 0; index < 12; index++) {
      const first = points[index]!;
      const second = points[index + 1]!;
      dropDirection.set(second.x - first.x, second.y - first.y, second.z - first.z);
      const segmentLength = dropDirection.length();
      tmpMatrix.compose(
        tmpPosition.set(
          (first.x + second.x) * 0.5,
          (first.y + second.y) * 0.5,
          (first.z + second.z) * 0.5,
        ),
        tmpQuaternion.setFromUnitVectors(dropUp, dropDirection.normalize()),
        tmpScale.set(1, segmentLength, 1),
      );
      mesh.current.setMatrixAt(index, tmpMatrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group ref={root}>
      <instancedMesh
        ref={mesh}
        args={[springHoseGeometry, hoseMaterial, 12]}
        frustumCulled={false}
        castShadow
      />
    </group>
  );
}

function DoorBoom({ angle, arc, depth }: { angle: number; arc: 180 | 360; depth: number }) {
  const pivot = useRef<Group>(null);
  useEffect(() => {
    if (pivot.current) {
      pivot.current.rotation.y = ((Math.max(0, Math.min(arc, angle)) - arc / 2) * Math.PI) / 180;
    }
  }, [angle, arc]);
  const boomStart: [number, number, number] = [0, 2.4, Math.min(0.45, depth * 0.16)];
  return (
    <group ref={pivot} position={boomStart}>
      <mesh
        position={[0, 0, 0.9]}
        rotation={[Math.PI / 2, 0, 0]}
        geometry={railGeometry}
        scale={[1, 1.8, 1]}
        material={aluminum}
        castShadow
      />
      <mesh position={[0, -0.1, 1.77]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.009, 0.18, 10]} />
        <meshStandardMaterial color="#263746" roughness={0.35} metalness={0.3} />
      </mesh>
    </group>
  );
}

function WaterEffects({
  running,
  wetness,
  depth,
  sprayPoint,
  jetDirection,
}: {
  running: boolean;
  wetness: number;
  depth: number;
  sprayPoint: [number, number, number];
  jetDirection: [number, number, number];
}) {
  const { camera } = useThree();
  const root = useRef<Group>(null);
  const particles = useRef<InstancedMesh>(null);
  const mist = useRef<Mesh>(null);
  const splash = useRef<Mesh>(null);
  const idleDrip = useRef<Mesh>(null);
  const near = useRef(false);
  const medium = useRef(false);
  const jetAxis = useMemo(() => new Vector3(...jetDirection).normalize(), [jetDirection]);
  const jetSide = useMemo(() => new Vector3(-jetAxis.z, 0, jetAxis.x).normalize(), [jetAxis]);
  const directionalJet = Math.abs(jetDirection[1]) < 0.95;
  const seed = useMemo(
    () =>
      Array.from({ length: 800 }, (_, i) => ({
        phase: particleSeed(i, 0x243f6a88),
        x: (particleSeed(i, 0x85a308d3) - 0.5) * 0.5,
        z: particleSeed(i, 0x13198a2e) * 1.5,
        size: 0.7 + particleSeed(i, 0x03707344) * 0.8,
      })),
    [],
  );
  useFrame(({ clock }) => {
    const distance = root.current
      ? camera.position.distanceTo(root.current.getWorldPosition(tmpPosition))
      : camera.position.length();
    near.current = running && distance < 15;
    medium.current = running && distance >= 15 && distance <= 40;
    const time = clock.elapsedTime;
    splashMaterial.userData.splashTime = time;
    const splashUniforms = splashMaterial.userData.splashUniforms as
      | { splashTime?: { value: number } }
      | undefined;
    if (splashUniforms?.splashTime) {
      splashUniforms.splashTime.value = time;
    }
    mistMaterial.userData.mistTime = time;
    const mistUniforms = mistMaterial.userData.mistUniforms as
      | { mistTime?: { value: number } }
      | undefined;
    if (mistUniforms?.mistTime) {
      mistUniforms.mistTime.value = time;
    }
    if (particles.current) {
      particles.current.visible = near.current;
      if (near.current) {
        for (let i = 0; i < seed.length; i++) {
          const particle = seed[i]!;
          const travel = directionalJet
            ? (time * 2.5 + particle.phase * 2.25) % 2.25
            : (time * 1.65 + particle.phase * 2.2) % 2.2;
          const side = particle.x * (directionalJet ? 0.44 : 1);
          const verticalSpread = (particle.z - 0.75) * (directionalJet ? 0.24 : 0);
          tmpPosition.set(
            sprayPoint[0] +
              (directionalJet ? jetAxis.x * travel + jetSide.x * side : particle.x) +
              Math.sin(time * 2 + particle.phase * 15) * 0.025,
            sprayPoint[1] + (directionalJet ? jetAxis.y * travel : -travel) + verticalSpread,
            sprayPoint[2] +
              (directionalJet
                ? jetAxis.z * travel + jetSide.z * side + (particle.z - 0.75) * 0.22
                : particle.z * 0.32),
          );
          if (directionalJet) {
            dropDirection.copy(jetAxis);
          } else {
            dropDirection.set(particle.x * 0.2, -1, 0.15).normalize();
          }
          tmpQuaternion.setFromUnitVectors(dropUp, dropDirection);
          tmpScale.set(particle.size, particle.size, particle.size);
          tmpMatrix.compose(tmpPosition, tmpQuaternion, tmpScale);
          particles.current.setMatrixAt(i, tmpMatrix);
        }
        particles.current.instanceMatrix.needsUpdate = true;
      }
    }
    if (mist.current) {
      mist.current.visible = medium.current;
      mist.current.rotation.y = Math.sin(time * 0.35) * 0.16;
      (mist.current.material as MeshPhysicalMaterial).opacity = 0.18 + Math.sin(time * 2.2) * 0.055;
    }
    if (splash.current) {
      splash.current.visible = running && distance <= 40;
      if (directionalJet) {
        splash.current.position.set(
          sprayPoint[0] + jetAxis.x * 2.25,
          -0.013,
          sprayPoint[2] + jetAxis.z * 2.25,
        );
      }
      const pulse = 0.92 + ((time * 0.8) % 0.24);
      splash.current.scale.setScalar(pulse);
      (splash.current.material as MeshStandardMaterial).opacity =
        0.28 + (Math.sin(time * 3) + 1) * 0.12;
    }
    if (idleDrip.current) {
      const dripActive = !running && wetness > 0.05 && distance <= 40;
      idleDrip.current.visible = dripActive;
      if (dripActive) {
        idleDrip.current.position.y = sprayPoint[1] - 0.1 - ((time * 0.42) % 0.34);
      }
    }
  });
  return (
    <group ref={root}>
      <instancedMesh
        ref={particles}
        args={[dropletGeometry, dropletMaterial, 800]}
        frustumCulled={false}
      />
      <mesh
        ref={mist}
        geometry={mistGeometry}
        material={mistMaterial}
        position={[sprayPoint[0], sprayPoint[1] - 1.15, sprayPoint[2] + 0.45]}
        rotation={[Math.PI, 0, 0]}
        visible={false}
      />
      <mesh
        ref={splash}
        geometry={splashGeometry}
        material={splashMaterial}
        position={[
          directionalJet ? sprayPoint[0] + jetAxis.x * 2.25 : sprayPoint[0],
          -0.013,
          directionalJet ? sprayPoint[2] + jetAxis.z * 2.25 : sprayPoint[2] + 0.75,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
      <mesh
        ref={idleDrip}
        position={[sprayPoint[0], sprayPoint[1] - 0.1, sprayPoint[2]]}
        visible={false}
      >
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshPhysicalMaterial
          color="#B9E8F5"
          roughness={0.08}
          transmission={0.7}
          transparent
          opacity={0.8}
        />
      </mesh>
      <mesh
        geometry={idlePuddleGeometry}
        position={[0, -0.046, depth * 0.52]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshPhysicalMaterial
          color="#334155"
          roughness={0.08}
          metalness={0.08}
          transparent
          opacity={Math.min(0.28, wetness * 0.3)}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function WashRackObject({
  variant,
  dimensions,
  wetness,
  running,
  boomAngle,
  boomArc,
  ghost = false,
  rowConnections = { left: false, right: false },
}: Props) {
  const [width, height, depth] = dimensions;
  const wet = Math.max(0, Math.min(1, wetness));
  const signTexture = useMemo(
    () =>
      cachedSignTexture(
        'WASH RACK',
        variant === 'equestrian'
          ? 'EQUESTRIAN WASH BAY'
          : variant === 'vehicle-bay'
            ? 'EQUIPMENT WASH BAY'
            : 'LIVESTOCK WASH STALL',
        '',
      ),
    [variant],
  );
  const cautionTexture = useMemo(
    () =>
      cachedSignTexture(
        '',
        '',
        variant === 'vehicle-bay'
          ? 'KEEP CLEAR OF MOVING EQUIPMENT - CLEAN DRAIN AFTER USE'
          : 'CROSS-TIE REQUIRED - DO NOT LEAVE ANIMALS UNATTENDED - CLEAN DRAIN AFTER USE',
        true,
      ),
    [variant],
  );
  const matTexture = useMemo(getDiamondMatTexture, []);
  const floorMaterial = useMemo(createWetFloorMaterial, []);
  const floorGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(width, depth, 20, 32);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position!;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const pinch = Math.exp(-((x / 0.22) ** 2));
      positions.setY(i, -0.02 - 0.03 * pinch);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, [width, depth]);
  useEffect(
    () => () => {
      floorGeometry.dispose();
      floorMaterial.dispose();
    },
    [floorGeometry, floorMaterial],
  );
  useEffect(() => {
    floorMaterial.userData.wetness = wet;
    const uniforms = floorMaterial.userData.rackUniforms as
      | { rackWetness?: { value: number } }
      | undefined;
    if (uniforms?.rackWetness) {
      uniforms.rackWetness.value = wet;
    }
  }, [wet, floorMaterial]);
  const railX = width / 2 - 0.08;
  const vehicleSlatPositions = useMemo(
    () =>
      Array.from({ length: 35 }, (_, index): [number, number, number] => [
        -width / 2 + 0.2 + index * ((width - 0.4) / 34),
        -0.009,
        depth / 2,
      ]),
    [width, depth],
  );
  const drainSlatPositions = useMemo(
    () =>
      Array.from({ length: 29 }, (_, index): [number, number, number] => [
        -0.138 + index * 0.0098,
        -0.027,
        depth / 2,
      ]),
    [depth],
  );
  const postZ = [0.12, depth * 0.5, depth - 0.12];
  const frameHeight =
    variant === 'vehicle-bay' ? height - 0.12 : variant === 'equestrian' ? 1.72 : 1.32;
  const manifoldY = variant === 'vehicle-bay' ? 2.35 : frameHeight - 0.05;
  const railYs =
    variant === 'equestrian'
      ? [0.92, 1.28, 1.6]
      : variant === 'vehicle-bay'
        ? [0.72, 1.3, 1.9]
        : [0.55, 0.88, 1.2];
  const vehicle = variant === 'vehicle-bay';
  const equine = variant === 'equestrian';
  const looseHoseStart: [number, number, number] = [-railX + 0.2, 0.9, depth - 0.58];
  const looseHoseEnd: [number, number, number] = [
    Math.min(looseHoseStart[0] + 0.75, railX - 0.15),
    0.76,
    depth - 1.02,
  ];
  const sprayPoint: [number, number, number] = equine
    ? [0, 2.22, 2.18]
    : vehicle
      ? [railX - 0.1, 1.92, 1.12]
      : [-railX + 0.14, 1.72, 0.78];
  const canopyY = height - 0.12;
  const roofSlatPositions = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index): [number, number, number] => [
        -width / 2 + 0.12 + index * ((width - 0.24) / 19),
        canopyY + 0.015,
        depth / 2,
      ]),
    [width, depth, canopyY],
  );
  const signY = Math.min(2.5, height - 0.25);
  const signSupportY = Math.min(height - 0.03, signY + 0.24);
  const postXs = [-railX, railX];
  const hoseCurve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-width / 2 + 0.18, 0.32, depth - 0.4),
        new Vector3(-width / 2 + 0.18, 0.68, depth - 0.52),
        new Vector3(-width / 2 + 0.42, 0.62, depth - 0.6),
        new Vector3(-width / 2 + 0.42, 0.33, depth - 0.48),
        new Vector3(-width / 2 + 0.2, 0.3, depth - 0.34),
      ]),
    [width, depth],
  );
  const hoseGeometry = useMemo(() => new TubeGeometry(hoseCurve, 52, 0.023, 8, false), [hoseCurve]);
  useEffect(() => () => hoseGeometry.dispose(), [hoseGeometry]);

  return (
    <group name={`wash-rack-${variant}`} position={[0, 0, -depth / 2]}>
      <mesh
        geometry={slabGeometry}
        position={[0, -0.095, depth / 2]}
        scale={[width, 0.15, depth]}
        material={slabMaterials}
        receiveShadow
        castShadow
      />
      <mesh geometry={floorGeometry} position={[0, 0, depth / 2]} receiveShadow>
        <primitive object={floorMaterial} attach="material" />
      </mesh>
      {equine &&
        [-0.9, 0.9].flatMap((x) =>
          [1, 3.8].map((z) => (
            <mesh key={`mat:${x}:${z}`} position={[x, -0.015, z]} receiveShadow>
              <boxGeometry args={[1.2, 0.02, 1.8]} />
              <meshStandardMaterial
                color="#1F2937"
                roughness={0.9 - wet * 0.7}
                metalness={0.05}
                map={matTexture ?? undefined}
                bumpMap={matTexture ?? undefined}
                bumpScale={0.012}
              />
            </mesh>
          )),
        )}
      {vehicle && (
        <group>
          <mesh position={[0, -0.046, depth / 2]} receiveShadow>
            <boxGeometry args={[0.48, 0.006, 2.14]} />
            <primitive object={blackRubber} attach="material" />
          </mesh>
          <mesh position={[0, 0.025, depth / 2]} receiveShadow>
            <boxGeometry args={[0.3, 0.07, depth - 0.2]} />
            <meshStandardMaterial color="#6B7280" roughness={0.74} />
          </mesh>
          {[-1, 1].map((side) =>
            side === -1 && rowConnections.left ? null : (
              <mesh
                key={`curb:${side}`}
                position={[side * (width / 2 - 0.16), 0.15, depth / 2]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.3, 0.3, depth - 0.18]} />
                <meshStandardMaterial color="#737C83" roughness={0.78} />
              </mesh>
            ),
          )}
          <InstancedBars
            positions={vehicleSlatPositions}
            size={[0.018, 0.014, depth - 0.32]}
            material={galvanized}
          />
        </group>
      )}
      {!vehicle && (
        <group>
          <mesh position={[0, -0.035, depth / 2]} receiveShadow>
            <boxGeometry args={[0.3, 0.012, 2]} />
            <primitive object={galvanized} attach="material" />
          </mesh>
          <InstancedBars
            positions={drainSlatPositions}
            size={[0.004, 0.018, 2]}
            material={galvanized}
          />
          <mesh position={[0, -0.039, depth / 2]}>
            <boxGeometry args={[0.28, 0.012, 2.02]} />
            <primitive object={blackRubber} attach="material" />
          </mesh>
        </group>
      )}
      {postXs.flatMap((x, sideIndex) =>
        postZ.map((z, index) => {
          if (sideIndex === 0 && rowConnections.left) {
            return null;
          }
          return (
            <mesh
              key={`post:${sideIndex}:${index}`}
              position={[x, frameHeight / 2, z]}
              geometry={postGeometry}
              scale={[1, frameHeight, 1]}
              material={steel}
              castShadow
              receiveShadow
            />
          );
        }),
      )}
      {postXs.flatMap((x, sideIndex) =>
        railYs.flatMap((y) => {
          if (sideIndex === 0 && rowConnections.left) {
            return [];
          }
          return [
            <Beam
              key={`rail:${sideIndex}:${y}`}
              start={[x, y, 0.08]}
              end={[x, y, depth - 0.08]}
              material={equine && y === 1.6 ? rubber : steel}
            />,
          ];
        }),
      )}
      {equine && (
        <>
          {postXs.map((x) => (
            <Beam
              key={`boom-riser:${x}`}
              start={[x, frameHeight, Math.min(0.45, depth * 0.16)]}
              end={[x, 2.4, Math.min(0.45, depth * 0.16)]}
              radius={0.04}
            />
          ))}
          <Beam
            start={[-railX, 2.4, Math.min(0.45, depth * 0.16)]}
            end={[railX, 2.4, Math.min(0.45, depth * 0.16)]}
            radius={0.035}
            material={aluminum}
          />
        </>
      )}
      <group>
        <Beam
          start={[-railX, Math.min(frameHeight, railYs[railYs.length - 1]!), depth - 0.16]}
          end={[railX, Math.min(frameHeight, railYs[railYs.length - 1]!), depth - 0.16]}
        />
        <Beam
          start={[-railX, manifoldY, depth - 0.16]}
          end={[railX, manifoldY, depth - 0.16]}
          radius={0.014}
          material={brass}
        />
        <Beam
          start={[-railX, manifoldY - 0.1, depth - 0.16]}
          end={[railX, manifoldY - 0.1, depth - 0.16]}
          radius={0.014}
          material={coldWater}
        />
        <Beam
          start={[-railX, 0.12, depth - 0.14]}
          end={[railX, 0.12, depth - 0.14]}
          radius={0.02}
          material={galvanized}
        />
        {[-railX, 0, railX].map((x) => (
          <Beam
            key={`manifold-support:${x}`}
            start={[x, Math.min(frameHeight, railYs[railYs.length - 1]!), depth - 0.16]}
            end={[x, manifoldY, depth - 0.16]}
            radius={0.018}
            material={aluminum}
          />
        ))}
        {rowConnections.right && (
          <>
            <Beam
              start={[railX - 0.02, manifoldY, depth - 0.16]}
              end={[railX + 0.08, manifoldY, depth - 0.16]}
              radius={0.021}
              material={brass}
            />
            <Beam
              start={[railX - 0.02, manifoldY - 0.1, depth - 0.16]}
              end={[railX + 0.08, manifoldY - 0.1, depth - 0.16]}
              radius={0.021}
              material={coldWater}
            />
            <Beam
              start={[railX - 0.02, 0.12, depth - 0.14]}
              end={[railX + 0.08, 0.12, depth - 0.14]}
              radius={0.028}
              material={galvanized}
            />
          </>
        )}
      </group>
      {variant === 'livestock' &&
        postXs.map((x, index) =>
          index === 0 && rowConnections.left ? null : (
            <mesh
              key={`kickboard:${index}`}
              position={[x * 0.94, 0.29, depth / 2]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.035, 0.48, depth - 0.24]} />
              <meshStandardMaterial color="#68747B" roughness={0.62} metalness={0.48} />
            </mesh>
          ),
        )}
      {!vehicle &&
        postXs.map((x, side) => (
          <group
            key={`ring:${side}`}
            position={[x * 0.9, equine ? 1.6 : 1.2, depth * 0.43]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <mesh geometry={ringGeometry} material={brass} castShadow />
            {equine && (
              <group position={[0.16, -0.04, 0]}>
                <HoseCoil position={[0, 0, 0]} radius={0.07} loops={3} />
                <mesh
                  geometry={ringGeometry}
                  position={[0.08, -0.22, 0]}
                  scale={[0.55, 0.72, 0.55]}
                  material={galvanized}
                />
                <mesh position={[0.08, -0.22, 0]}>
                  <boxGeometry args={[0.13, 0.06, 0.05]} />
                  <meshStandardMaterial color="#DC2626" roughness={0.7} />
                </mesh>
              </group>
            )}
          </group>
        ))}
      {vehicle && (
        <group>
          {postXs.map((x, index) => (
            <mesh
              key={`truss:${index}`}
              position={[x, canopyY, depth / 2]}
              geometry={postGeometry}
              scale={[0.55, width - 0.2, 0.55]}
              rotation={[0, 0, Math.PI / 2]}
              material={aluminum}
              castShadow
            />
          ))}
          <mesh position={[0, canopyY - 0.015, depth / 2]}>
            <boxGeometry args={[width - 0.18, 0.025, depth - 0.18]} />
            <meshPhysicalMaterial
              color="#DCEAF0"
              roughness={0.22}
              metalness={0.08}
              transmission={0.72}
              thickness={0.025}
              transparent
              opacity={0.56}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          <InstancedBars
            positions={roofSlatPositions}
            size={[0.012, 0.027, depth - 0.2]}
            material={aluminum}
          />
          {Array.from({ length: 4 }, (_, index) => (
            <Beam
              key={`roof-truss:${index}`}
              start={[-width / 2 + 0.1, canopyY - 0.04, 0.12 + index * ((depth - 0.24) / 3)]}
              end={[width / 2 - 0.1, canopyY - 0.04, 0.12 + index * ((depth - 0.24) / 3)]}
              radius={0.028}
              material={aluminum}
            />
          ))}
        </group>
      )}
      {!vehicle &&
        postXs.map((x) => (
          <Beam
            key={`header-post-extension:${x}`}
            start={[x, frameHeight, 0.12]}
            end={[x, signSupportY, 0.12]}
            radius={0.04}
          />
        ))}
      <Beam
        start={[-railX, signSupportY, 0.12]}
        end={[railX, signSupportY, 0.12]}
        radius={0.035}
        material={aluminum}
      />
      <mesh position={[0, signY, 0.16]}>
        <boxGeometry args={[1.28, 0.38, 0.06]} />
        <meshStandardMaterial color="#101820" roughness={0.82} />
      </mesh>
      <mesh position={[0, signY, 0.11]} rotation={[0, Math.PI, 0]} castShadow>
        <planeGeometry args={[1.2, 0.3]} />
        <meshBasicMaterial map={signTexture ?? undefined} color="#FFFFFF" toneMapped={false} />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <Beam
          key={`header-hanger:${x}`}
          start={[x, signY + 0.19, 0.16]}
          end={[x, signSupportY - 0.02, 0.16]}
          radius={0.012}
          material={aluminum}
        />
      ))}
      <mesh position={[-railX + 0.25, 1.08, 0.16]}>
        <boxGeometry args={[0.56, 0.56, 0.06]} />
        <meshStandardMaterial color="#101820" roughness={0.82} />
      </mesh>
      <mesh position={[-railX + 0.25, 1.08, 0.12]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial map={cautionTexture ?? undefined} toneMapped={false} />
      </mesh>
      {[-railX + 0.06, -railX + 0.44].map((x) => (
        <Beam
          key={`caution-bracket:${x}`}
          start={[x, 0.82, 0.21]}
          end={[x, 1.34, 0.21]}
          radius={0.016}
          material={aluminum}
        />
      ))}
      <mesh position={[0.12, 0.94, depth - 0.16]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.78, 0.08]} />
        <meshStandardMaterial color="#7C6549" roughness={0.78} />
      </mesh>
      {[-0.42, -0.14, 0.14, 0.42].map((x, index) => (
        <group key={`gear:${index}`} position={[x, 0.92, depth - 0.23]}>
          <mesh position={[0, 0.11, -0.055]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.11, 8]} />
            <primitive object={brass} attach="material" />
          </mesh>
          {index === 0 && (
            <>
              <mesh position={[0, -0.02, -0.065]} castShadow>
                <boxGeometry args={[0.18, 0.15, 0.08]} />
                <meshStandardMaterial color="#EABF55" roughness={0.96} />
              </mesh>
              <mesh position={[0, 0.06, -0.068]}>
                <boxGeometry args={[0.18, 0.025, 0.084]} />
                <meshStandardMaterial color="#365344" roughness={1} />
              </mesh>
              {[-0.05, 0, 0.05].map((groove) => (
                <mesh key={`sponge-groove:${groove}`} position={[groove, 0.076, -0.069]}>
                  <boxGeometry args={[0.008, 0.008, 0.084]} />
                  <meshStandardMaterial color="#81906C" roughness={1} />
                </mesh>
              ))}
            </>
          )}
          {index === 1 && (
            <>
              <mesh position={[0, -0.02, -0.065]} castShadow>
                <boxGeometry args={[0.15, 0.13, 0.075]} />
                <meshStandardMaterial color="#DB7F43" roughness={0.95} />
              </mesh>
              <mesh position={[0, 0.05, -0.068]}>
                <boxGeometry args={[0.15, 0.012, 0.078]} />
                <meshStandardMaterial color="#F2BE78" roughness={0.92} />
              </mesh>
            </>
          )}
          {index === 2 && (
            <>
              <mesh position={[0, -0.005, -0.055]} castShadow>
                <cylinderGeometry args={[0.014, 0.018, 0.25, 10]} />
                <primitive object={blackRubber} attach="material" />
              </mesh>
              <mesh position={[0, -0.14, -0.06]} castShadow>
                <boxGeometry args={[0.18, 0.035, 0.045]} />
                <primitive object={aluminum} attach="material" />
              </mesh>
            </>
          )}
          {index === 3 && (
            <>
              <mesh position={[0, -0.04, -0.065]} scale={[1, 1.55, 0.62]} castShadow>
                <torusGeometry args={[0.075, 0.012, 8, 24]} />
                <primitive object={hoseMaterial} attach="material" />
              </mesh>
              <mesh position={[0, -0.105, -0.07]}>
                <boxGeometry args={[0.13, 0.025, 0.035]} />
                <primitive object={brass} attach="material" />
              </mesh>
              <mesh position={[0.09, -0.11, -0.07]}>
                <torusGeometry args={[0.038, 0.01, 6, 16]} />
                <primitive object={hoseMaterial} attach="material" />
              </mesh>
            </>
          )}
        </group>
      ))}
      <group position={[width / 2 - 0.18, 0.43, depth - 0.38]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.16, 0.19, 0.42, 20, 1, true]} />
          <meshStandardMaterial
            color="#64717A"
            metalness={0.55}
            roughness={0.42}
            side={DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0.19, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.16, 0.012, 8, 24]} />
          <primitive object={aluminum} attach="material" />
        </mesh>
        <mesh position={[0, 0.18, 0]}>
          <cylinderGeometry args={[0.145, 0.145, 0.012, 24]} />
          <meshPhysicalMaterial
            color="#7DD3FC"
            roughness={0.12}
            transmission={0.5}
            transparent
            opacity={0.82}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <torusGeometry args={[0.17, 0.009, 6, 24, Math.PI]} />
          <primitive object={aluminum} attach="material" />
        </mesh>
      </group>
      <mesh geometry={hoseGeometry} material={hoseMaterial} castShadow />
      <group position={[-width / 2 + 0.2, 0.94, depth - 0.65]}>
        <mesh>
          <cylinderGeometry args={[0.19, 0.19, 0.05, 24]} />
          <primitive object={galvanized} attach="material" />
        </mesh>
        <mesh position={[0, 0.035, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.015, 24]} />
          <meshStandardMaterial color="#14532D" roughness={0.45} />
        </mesh>
        <mesh position={[0.23, 0.22, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <primitive object={brass} attach="material" />
        </mesh>
        <mesh position={[0.2, 0.36, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.1, 12]} />
          <primitive object={brass} attach="material" />
        </mesh>
        <mesh position={[0.2, 0.47, 0]}>
          <cylinderGeometry args={[0.052, 0.052, 0.018, 20]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.25} />
        </mesh>
        <mesh position={[-0.18, 0.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.08, 12]} />
          <primitive object={brass} attach="material" />
        </mesh>
        <mesh position={[-0.18, 0.28, 0]}>
          <boxGeometry args={[0.16, 0.025, 0.025]} />
          <meshStandardMaterial color="#DC2626" roughness={0.6} />
        </mesh>
        <mesh position={[0.05, 0.16, 0]}>
          <boxGeometry args={[0.16, 0.025, 0.025]} />
          <meshStandardMaterial color="#2563EB" roughness={0.6} />
        </mesh>
      </group>
      {equine ? (
        <DoorBoom angle={boomAngle} arc={boomArc} depth={depth} />
      ) : vehicle ? (
        <group position={[railX - 0.1, 1.2, 0.3]}>
          <Beam start={[0, 0, 0]} end={[0, 0.8, 0.8]} material={aluminum} />
          <mesh position={[0, 0.3, 0.35]}>
            <cylinderGeometry args={[0.035, 0.025, 0.4, 10]} />
            <primitive object={blackRubber} attach="material" />
          </mesh>
          <mesh position={[0, 0.72, 0.82]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.018, 0.16, 10]} />
            <primitive object={brass} attach="material" />
          </mesh>
        </group>
      ) : (
        <>
          <Beam
            start={[-railX, 1.22, depth - 0.8]}
            end={[-railX, 2.08, depth - 0.8]}
            radius={0.035}
            material={aluminum}
          />
          <Beam
            start={[-railX, 1.82, depth - 0.8]}
            end={[-railX + 0.12, 1.82, depth - 0.8]}
            radius={0.028}
            material={aluminum}
          />
          <group position={[-railX + 0.12, 1.8, depth - 0.8]}>
            <mesh>
              <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
              <primitive object={galvanized} attach="material" />
            </mesh>
            <HoseCoil position={[0, 0.05, 0]} radius={0.15} loops={5} />
            <mesh position={[0.2, -0.2, 0]}>
              <cylinderGeometry args={[0.025, 0.018, 0.24, 10]} />
              <primitive object={blackRubber} attach="material" />
            </mesh>
          </group>
        </>
      )}
      <HoseSpring start={looseHoseStart} end={looseHoseEnd} running={running && !ghost} />
      <WaterEffects
        running={running && !ghost}
        wetness={wet}
        depth={depth}
        sprayPoint={sprayPoint}
        jetDirection={vehicle ? vehicleJetDirection : [0, -1, 0]}
      />
    </group>
  );
}
