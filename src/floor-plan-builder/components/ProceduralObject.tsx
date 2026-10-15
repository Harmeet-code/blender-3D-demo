import { useMemo, createContext, useContext } from 'react';
import { Matrix4 } from 'three';
import { Line, Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { isBooth, type PlanObject } from '../model/types.ts';
import { bakeBooth } from '../model/booth.ts';
import { BoothObject } from './BoothObject.tsx';
import { isCirculation } from '../model/circulation.ts';
import { CirculationObject } from './CirculationObject.tsx';
import { TentObject } from './TentObject.tsx';
import { EntranceObject } from './EntranceObject.tsx';
import { WashroomObject } from './WashroomObject.tsx';
import { KidsZoneObject } from './KidsZoneObject.tsx';
import { AvatarObject } from './AvatarObject.tsx';
import { InformationObject } from './InformationObject.tsx';
import { FoodKioskObject } from './FoodKioskObject.tsx';
import { WaterObject } from './WaterObject.tsx';
import { FirstAidObject } from './FirstAidObject.tsx';
import { ExitObject } from './ExitObject.tsx';

interface Props {
  object: PlanObject;
  color: string;
  selected?: boolean;
  ghost?: boolean;
  colorOverride?: boolean;
  topDown?: boolean;
  windSway?: boolean;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
}
const MaterialContext = createContext({ roughness: 0.65, metalness: 0 });
function Box({
  size,
  position = [0, 0, 0],
  color,
  opacity = 1,
  material,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color: string;
  opacity?: number;
  material?: { roughness: number; metalness: number };
}) {
  const appearance = useContext(MaterialContext);
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        {...(material ?? appearance)}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}
export function ProceduralObject({
  object: sourceObject,
  color,
  selected,
  ghost,
  colorOverride,
  topDown = false,
  windSway = true,
  ...events
}: Props) {
  // Cache construction geometry separately from placement transforms and business metadata.
  const baked = useMemo(
    () => (isBooth(sourceObject) ? bakeBooth(sourceObject) : null),
    [
      sourceObject.polygon,
      sourceObject.dimensions,
      sourceObject.scale,
      sourceObject.planarMatrix,
      sourceObject.recipe,
      sourceObject.legacyRoom,
    ],
  );
  const object = baked
    ? {
        ...sourceObject,
        polygon: baked.polygon,
        dimensions: baked.dimensions,
        scale: baked.scale,
        planarMatrix: undefined,
      }
    : sourceObject;
  const [w, h, d] = object.dimensions,
    opacity = ghost ? 0.45 : 1;
  const appearance = { roughness: object.roughness, metalness: object.metalness };
  const planarTransform = useMemo(() => {
    const [xx, zx, xz, zz] = object.planarMatrix ?? [1, 0, 0, 1];
    return new Matrix4().set(xx, 0, xz, 0, 0, 1, 0, 0, zx, 0, zz, 0, 0, 0, 0, 1);
  }, [object.planarMatrix]);
  const outline = object.polygon.map(([x, z]): [number, number, number] => [x, 0.1, z]);
  outline.push(outline[0]!);
  let body;
  if (object.legacyPortalLanding) {
    body = (
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[Math.min(w, d) / 2, Math.min(w, d) / 2, h, 16]} />
        <meshStandardMaterial
          {...appearance}
          color={color}
          transparent={!!ghost}
          opacity={opacity}
        />
      </mesh>
    );
  } else if (isBooth(object)) {
    body = (
      <BoothObject object={object} color={color} ghost={ghost} colorOverride={colorOverride} />
    );
  } else if (isCirculation(object.recipe)) {
    body = (
      <CirculationObject
        object={object}
        ghost={ghost}
        colorOverride={colorOverride ? color : undefined}
      />
    );
  } else if (object.recipe === 'barn-tent') {
    body = (
      <TentObject
        object={object}
        color={color}
        ghost={ghost}
        topDown={topDown}
        windSway={windSway}
      />
    );
  } else if (object.recipe === 'avatar') {
    body = (
      <AvatarObject
        object={object}
        color={color}
        ghost={ghost}
        topDown={topDown}
        showPin={selected}
      />
    );
  } else if (object.recipe === 'washroom-men' || object.recipe === 'washroom-women') {
    body = <WashroomObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'kids-zone') {
    body = <KidsZoneObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'entrance') {
    body = <EntranceObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'bench' || object.recipe === 'table') {
    body = (
      <>
        <Box
          size={[w, h * 0.12, d]}
          position={[0, h * (object.recipe === 'bench' ? 0.49 : 0.94), 0]}
          color={color}
          opacity={opacity}
        />
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <Box
              key={`${x}:${z}`}
              size={[w * 0.04, h * (object.recipe === 'bench' ? 0.43 : 0.88), d * 0.1]}
              position={[x * w * 0.4, h * (object.recipe === 'bench' ? 0.215 : 0.44), z * d * 0.35]}
              color="#7d898c"
              opacity={opacity}
            />
          )),
        )}
        {object.recipe === 'bench' && (
          <Box
            size={[w, h * 0.45, d * 0.12]}
            position={[0, h * 0.775, -d * 0.44]}
            color={color}
            opacity={opacity}
          />
        )}
      </>
    );
  } else if (object.recipe === 'information') {
    body = <InformationObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'food-kiosk') {
    body = <FoodKioskObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'water') {
    body = <WaterObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'first-aid') {
    body = <FirstAidObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'exit') {
    body = <ExitObject object={object} color={color} ghost={ghost} topDown={topDown} />;
  } else if (object.recipe === 'planter' || object.recipe === 'bin') {
    body = (
      <>
        <mesh position={[0, h * 0.3, 0]} scale={[w * 0.42, h * 0.6, d * 0.42]} castShadow>
          <cylinderGeometry args={[1, 0.81, 1, 12]} />
          <meshStandardMaterial
            {...appearance}
            color={color}
            transparent={!!ghost}
            opacity={opacity}
          />
        </mesh>
        {object.recipe === 'planter' ? (
          <mesh position={[0, h * 0.6, 0]} scale={[w * 0.5, h * 0.4, d * 0.5]} castShadow>
            <sphereGeometry args={[1, 10, 10]} />
            <meshStandardMaterial
              {...appearance}
              color="#6c9a73"
              transparent={!!ghost}
              opacity={opacity}
            />
          </mesh>
        ) : (
          <Box
            size={[w * 0.9, h * 0.35, d * 0.9]}
            position={[0, h * 0.78, 0]}
            color="#c7d8df"
            opacity={opacity}
          />
        )}
      </>
    );
  } else if (object.recipe === 'barrier') {
    body = (
      <>
        {[-1, 1].map((side) => (
          <Box
            key={side}
            size={[w * 0.05, h, d]}
            position={[side * w * 0.475, h / 2, 0]}
            color={color}
            opacity={opacity}
          />
        ))}
        <Box
          size={[w, h * 0.08, d * 0.2]}
          position={[0, h * 0.88, 0]}
          color="#7a8a9b"
          opacity={opacity}
        />
      </>
    );
  } else {
    body = (
      <>
        <Box size={[w, h, d]} position={[0, h / 2, 0]} color={color} opacity={opacity} />
        <Box
          size={[w * 0.65, Math.min(0.4, h * 0.3), 0.025]}
          position={[0, h * 0.75, d / 2 + 0.015]}
          color="#e0e9e7"
          opacity={opacity}
        />
      </>
    );
  }
  return (
    <MaterialContext.Provider value={appearance}>
      <group
        name={`plan-object:${object.id}`}
        position={[object.position[0], 0, object.position[1]]}
        rotation={[0, object.yawRadians, 0]}
        scale={object.scale}
        {...events}
      >
        <group matrix={planarTransform} matrixAutoUpdate={false}>
          {body}
          {!ghost &&
            (object.legacyPortalLanding ||
              [
                'washroom-men',
                'washroom-women',
                'kids-zone',
                'entrance',
                'exit',
                'information',
                'water',
                'food-kiosk',
              ].includes(object.recipe)) && (
              <Html center position={[0, h + 0.25, 0]} style={{ pointerEvents: 'none' }}>
                <span className="fp-object-sign">
                  {object.recipe.startsWith('washroom')
                    ? object.gender === 'men'
                      ? 'MEN'
                      : object.gender === 'women'
                        ? 'WOMEN'
                        : 'WASHROOM'
                    : object.name}
                </span>
              </Html>
            )}
          {selected && <Line points={outline} color="#e3b96c" lineWidth={2.5} />}
        </group>
      </group>
    </MaterialContext.Provider>
  );
}
