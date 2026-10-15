import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { CatmullRomCurve3 } from 'three';

interface WindShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
}
import { materials } from './materials.ts';
import {
  TENT_POLE_RADIUS,
  guyAnchorPositions,
  marqueeScallop,
  catenarySag,
} from './procedural-primitives.ts';
import { tentEaves } from '../model/tent.ts';
import type { PlanObject } from '../model/types.ts';

function useTentSign(company: string, boothNumber: string) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#F8F9FA';
    context.fillRect(0, 0, 1024, 96);
    context.fillStyle = '#1E2022';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const title = (company || boothNumber || 'EVENT TENT').toUpperCase().slice(0, 48);
    context.font = '700 52px Arial, sans-serif';
    context.fillText(title, 512, 50, 980);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [company, boothNumber]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function barnRoof(width: number, depth: number, eaves: number, ridge: number): BufferGeometry {
  const nx = Math.max(4, Math.round(width));
  const nz = Math.max(4, Math.round(depth));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let side = 0; side < 2; side++) {
    const base = positions.length / 3;
    const sign = side === 0 ? -1 : 1;
    for (let iz = 0; iz <= nz; iz++) {
      const v = iz / nz;
      const z = -depth / 2 + v * depth;
      for (let ix = 0; ix <= nx; ix++) {
        const u = ix / nx;
        const x = sign * (width / 2 - u * (width / 2));
        const y = eaves + (ridge - eaves) * u + catenarySag(v, 0.05) * (1 - u * 0.4);
        positions.push(x, y, z);
        uvs.push(u, v);
      }
    }
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const a = base + iz * (nx + 1) + ix;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        if (side === 0) {
          indices.push(a, c, b, b, c, d);
        } else {
          indices.push(a, b, c, b, d, c);
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function pyramidRoof(width: number, depth: number, eaves: number, ridge: number): BufferGeometry {
  const geometry = new ConeGeometry(1, 1, 4, 4);
  geometry.rotateY(Math.PI / 4);
  const position = geometry.attributes.position!;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const x = v.x * ((width / 2) * Math.SQRT2);
    const z = v.z * ((depth / 2) * Math.SQRT2);
    let y = v.y < 0 ? eaves : ridge;
    if (v.y <= 0) {
      const u = Math.abs(v.x) + Math.abs(v.z);
      y += catenarySag(Math.min(1, Math.max(0, u)), 0.05);
    }
    position.setXYZ(i, x, y === ridge && v.y > 0 ? ridge : y, z);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function marqueeRoof(width: number, depth: number, eaves: number, ridge: number): BufferGeometry {
  const geometry = new ConeGeometry(1, 1, 24, 6, true);
  const position = geometry.attributes.position!;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const angle = Math.atan2(v.z, v.x);
    const u = (angle + Math.PI) / (2 * Math.PI);
    const t = v.y + 0.5;
    const rx = (width / 2) * (1 - t);
    const rz = (depth / 2) * (1 - t);
    const y = eaves + (ridge - eaves) * t + (t < 0.15 ? marqueeScallop(u) : 0);
    position.setXYZ(
      i,
      Math.cos(angle) * rx * Math.SQRT2 * 0.72,
      y,
      Math.sin(angle) * rz * Math.SQRT2 * 0.72,
    );
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function ropeGeometry(from: [number, number, number], to: [number, number, number]): TubeGeometry {
  const curve = new CatmullRomCurve3([
    new Vector3(...from),
    new Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 0.06, (from[2] + to[2]) / 2),
    new Vector3(...to),
  ]);
  return new TubeGeometry(curve, 8, 0.005, 6, false);
}

export function TentObject({
  object,
  color,
  ghost = false,
  topDown = false,
  windSway = true,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
  topDown?: boolean;
  windSway?: boolean;
}) {
  const [w, h, d] = object.dimensions;
  const eaves = tentEaves(object);
  const sidewall = object.tentSidewall;
  const variant = object.tentStyle;
  const indoors = object.tentIndoors;
  const root = useRef<Group>(null);
  const [near, setNear] = useState(true);
  const world = useMemo(() => new Vector3(), []);
  const time = useMemo(() => ({ value: 0 }), []);
  const shaderRef = useRef<WindShader | null>(null);

  useFrame(({ camera }, delta) => {
    if (root.current) {
      root.current.getWorldPosition(world);
      const distance = camera.position.distanceTo(world);
      const size = Math.max(w, h, d);
      if (near && distance / size > 9) {
        setNear(false);
      } else if (!near && distance / size < 7) {
        setNear(true);
      }
    }
    if (windSway && !ghost && shaderRef.current) {
      time.value += Math.min(delta, 0.05);
      shaderRef.current.uniforms.uTime!.value = time.value;
    }
  });

  const poles = useMemo(() => {
    if (object.polePositions.length) {
      return object.polePositions;
    }
    const corners: [number, number][] = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ];
    if (d <= 2.5) {
      return corners;
    }
    const segments = Math.floor(d / 2.5);
    const mids: [number, number][] = [];
    for (let i = 1; i <= segments; i++) {
      const z = -d / 2 + (i * d) / (segments + 1);
      mids.push([-w / 2, z], [w / 2, z]);
    }
    return [...corners, ...mids];
  }, [object.polePositions, w, d]);

  const anchors = useMemo(() => guyAnchorPositions(w, d), [w, d]);

  const roof = useMemo(() => {
    if (variant === 'barn') {
      return barnRoof(w, d, eaves, h);
    }
    if (variant === 'gazebo') {
      return pyramidRoof(w, d, eaves, h);
    }
    return marqueeRoof(w, d, eaves, h);
  }, [variant, w, d, eaves, h]);
  useEffect(() => () => roof.dispose(), [roof]);

  const ropes = useMemo(() => {
    if (indoors) {
      return [];
    }
    const corners: [number, number][] = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ];
    return corners.map(([x, z], i) => {
      const [ax, az] = anchors[i]!;
      return ropeGeometry([x, eaves, z], [ax!, 0, az!]);
    });
  }, [indoors, w, d, eaves, anchors]);
  useEffect(() => () => ropes.forEach((geometry) => geometry.dispose()), [ropes]);

  const patchWind = useMemo(
    () =>
      windSway && !ghost
        ? {
            onBeforeCompile: (shader: WindShader) => {
              shader.uniforms.uTime = time as unknown as { value: number };
              shader.vertexShader = `uniform float uTime;\n${shader.vertexShader.replace(
                '#include <begin_vertex>',
                '#include <begin_vertex>\ntransformed.y += sin(position.x * 3.0 + uTime * 6.0) * sin(position.z * 3.0 + uTime * 5.0) * 0.015;',
              )}`;
              shaderRef.current = shader;
            },
            customProgramCacheKey: () => 'tent-wind',
          }
        : {},
    [windSway, ghost, time],
  );

  const sign = useTentSign(object.company, object.boothNumber);
  const roofOpacity = ghost ? 0.45 : topDown ? 0.15 : 0.65;
  const canvasColor = color.startsWith('#') ? color : materials.roofCanvas.color;

  const wallHeight = sidewall === 'open' ? 0 : sidewall === 'half' ? 1.1 : eaves;
  const wallGlass = sidewall === 'windows';

  const ridgeLine: [number, number, number][] =
    variant === 'barn'
      ? [
          [0, h + 0.02, -d / 2],
          [0, h + 0.02, d / 2],
        ]
      : [];

  if (!near) {
    return (
      <group ref={root} name="BarnTentFar">
        <mesh position={[0, eaves / 2, 0]} castShadow>
          <boxGeometry args={[w, eaves, d]} />
          <meshStandardMaterial
            color={canvasColor}
            roughness={0.85}
            transparent={roofOpacity < 1}
            opacity={roofOpacity}
          />
        </mesh>
        <mesh
          position={[0, (eaves + h) / 2, 0]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[w / Math.SQRT2, h - eaves, d / Math.SQRT2]}
        >
          <coneGeometry args={[1, 1, 4]} />
          <meshStandardMaterial
            color={canvasColor}
            roughness={0.85}
            transparent={roofOpacity < 1}
            opacity={roofOpacity}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={root} name="BarnTent">
      <Instances positions={poles.map(([x, z]): [number, number, number] => [x, 0.01, z])}>
        <boxGeometry args={[0.3, 0.02, 0.3]} />
        <meshStandardMaterial
          {...materials.anchorSteel}
          transparent={ghost}
          opacity={ghost ? 0.45 : 1}
        />
      </Instances>
      <Instances positions={poles.map(([x, z]): [number, number, number] => [x, eaves / 2, z])}>
        <cylinderGeometry args={[TENT_POLE_RADIUS, TENT_POLE_RADIUS, eaves, 12]} />
        <meshStandardMaterial
          {...materials.aluminum}
          transparent={ghost}
          opacity={ghost ? 0.45 : 1}
        />
      </Instances>
      {variant === 'barn' && (
        <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, d, 10]} />
          <meshStandardMaterial
            {...materials.aluminum}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      )}
      {variant === 'gazebo' && (
        <mesh position={[0, (eaves + h) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, h - eaves, 10]} />
          <meshStandardMaterial
            {...materials.aluminum}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      )}
      {variant === 'marquee' && (
        <mesh position={[0, h / 2, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, h, 12]} />
          <meshStandardMaterial
            {...materials.aluminum}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      )}
      <mesh geometry={roof} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={canvasColor}
          roughness={materials.roofCanvas.roughness}
          metalness={0}
          transmission={ghost ? 0 : 0.35}
          thickness={0.01}
          ior={1.49}
          transparent
          opacity={roofOpacity}
          depthWrite={!topDown && !ghost}
          side={DoubleSide}
          {...patchWind}
        />
      </mesh>
      {[
        { size: [w, 0.25, 0.02] as const, at: [0, eaves - 0.125, d / 2] as const },
        { size: [w, 0.25, 0.02] as const, at: [0, eaves - 0.125, -d / 2] as const },
        { size: [0.02, 0.25, d] as const, at: [w / 2, eaves - 0.125, 0] as const },
        { size: [0.02, 0.25, d] as const, at: [-w / 2, eaves - 0.125, 0] as const },
      ].map((item, index) => (
        <mesh key={index} position={[...item.at]} castShadow>
          <boxGeometry args={[...item.size]} />
          <meshStandardMaterial
            color={canvasColor}
            roughness={0.6}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
            side={DoubleSide}
          />
        </mesh>
      ))}
      {wallHeight > 0 && (
        <>
          {[
            { size: [w, wallHeight, 0.01] as const, at: [0, wallHeight / 2, d / 2] as const },
            { size: [w, wallHeight, 0.01] as const, at: [0, wallHeight / 2, -d / 2] as const },
            { size: [0.01, wallHeight, d] as const, at: [w / 2, wallHeight / 2, 0] as const },
            { size: [0.01, wallHeight, d] as const, at: [-w / 2, wallHeight / 2, 0] as const },
          ].map((item, index) => (
            <mesh key={index} position={[...item.at]} castShadow receiveShadow>
              <boxGeometry args={[...item.size]} />
              {wallGlass ? (
                <meshPhysicalMaterial
                  color="#F8F9FA"
                  roughness={0.1}
                  transmission={0.85}
                  thickness={0.01}
                  ior={1.49}
                  transparent
                  opacity={ghost ? 0.45 : 0.55}
                  depthWrite={false}
                  side={DoubleSide}
                />
              ) : (
                <meshStandardMaterial
                  color={canvasColor}
                  roughness={0.6}
                  transparent={ghost}
                  opacity={ghost ? 0.45 : 1}
                  side={DoubleSide}
                />
              )}
            </mesh>
          ))}
        </>
      )}
      {!indoors &&
        ropes.map((geometry, index) => (
          <mesh key={index} geometry={geometry}>
            <meshStandardMaterial
              {...materials.anchorSteel}
              transparent={ghost}
              opacity={ghost ? 0.45 : 1}
            />
          </mesh>
        ))}
      {!indoors &&
        anchors.map(([x, z], index) => (
          <mesh key={`stake-${index}`} position={[x!, 0.125, z!]}>
            <cylinderGeometry args={[0.02, 0.015, 0.25, 8]} />
            <meshStandardMaterial
              {...materials.anchorSteel}
              transparent={ghost}
              opacity={ghost ? 0.45 : 1}
            />
          </mesh>
        ))}
      {object.tentFlooring === 'grass' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            color="#5d8a5f"
            roughness={0.95}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      )}
      {object.tentFlooring === 'wood-deck' && (
        <mesh position={[0, 0.025, 0]} receiveShadow>
          <boxGeometry args={[w, 0.05, d]} />
          <meshStandardMaterial
            {...materials.woodDeck}
            transparent={ghost}
            opacity={ghost ? 0.45 : 1}
          />
        </mesh>
      )}
      {!ghost && sign && (
        <mesh name="ValanceBanner" position={[0, eaves - 0.125, d / 2 + 0.012]}>
          <planeGeometry args={[Math.max(0.5, w - 0.2), 0.2]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      )}
      {topDown && (
        <>
          {ridgeLine.length > 0 && (
            <Line points={ridgeLine} color="#06B6D4" lineWidth={1.5} dashed />
          )}
          {anchors.map(([x, z], index) => (
            <mesh key={`anchor-${index}`} position={[x!, 0.05, z!]}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color="#EAB308" toneMapped={false} />
            </mesh>
          ))}
          {poles.map(([x, z], index) => (
            <mesh key={`dot-${index}`} position={[x!, 0.05, z!]}>
              <sphereGeometry args={[0.05, 8, 8]} />
              <meshBasicMaterial color="#1E2022" toneMapped={false} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

import { useLayoutEffect } from 'react';
import { Object3D } from 'three';

function Instances({
  positions,
  children,
  shadow = true,
}: {
  positions: [number, number, number][];
  children: React.ReactNode;
  shadow?: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    positions.forEach((point, index) => {
      dummy.position.set(...point);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions]);
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, Math.max(1, positions.length)]}
      castShadow={shadow}
      receiveShadow
    >
      {children}
    </instancedMesh>
  );
}
