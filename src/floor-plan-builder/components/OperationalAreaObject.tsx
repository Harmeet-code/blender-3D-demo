import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { DoubleSide, Shape, ShapeGeometry } from 'three';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import type { PlanObject } from '../model/types.ts';
import { ShippingObject } from './ShippingObject.tsx';
import { ParkingLotObject } from './ParkingLotObject.tsx';
import { DiningObject } from './DiningObject.tsx';

/**
 * Operational entries are floor regions rather than physical objects: a shipping bay, a wash
 * rack, a parking lot and a dining area all read as reserved ground with their own markings.
 * Each recipe gets distinct geometry so an operator can tell them apart on the plan.
 */
type OperationalRecipe = 'shipping' | 'wash-rack' | 'parking-lot' | 'dining';

const operationalRecipes: OperationalRecipe[] = ['shipping', 'wash-rack', 'parking-lot', 'dining'];

export const isOperationalRecipe = (recipe: string): recipe is OperationalRecipe =>
  (operationalRecipes as string[]).includes(recipe);

const marks = {
  shipping: '#F59E0B',
  'wash-rack': '#9FC6D8',
  'parking-lot': '#E5E7EB',
  dining: '#D8C79B',
} satisfies Record<OperationalRecipe, string>;

export function OperationalAreaObject({
  object,
  color,
  ghost = false,
  heatmap = false,
  suppressBayTooltip = false,
  onSelectParkingBay,
  onSelectParkingBoundary,
  onHoverParkingBay,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
  heatmap?: boolean;
  suppressBayTooltip?: boolean;
  onSelectParkingBay?: (objectId: string, bayId: string) => void;
  onSelectParkingBoundary?: (objectId: string) => void;
  onHoverParkingBay?: (objectId: string, bayId: string | null) => void;
}) {
  const opacity = ghost ? 0.45 : 1;
  const geometry = useMemo(() => {
    const shape = new Shape();
    object.polygon.forEach(([x, z], index) => {
      if (index === 0) {
        shape.moveTo(x, -z);
      } else {
        shape.lineTo(x, -z);
      }
    });
    shape.closePath();
    const value = new ShapeGeometry(shape);
    value.rotateX(-Math.PI / 2);
    value.translate(0, 0.02, 0);
    return value;
  }, [object.polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const bounds = polygonBounds(object.polygon);
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const outline = object.polygon.map(([x, z]): [number, number, number] => [x, 0.03, z]);
  outline.push(outline[0]!);
  const accent = marks[object.recipe as OperationalRecipe] ?? color;

  return (
    <group name={`operational-${object.recipe}`}>
      {object.recipe !== 'parking-lot' && (
        <>
          <mesh geometry={geometry} receiveShadow>
            <meshStandardMaterial
              color={object.color}
              roughness={0.95}
              transparent
              opacity={ghost ? 0.2 : 0.72}
              depthWrite={!ghost}
            />
          </mesh>
          <Line
            points={outline}
            color={object.color}
            lineWidth={1.5}
            transparent
            opacity={ghost ? 0.25 : 0.9}
          />
        </>
      )}
      {object.recipe === 'shipping' && (
        <ShippingObject object={object} width={width} depth={depth} ghost={ghost} />
      )}
      {object.recipe === 'wash-rack' && (
        <WashRack width={width} depth={depth} accent={accent} ghost={ghost} opacity={opacity} />
      )}
      {object.recipe === 'parking-lot' && (
        <ParkingLotObject
          object={object}
          ghost={ghost}
          opacity={opacity}
          heatmap={heatmap}
          suppressBayTooltip={suppressBayTooltip}
          onSelectParkingBay={(bayId) => onSelectParkingBay?.(object.id, bayId)}
          onSelectParkingBoundary={() => onSelectParkingBoundary?.(object.id)}
          onHoverParkingBay={(bayId) => onHoverParkingBay?.(object.id, bayId)}
        />
      )}
      {object.recipe === 'dining' && (
        <DiningObject object={object} ghost={ghost} opacity={opacity} />
      )}
      {ghost && object.recipe !== 'parking-lot' && (
        <mesh geometry={geometry} position={[0, 0.004, 0]}>
          <meshBasicMaterial color={accent} transparent opacity={0.25} side={DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** A wash rack: a grated floor over a drain channel with a service post. */
function WashRack({
  width,
  depth,
  accent,
  ghost,
  opacity,
}: {
  width: number;
  depth: number;
  accent: string;
  ghost: boolean;
  opacity: number;
}) {
  const bars = Math.max(4, Math.min(16, Math.round(width / 0.3)));
  return (
    <group>
      <mesh position={[0, 0.022, 0]} receiveShadow>
        <boxGeometry args={[width - 0.12, 0.006, depth - 0.12]} />
        <meshStandardMaterial
          color="#5E6A70"
          roughness={0.7}
          transparent={ghost}
          opacity={opacity * 0.6}
        />
      </mesh>
      {Array.from({ length: bars }, (_, index) => {
        const x = -width / 2 + 0.06 + ((index + 0.5) * (width - 0.12)) / bars;
        return (
          <mesh key={`bar:${index}`} position={[x, 0.03, 0]} receiveShadow>
            <boxGeometry args={[0.05, 0.02, depth - 0.12]} />
            <meshStandardMaterial
              color="#9AA6AC"
              roughness={0.5}
              metalness={0.5}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        );
      })}
      <mesh position={[0, 0.026, 0]} receiveShadow>
        <boxGeometry args={[0.22, 0.01, depth - 0.12]} />
        <meshStandardMaterial
          color="#2F3A40"
          roughness={0.95}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <group position={[-width / 2 + 0.18, 0, -depth / 2 + 0.18]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 1.1, 12]} />
          <meshStandardMaterial
            color={accent}
            roughness={0.45}
            metalness={0.35}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0.12, 0.95, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.26, 10]} />
          <meshStandardMaterial
            color="#C0C4C8"
            roughness={0.3}
            metalness={0.8}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
    </group>
  );
}
