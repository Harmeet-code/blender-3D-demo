import { Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InstancedMesh } from 'three';
import {
  CatmullRomCurve3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diningLayout, type DiningLayout, type DiningTablePlacement } from '../model/dining.ts';
import type { PlanObject } from '../model/types.ts';
import { createDiningChairBatch, type ChairLod } from './ProceduralChair.tsx';

type Part = { geometry: BufferGeometry; color: string; matrix?: Matrix4 };
type Point3 = [number, number, number];

const colors = {
  oak: '#8D6846',
  oakLight: '#B99062',
  darkOak: '#5C4736',
  linen: '#E6DED0',
  porcelain: '#F7F3E9',
  steel: '#7F8B8D',
  silver: '#C2C9C8',
  glass: '#9CCBC0',
  foliage: '#526D4D',
  foliageLight: '#8BA36B',
  soil: '#4B3A2C',
  brass: '#AF8B52',
  stone: '#6A7477',
};

function transform(center: Point3, yaw = 0, scale: Point3 = [1, 1, 1]) {
  return new Matrix4().compose(
    new Vector3(...center),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
    new Vector3(...scale),
  );
}

function pushBox(parts: Part[], size: Point3, center: Point3, color: string, yaw = 0) {
  parts.push({ geometry: new BoxGeometry(...size), color, matrix: transform(center, yaw) });
}

function pushCylinder(
  parts: Part[],
  radiusTop: number,
  radiusBottom: number,
  height: number,
  center: Point3,
  color: string,
  segments = 12,
  yaw = 0,
) {
  parts.push({
    geometry: new CylinderGeometry(radiusTop, radiusBottom, height, segments),
    color,
    matrix: transform(center, yaw),
  });
}

function pushRod(parts: Part[], start: Point3, end: Point3, radius: number, color: string) {
  const from = new Vector3(...start);
  const to = new Vector3(...end);
  const direction = to.clone().sub(from);
  parts.push({
    geometry: new CylinderGeometry(radius * 0.9, radius, direction.length(), 7),
    color,
    matrix: new Matrix4().compose(
      from.clone().add(to).multiplyScalar(0.5),
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()),
      new Vector3(1, 1, 1),
    ),
  });
}

function finishBatch(parts: Part[]): BufferGeometry {
  const geometries = parts.map(({ geometry, color, matrix }) => {
    if (matrix) {
      geometry.applyMatrix4(matrix);
    }
    geometry.computeVertexNormals();
    const tint = new Color(color);
    const { count } = geometry.getAttribute('position');
    const attribute = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      tint.toArray(attribute, index * 3);
    }
    geometry.setAttribute('color', new BufferAttribute(attribute, 3));
    return geometry;
  });
  if (!geometries.length) {
    return new BufferGeometry();
  }
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!merged) {
    throw new Error('Could not merge dining geometry batch.');
  }
  merged.computeBoundingSphere();
  return merged;
}

function tableGeometry(tables: readonly DiningTablePlacement[]) {
  const parts: Part[] = [];
  for (const table of tables) {
    const [x, z] = table.center;
    const y = table.height;
    const round = table.topShape === 'round';
    const draped = table.tablecloth;
    if (round) {
      pushCylinder(
        parts,
        table.width / 2,
        table.width / 2,
        0.055,
        [x, y - 0.0275, z],
        colors.oakLight,
        24,
        table.yawRadians,
      );
      pushCylinder(parts, 0.1, 0.13, y - 0.1, [x, (y - 0.055) / 2, z], colors.darkOak, 12);
      pushCylinder(parts, 0.34, 0.36, 0.065, [x, 0.0325, z], colors.oak, 20);
      continue;
    }
    if (draped) {
      const clothTop = y - 0.045;
      const skirt = 0.25;
      pushBox(
        parts,
        [table.width + 0.08, 0.025, table.depth + 0.08],
        [x, y - 0.012, z],
        colors.linen,
        table.yawRadians,
      );
      // Four continuous linen panels hang a real 25cm below the tabletop.
      pushBox(
        parts,
        [table.width + 0.08, skirt, 0.012],
        [x, clothTop - skirt / 2, z - table.depth / 2 - 0.035],
        colors.linen,
        table.yawRadians,
      );
      pushBox(
        parts,
        [table.width + 0.08, skirt, 0.012],
        [x, clothTop - skirt / 2, z + table.depth / 2 + 0.035],
        colors.linen,
        table.yawRadians,
      );
      pushBox(
        parts,
        [0.012, skirt, table.depth],
        [x - table.width / 2 - 0.035, clothTop - skirt / 2, z],
        colors.linen,
        table.yawRadians,
      );
      pushBox(
        parts,
        [0.012, skirt, table.depth],
        [x + table.width / 2 + 0.035, clothTop - skirt / 2, z],
        colors.linen,
        table.yawRadians,
      );
    } else {
      pushBox(
        parts,
        [table.width, 0.055, table.depth],
        [x, y - 0.0275, z],
        colors.oakLight,
        table.yawRadians,
      );
    }
    const legInsetX = table.width / 2 - 0.11;
    const legInsetZ = table.depth / 2 - 0.1;
    for (const lx of [-legInsetX, legInsetX]) {
      for (const lz of [-legInsetZ, legInsetZ]) {
        pushBox(parts, [0.065, y - 0.06, 0.065], [x + lx, (y - 0.055) / 2, z + lz], colors.oak);
      }
    }
  }
  return finishBatch(parts);
}

function settingsGeometry(tables: readonly DiningTablePlacement[]) {
  const parts: Part[] = [];
  for (const table of tables) {
    const top = table.height + 0.006;
    // Shared salt and pepper pair sits within easy reach of each setting cluster.
    const condimentY = top + 0.075;
    pushCylinder(
      parts,
      0.022,
      0.025,
      0.13,
      [table.center[0] - 0.11, condimentY, table.center[1]],
      '#F3EEE1',
      8,
    );
    pushCylinder(
      parts,
      0.022,
      0.025,
      0.13,
      [table.center[0] + 0.11, condimentY, table.center[1]],
      '#766755',
      8,
    );
    pushCylinder(
      parts,
      0.026,
      0.026,
      0.012,
      [table.center[0] - 0.11, top + 0.145, table.center[1]],
      colors.silver,
      8,
    );
    pushCylinder(
      parts,
      0.026,
      0.026,
      0.012,
      [table.center[0] + 0.11, top + 0.145, table.center[1]],
      colors.silver,
      8,
    );
    for (const chair of table.chairs) {
      const [cx, cz] = chair.center;
      const yaw = chair.yawRadians;
      const towardTable = yaw;
      const plateX = cx + Math.sin(towardTable) * 0.58;
      const plateZ = cz + Math.cos(towardTable) * 0.58;
      pushCylinder(parts, 0.12, 0.12, 0.012, [plateX, top, plateZ], colors.porcelain, 20);
      pushCylinder(parts, 0.094, 0.094, 0.006, [plateX, top + 0.009, plateZ], '#DED8CB', 20);
      // Fork/knife/spoon are narrow, separate metal forms lying beside each plate.
      const sideX = Math.cos(yaw);
      const sideZ = -Math.sin(yaw);
      const forkX = plateX - sideX * 0.175;
      const forkZ = plateZ - sideZ * 0.175;
      const knifeX = plateX + sideX * 0.175;
      const knifeZ = plateZ + sideZ * 0.175;
      pushBox(parts, [0.014, 0.008, 0.19], [forkX, top + 0.012, forkZ], colors.silver, yaw);
      pushBox(parts, [0.026, 0.009, 0.07], [forkX, top + 0.014, forkZ - 0.064], colors.silver, yaw);
      for (let tine = 0; tine < 3; tine++) {
        pushBox(
          parts,
          [0.004, 0.007, 0.04],
          [forkX + (tine - 1) * 0.008, top + 0.016, forkZ - 0.104],
          colors.silver,
          yaw,
        );
      }
      pushBox(parts, [0.019, 0.01, 0.2], [knifeX, top + 0.013, knifeZ], colors.silver, yaw);
      pushBox(
        parts,
        [0.05, 0.01, 0.085],
        [plateX + sideX * 0.28, top + 0.012, plateZ + sideZ * 0.28],
        colors.linen,
        yaw,
      );
      // A thin-walled tumbler and foot, slightly offset from the place setting.
      const glassX = plateX + sideX * 0.28;
      const glassZ = plateZ + sideZ * 0.28;
      pushCylinder(
        parts,
        0.038,
        0.045,
        0.13,
        [glassX + sideZ * 0.13, top + 0.065, glassZ - sideX * 0.13],
        colors.glass,
        10,
      );
      pushCylinder(
        parts,
        0.044,
        0.044,
        0.008,
        [glassX + sideZ * 0.13, top + 0.006, glassZ - sideX * 0.13],
        '#D9E8E2',
        10,
      );
    }
  }
  return finishBatch(parts);
}

function avatarGeometry(
  tables: readonly DiningTablePlacement[],
  avatars: DiningLayout['seatedAvatars'],
) {
  const parts: Part[] = [];
  const skinTones = ['#C48D69', '#A86E4B', '#E0AC82'];
  const clothing = ['#4D6B79', '#7A4F54', '#536D54', '#B1784E'];
  const chairTables = new Map(
    tables.flatMap((table) => table.chairs.map((chair) => [chair.id, { chair, table }] as const)),
  );
  for (let index = 0; index < avatars.length; index += 1) {
    const avatar = avatars[index]!;
    const seating = chairTables.get(avatar.chairId);
    if (!seating) {
      continue;
    }
    const { table } = seating;
    const [x, z] = avatar.position;
    const yaw = avatar.yawRadians;
    const seatY = avatar.seatHeight;
    const body = clothing[index % clothing.length]!;
    const skin = skinTones[index % skinTones.length]!;
    // The hips are anchored at the manifest seat height; legs tuck toward +Z/table.
    pushCylinder(parts, 0.13, 0.15, 0.2, [x, seatY + 0.1, z], body, 8, yaw);
    pushCylinder(parts, 0.11, 0.13, 0.32, [x, seatY + 0.34, z], body, 8, yaw);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    pushSphere(parts, 0.09, [x, seatY + 0.61, z], skin, 10, 6);
    for (const side of [-1, 1]) {
      const shoulder: Point3 = [x + rightX * side * 0.11, seatY + 0.48, z + rightZ * side * 0.11];
      const elbow: Point3 = [
        x + rightX * side * 0.16 + forwardX * 0.19,
        table.height - 0.015,
        z + rightZ * side * 0.16 + forwardZ * 0.19,
      ];
      const hand: Point3 = [
        x + rightX * side * 0.11 + forwardX * 0.42,
        table.height - 0.015,
        z + rightZ * side * 0.11 + forwardZ * 0.42,
      ];
      pushRod(parts, shoulder, elbow, 0.035, body);
      pushRod(parts, elbow, hand, 0.027, skin);
      const knee: Point3 = [
        x + forwardX * 0.27 + rightX * side * 0.075,
        seatY - 0.14,
        z + forwardZ * 0.27 + rightZ * side * 0.075,
      ];
      const ankle: Point3 = [
        x + forwardX * 0.37 + rightX * side * 0.075,
        0.08,
        z + forwardZ * 0.37 + rightZ * side * 0.075,
      ];
      pushRod(
        parts,
        [x + rightX * side * 0.07, seatY + 0.02, z + rightZ * side * 0.07],
        knee,
        0.052,
        body,
      );
      pushRod(parts, knee, ankle, 0.04, '#343638');
    }
  }
  return finishBatch(parts);
}

function pushSphere(
  parts: Part[],
  radius: number,
  center: Point3,
  color: string,
  widthSegments = 8,
  heightSegments = 6,
) {
  parts.push({
    geometry: new SphereGeometry(radius, widthSegments, heightSegments),
    color,
    matrix: transform(center),
  });
}

function umbrellaGeometry(lod: ChairLod) {
  const parts: Part[] = [];
  if (lod === 'far') {
    // Far view uses a camera-facing octagonal canopy and mast billboard in one instance draw.
    pushBox(parts, [0.035, 2.15, 0.018], [0, 1.075, 0], colors.steel);
    const canopy = new CylinderGeometry(0.92, 0.92, 0.08, 8, 1, false);
    const matrix = transform([0, 2.22, 0]);
    matrix.multiply(new Matrix4().makeRotationX(Math.PI / 2));
    parts.push({ geometry: canopy, color: '#D7C5A5', matrix });
    return finishBatch(parts);
  }
  // The canopy is an octagon with a subtle peak, supported by a full-height steel mast.
  pushCylinder(parts, 0.032, 0.04, 2.15, [0, 1.075, 0], colors.steel, 8);
  pushCylinder(parts, 0.09, 0.1, 0.07, [0, 0.035, 0], colors.stone, 8);
  const canopy = new CylinderGeometry(0.09, 1.25, 0.36, 8, 1, false);
  parts.push({ geometry: canopy, color: '#D7C5A5', matrix: transform([0, 2.35, 0]) });
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    pushRod(
      parts,
      [0, 2.34, 0],
      [Math.cos(angle) * 1.18, 2.18, Math.sin(angle) * 1.18],
      0.008,
      '#B8A27E',
    );
  }
  return finishBatch(parts);
}

function propGeometry(layout: DiningLayout, object: PlanObject) {
  const parts: Part[] = [];
  const ropePosts = layout.props.filter((prop) => prop.kind === 'rope-post');
  for (const prop of layout.props) {
    const [x, z] = prop.center;
    if (prop.kind === 'planter') {
      pushBox(parts, [0.72, 0.32, 0.5], [x, 0.16, z], '#7E7464');
      pushBox(parts, [0.62, 0.035, 0.4], [x, 0.33, z], colors.soil);
      for (let leaf = 0; leaf < 5; leaf++) {
        const angle = leaf * ((Math.PI * 2) / 5);
        pushSphere(
          parts,
          0.16,
          [x + Math.cos(angle) * 0.16, 0.48 + (leaf % 2) * 0.05, z + Math.sin(angle) * 0.15],
          leaf % 2 ? colors.foliage : colors.foliageLight,
          7,
          5,
        );
      }
    } else if (prop.kind === 'rope-post') {
      pushCylinder(parts, 0.026, 0.032, 0.82, [x, 0.41, z], colors.brass, 8);
      pushCylinder(parts, 0.12, 0.14, 0.045, [x, 0.022, z], colors.steel, 12);
    } else if (prop.kind === 'host') {
      pushBox(parts, [0.6, 1.1, 0.5], [x, 0.55, z], '#75563E');
      pushBox(parts, [0.57, 0.07, 0.48], [x, 1.12, z], colors.oakLight);
      pushBox(parts, [0.43, 0.24, 0.025], [x, 0.82, z + 0.263], '#344C4A');
    } else if (prop.kind === 'bus-tub') {
      // Stainless bustub and a smaller general-waste station beside it.
      pushBox(parts, [0.48, 0.5, 0.42], [x, 0.25, z], colors.steel);
      pushBox(parts, [0.5, 0.035, 0.44], [x, 0.515, z], colors.silver);
      pushBox(parts, [0.28, 0.54, 0.3], [x + 0.42, 0.27, z], '#263034');
      pushBox(parts, [0.3, 0.025, 0.32], [x + 0.42, 0.55, z], colors.steel);
    } else if (prop.kind === 'pergola-post') {
      pushBox(parts, [0.16, 2.55, 0.16], [x, 1.275, z], colors.oak);
    }
  }
  // Rope spans sag between the model's post positions; skipped entry edge stays open.
  for (let index = 0; index + 1 < ropePosts.length; index += 1) {
    const start = ropePosts[index]!.center;
    const end = ropePosts[index + 1]!.center;
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (distance > 5) {
      continue;
    }
    const rope = new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(start[0], 0.78, start[1]),
        new Vector3((start[0] + end[0]) / 2, 0.64, (start[1] + end[1]) / 2),
        new Vector3(end[0], 0.78, end[1]),
      ]),
      8,
      0.015,
      5,
      false,
    );
    parts.push({ geometry: rope, color: colors.brass });
  }
  if (object.diningBoundary === 'planter') {
    // Entry edge is omitted by the manifest; these shrubs sit only in the supplied planters.
    for (const prop of layout.props.filter((item) => item.kind === 'planter')) {
      const [x, z] = prop.center;
      pushSphere(parts, 0.18, [x, 0.49, z], colors.foliage, 8, 5);
      pushSphere(parts, 0.12, [x + 0.11, 0.55, z + 0.1], colors.foliageLight, 7, 5);
    }
  }
  return finishBatch(parts);
}

function centerpiece(table: DiningTablePlacement, index: number, ghost: boolean) {
  const [x, z] = table.center;
  if (table.centerpiece === 'none') {
    return null;
  }
  return (
    <group key={`centerpiece:${table.id}`} position={[x, table.height + 0.04, z]}>
      {table.centerpiece === 'vase-flowers' && (
        <>
          <mesh position={[0, 0.09, 0]} castShadow={!ghost}>
            <latheGeometry
              args={[
                [
                  new Vector2(0.04, 0),
                  new Vector2(0.09, 0.025),
                  new Vector2(0.11, 0.08),
                  new Vector2(0.065, 0.16),
                  new Vector2(0.04, 0.2),
                ],
                12,
              ]}
            />
            <meshStandardMaterial color="#A8B8B0" transparent={ghost} opacity={ghost ? 0.4 : 1} />
          </mesh>
          {Array.from({ length: 5 }, (_, flower) => {
            const angle = (flower * Math.PI * 2) / 5;
            return (
              <group key={flower} position={[Math.cos(angle) * 0.09, 0.27, Math.sin(angle) * 0.09]}>
                <mesh position={[0, -0.045, 0]}>
                  <cylinderGeometry args={[0.006, 0.006, 0.13, 5]} />
                  <meshStandardMaterial
                    color={colors.foliage}
                    transparent={ghost}
                    opacity={ghost ? 0.4 : 1}
                  />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.045, 8, 6]} />
                  <meshStandardMaterial
                    color={['#E4B878', '#D68C83', '#E9DDD0'][flower % 3]}
                    transparent={ghost}
                    opacity={ghost ? 0.4 : 1}
                  />
                </mesh>
              </group>
            );
          })}
        </>
      )}
      {table.centerpiece === 'candle-lantern' && (
        <group>
          <mesh>
            <cylinderGeometry args={[0.09, 0.11, 0.18, 10]} />
            <meshStandardMaterial
              color={colors.brass}
              metalness={0.55}
              roughness={0.36}
              transparent={ghost}
              opacity={ghost ? 0.4 : 1}
            />
          </mesh>
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.12, 7]} />
            <meshStandardMaterial
              color="#F3C775"
              emissive="#F3B657"
              emissiveIntensity={ghost ? 0 : 1.25}
              transparent={ghost}
              opacity={ghost ? 0.4 : 1}
            />
          </mesh>
        </group>
      )}
      {table.centerpiece === 'table-number' && (
        <group>
          <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.2, 0.14, 0.012]} />
            <meshStandardMaterial color="#F1E8D4" transparent={ghost} opacity={ghost ? 0.4 : 1} />
          </mesh>
          <Text
            position={[0, 0.09, 0.008]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.075}
            color={ghost ? '#82908B' : '#243832'}
            anchorX="center"
            anchorY="middle"
          >
            {String(index + 1).padStart(2, '0')}
          </Text>
        </group>
      )}
    </group>
  );
}

function UmbrellaInstances({
  layout,
  ghost,
  lod,
}: {
  layout: DiningLayout;
  ghost: boolean;
  lod: ChairLod;
}) {
  const umbrellas = layout.props.filter((prop) => prop.kind === 'umbrella');
  const ref = useRef<InstancedMesh>(null);
  const camera = useThree((state) => state.camera);
  const geometry = useMemo(() => umbrellaGeometry(lod), [lod]);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.74,
        metalness: 0.24,
        transparent: ghost,
        opacity: ghost ? 0.38 : 1,
        depthWrite: !ghost,
      }),
    [ghost],
  );
  const helper = useMemo(() => new Matrix4(), []);
  const q = useMemo(() => new Quaternion(), []);
  useFrame(({ clock }) => {
    if (!ref.current) {
      return;
    }
    const time = clock.elapsedTime;
    umbrellas.forEach((prop, index) => {
      const sway = Math.sin(time * Math.PI * 0.4 + index * 0.8) * ((1.5 * Math.PI) / 180);
      const billboardYaw =
        lod === 'far'
          ? Math.atan2(camera.position.x - prop.center[0], camera.position.z - prop.center[1])
          : prop.yawRadians;
      q.setFromEuler(new Euler(sway, billboardYaw, 0));
      helper.compose(new Vector3(prop.center[0], 0, prop.center[1]), q, new Vector3(1, 1, 1));
      ref.current!.setMatrixAt(index, helper);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  if (!umbrellas.length) {
    return null;
  }
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, umbrellas.length]}
      castShadow={!ghost}
      receiveShadow
    />
  );
}

function Pergola({ layout, ghost }: { layout: DiningLayout; ghost: boolean }) {
  const posts = layout.props.filter((prop) => prop.kind === 'pergola-post');
  const intensity = useRef(1);
  const [geometry, lightGeometry] = useMemo(() => {
    const wood: Part[] = [];
    const light: Part[] = [];
    if (posts.length) {
      const xs = posts.map((prop) => prop.center[0]);
      const zs = posts.map((prop) => prop.center[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minZ = Math.min(...zs);
      const maxZ = Math.max(...zs);
      pushBox(wood, [maxX - minX + 0.16, 0.16, 0.16], [(maxX + minX) / 2, 2.55, minZ], colors.oak);
      pushBox(wood, [maxX - minX + 0.16, 0.16, 0.16], [(maxX + minX) / 2, 2.55, maxZ], colors.oak);
      pushBox(wood, [0.16, 0.16, maxZ - minZ], [minX, 2.55, (maxZ + minZ) / 2], colors.oak);
      pushBox(wood, [0.16, 0.16, maxZ - minZ], [maxX, 2.55, (maxZ + minZ) / 2], colors.oak);
      // A segmented catenary light cord hangs between beam bays; the emitter color is warm 2400K.
      const bays = 4;
      for (let bay = 0; bay < bays; bay++) {
        const t = (bay + 0.5) / bays;
        const x = minX + (maxX - minX) * t;
        for (let segment = 0; segment < 9; segment++) {
          const z0 = minZ + ((maxZ - minZ) * segment) / 9;
          const z1 = minZ + ((maxZ - minZ) * (segment + 1)) / 9;
          const sag0 = 2.47 - 0.14 * (1 - Math.abs((2 * segment) / 9 - 1));
          const sag1 = 2.47 - 0.14 * (1 - Math.abs((2 * (segment + 1)) / 9 - 1));
          pushRod(light, [x, sag0, z0], [x, sag1, z1], 0.009, '#FFB45E');
        }
        for (let bulb = 0; bulb < 5; bulb++) {
          const z = minZ + ((maxZ - minZ) * (bulb + 0.5)) / 5;
          pushSphere(light, 0.028, [x, 2.34, z], '#FFB45E', 7, 5);
        }
      }
    }
    return [finishBatch(wood), finishBatch(light)];
  }, [posts]);
  const woodMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.76,
        transparent: ghost,
        opacity: ghost ? 0.38 : 1,
        depthWrite: !ghost,
      }),
    [ghost],
  );
  const glowMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        color: '#FFFFFF',
        emissive: '#FFD28A',
        emissiveIntensity: ghost ? 0 : 1,
        roughness: 0.3,
        transparent: ghost,
        opacity: ghost ? 0.38 : 1,
        depthWrite: !ghost,
      }),
    [ghost],
  );
  useFrame(({ clock }) => {
    intensity.current = 1 + Math.sin(clock.elapsedTime * 2 * Math.PI * 0.5) * 0.15;
    glowMaterial.emissiveIntensity = ghost ? 0 : intensity.current;
  });
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => lightGeometry.dispose(), [lightGeometry]);
  useEffect(() => () => woodMaterial.dispose(), [woodMaterial]);
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);
  if (!posts.length) {
    return null;
  }
  return (
    <group>
      <mesh geometry={geometry} material={woodMaterial} castShadow={!ghost} />
      <mesh geometry={lightGeometry} material={glowMaterial} />
    </group>
  );
}

export function DiningObject({
  object,
  ghost = false,
  opacity = ghost ? 0.45 : 1,
}: {
  object: PlanObject;
  ghost?: boolean;
  opacity?: number;
}) {
  const layout = useMemo(() => diningLayout(object), [object]);
  const { tables } = layout;
  const chairs = useMemo(() => tables.flatMap((table) => table.chairs), [tables]);
  const camera = useThree((state) => state.camera);
  const [lod, setLod] = useState<ChairLod>('near');
  const lodRef = useRef<ChairLod>('near');
  useFrame(() => {
    // This is intentionally lot-level LOD: all baked chairs switch together to keep one chair draw.
    const target = new Vector3(object.position[0], 0, object.position[1]);
    const distance = camera.position.distanceTo(target);
    const next: ChairLod = distance < 15 ? 'near' : distance < 40 ? 'medium' : 'far';
    if (lodRef.current !== next) {
      lodRef.current = next;
      setLod(next);
    }
  });

  const chairGeometry = useMemo(
    () =>
      createDiningChairBatch(
        chairs.map((chair) => ({
          x: chair.center[0],
          z: chair.center[1],
          yaw: chair.yawRadians,
          style: chair.style,
        })),
        lod,
      ),
    [chairs, lod],
  );
  const tablesGeometry = useMemo(() => tableGeometry(tables), [tables]);
  const settings = useMemo(
    () => (lod === 'near' ? settingsGeometry(tables) : new BufferGeometry()),
    [tables, lod],
  );
  const avatars = useMemo(
    () => avatarGeometry(tables, layout.seatedAvatars),
    [tables, layout.seatedAvatars],
  );
  const props = useMemo(() => propGeometry(layout, object), [layout, object]);
  const woodMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.68,
        metalness: 0.16,
        transparent: ghost,
        opacity,
        depthWrite: !ghost,
      }),
    [ghost, opacity],
  );
  const chairMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.67,
        metalness: 0.2,
        transparent: ghost,
        opacity,
        depthWrite: !ghost,
      }),
    [ghost, opacity],
  );
  const settingsMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.26,
        transparent: ghost,
        opacity,
        depthWrite: !ghost,
      }),
    [ghost, opacity],
  );
  const avatarMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        transparent: ghost,
        opacity,
        depthWrite: !ghost,
      }),
    [ghost, opacity],
  );
  const propMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.74,
        metalness: 0.18,
        transparent: ghost,
        opacity,
        depthWrite: !ghost,
      }),
    [ghost, opacity],
  );
  useEffect(() => () => chairGeometry.dispose(), [chairGeometry]);
  useEffect(() => () => tablesGeometry.dispose(), [tablesGeometry]);
  useEffect(() => () => settings.dispose(), [settings]);
  useEffect(() => () => avatars.dispose(), [avatars]);
  useEffect(() => () => props.dispose(), [props]);
  useEffect(() => () => woodMaterial.dispose(), [woodMaterial]);
  useEffect(() => () => chairMaterial.dispose(), [chairMaterial]);
  useEffect(() => () => settingsMaterial.dispose(), [settingsMaterial]);
  useEffect(() => () => avatarMaterial.dispose(), [avatarMaterial]);
  useEffect(() => () => propMaterial.dispose(), [propMaterial]);

  return (
    <group name="dining-renderer">
      <mesh geometry={tablesGeometry} material={woodMaterial} castShadow={!ghost} receiveShadow />
      {chairs.length > 0 && (
        <mesh geometry={chairGeometry} material={chairMaterial} castShadow={!ghost} receiveShadow />
      )}
      {lod === 'near' && tables.length > 0 && (
        <mesh geometry={settings} material={settingsMaterial} receiveShadow />
      )}
      {layout.seatedAvatars.length > 0 && (
        <mesh geometry={avatars} material={avatarMaterial} castShadow={!ghost} receiveShadow />
      )}
      {props.getAttribute('position')?.count ? (
        <mesh geometry={props} material={propMaterial} castShadow={!ghost} receiveShadow />
      ) : null}
      <UmbrellaInstances layout={layout} ghost={ghost} lod={lod} />
      <Pergola layout={layout} ghost={ghost} />
      {tables.map((table, index) => centerpiece(table, index, ghost))}
      {object.diningHost && layout.props.some((prop) => prop.kind === 'host') && !ghost && (
        <Text
          position={[
            layout.props.find((prop) => prop.kind === 'host')!.center[0],
            0.84,
            layout.props.find((prop) => prop.kind === 'host')!.center[1] + 0.28,
          ]}
          rotation={[-0.18, 0, 0]}
          fontSize={0.105}
          maxWidth={0.5}
          color="#F1E9D6"
          anchorX="center"
          anchorY="middle"
        >
          DINING AREA
        </Text>
      )}
    </group>
  );
}
