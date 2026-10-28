import { memo, useMemo, createContext, useContext } from 'react';
import { Matrix4 } from 'three';
import { Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { isBooth, isPlanArea, isShellStructure, type PlanObject } from '../model/types.ts';
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
import { BenchObject } from './BenchObject.tsx';
import { TableObject } from './TableObject.tsx';
import { ChairObject } from './ChairObject.tsx';
import { BarrierObject } from './BarrierObject.tsx';
import { PlanterObject } from './PlanterObject.tsx';
import { BinObject } from './BinObject.tsx';
import { AreaObject } from './AreaObject.tsx';
import { OperationalAreaObject, isOperationalRecipe } from './OperationalAreaObject.tsx';
import { WashRackObject } from './WashRackObject.tsx';
import { FoodTruckObject } from './FoodTruckObject.tsx';
import { GhostController } from '../wayfinding/rendering/GhostController.tsx';
import { RouteLabel } from '../wayfinding/rendering/Beacon.tsx';

interface Props {
  object: PlanObject;
  color: string;
  selected?: boolean;
  ghost?: boolean;
  colorOverride?: boolean;
  topDown?: boolean;
  windSway?: boolean;
  routeCutaway?: boolean;
  rowConnections?: { left: boolean; right: boolean };
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
export const ProceduralObject = memo(
  ({
    object: sourceObject,
    color,
    selected,
    ghost,
    colorOverride,
    topDown = false,
    windSway = true,
    routeCutaway = false,
    rowConnections,
    ...events
  }: Props) => {
    // Cache construction geometry separately from placement transforms and business metadata.
    const baked = useMemo(
      () =>
        isBooth(sourceObject) || isShellStructure(sourceObject) ? bakeBooth(sourceObject) : null,
      [
        sourceObject.polygon,
        sourceObject.dimensions,
        sourceObject.scale,
        sourceObject.planarMatrix,
        sourceObject.recipe,
        sourceObject.documentType,
        sourceObject.boothDesign,
        sourceObject.legacyRoom,
      ],
    );
    const object = useMemo(
      () =>
        baked
          ? {
              ...sourceObject,
              polygon: baked.polygon,
              dimensions: baked.dimensions,
              scale: baked.scale,
              planarMatrix: undefined,
            }
          : sourceObject,
      [sourceObject, baked],
    );
    const [w, h, d] = object.dimensions,
      opacity = ghost ? 0.45 : 1;
    const appearance = useMemo(
      () => ({ roughness: object.roughness, metalness: object.metalness }),
      [object.roughness, object.metalness],
    );
    const planarTransform = useMemo(() => {
      const [xx, zx, xz, zz] = object.planarMatrix ?? [1, 0, 0, 1];
      return new Matrix4().set(xx, 0, xz, 0, 0, 1, 0, 0, zx, 0, zz, 0, 0, 0, 0, 1);
    }, [object.planarMatrix]);
    const outline = object.polygon.map(([x, z]): [number, number, number] => [x, 0.1, z]);
    outline.push(outline[0]!);
    // Event handlers on the placement group can change with the pointer without
    // rebuilding the unchanged procedural asset subtree.
    const renderedBody = useMemo(() => {
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
      } else if (isBooth(object) || isShellStructure(object)) {
        body = (
          <BoothObject
            object={object}
            color={isBooth(object) ? color : object.color}
            ghost={ghost}
            colorOverride={isBooth(object) && colorOverride}
          />
        );
      } else if (object.recipe === 'wash-rack' && object.washRackVariant) {
        body = (
          <WashRackObject
            variant={object.washRackVariant}
            dimensions={object.dimensions}
            wetness={object.washRackWetness ?? 0}
            running={object.washRackRunning ?? false}
            boomAngle={object.washRackBoomAngle ?? (object.washRackBoomArc ?? 180) / 2}
            boomArc={object.washRackBoomArc ?? 180}
            ghost={ghost}
            rowConnections={rowConnections}
          />
        );
      } else if (isPlanArea(object)) {
        body = isOperationalRecipe(object.recipe) ? (
          <OperationalAreaObject object={object} color={color} ghost={ghost} />
        ) : (
          <AreaObject object={object} color={color} ghost={ghost} />
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
      } else if (object.recipe === 'bench') {
        body = <BenchObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'table') {
        body = <TableObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'chair') {
        body = <ChairObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'information') {
        body = <InformationObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'food-kiosk') {
        body = <FoodKioskObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'food-truck') {
        body = <FoodTruckObject object={object} color={color} ghost={ghost} />;
      } else if (object.recipe === 'water') {
        body = <WaterObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'first-aid') {
        body = <FirstAidObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'exit') {
        body = <ExitObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'planter') {
        body = <PlanterObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'bin') {
        body = <BinObject object={object} color={color} ghost={ghost} topDown={topDown} />;
      } else if (object.recipe === 'barrier') {
        body = <BarrierObject object={object} color={color} ghost={ghost} topDown={topDown} />;
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
      return body;
    }, [
      object,
      color,
      ghost,
      colorOverride,
      topDown,
      windSway,
      appearance,
      w,
      h,
      d,
      opacity,
      selected,
      rowConnections,
    ]);
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
            <GhostController enabled={routeCutaway}>{renderedBody}</GhostController>
            {!ghost &&
              (object.legacyPortalLanding ||
                ['washroom-men', 'washroom-women', 'kids-zone', 'entrance'].includes(
                  object.recipe,
                )) && (
                <RouteLabel
                  at={[0, h + 0.25, 0]}
                  text={
                    object.recipe.startsWith('washroom')
                      ? object.gender === 'men'
                        ? 'MEN'
                        : object.gender === 'women'
                          ? 'WOMEN'
                          : 'WASHROOM'
                      : object.name
                  }
                />
              )}
            {selected && <Line points={outline} color="#e3b96c" lineWidth={2.5} />}
            {object.locked && (
              <Line
                points={outline}
                color="#8d9aa6"
                lineWidth={1.5}
                dashed
                dashSize={0.14}
                gapSize={0.1}
              />
            )}
          </group>
        </group>
      </MaterialContext.Provider>
    );
  },
);
