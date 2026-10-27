import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { DoubleSide, Shape, ShapeGeometry } from 'three';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import type { PlanObject } from '../model/types.ts';

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
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
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
      {object.recipe === 'shipping' && (
        <ShippingBay width={width} depth={depth} accent={accent} ghost={ghost} opacity={opacity} />
      )}
      {object.recipe === 'wash-rack' && (
        <WashRack width={width} depth={depth} accent={accent} ghost={ghost} opacity={opacity} />
      )}
      {object.recipe === 'parking-lot' && (
        <ParkingLot width={width} depth={depth} accent={accent} ghost={ghost} opacity={opacity} />
      )}
      {object.recipe === 'dining' && (
        <DiningArea width={width} depth={depth} accent={accent} ghost={ghost} opacity={opacity} />
      )}
      {ghost && (
        <mesh geometry={geometry} position={[0, 0.004, 0]}>
          <meshBasicMaterial color={accent} transparent opacity={0.25} side={DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** A loading bay: hatched ground, a marked dock edge and pallet stacks along the back. */
function ShippingBay({
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
  const hatch = Math.max(2, Math.min(10, Math.floor(width / 1.2)));
  const pallets = Math.max(1, Math.min(4, Math.floor(width / 2.2)));
  return (
    <group>
      {Array.from({ length: hatch }, (_, index) => {
        const x = -width / 2 + ((index + 0.5) * width) / hatch;
        return (
          <mesh
            key={`hatch:${index}`}
            position={[x, 0.021, 0]}
            rotation={[-Math.PI / 2, 0, Math.PI / 4]}
          >
            <planeGeometry args={[Math.hypot(width, depth) * 0.42, 0.06]} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={ghost ? 0.08 : 0.22}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      <mesh position={[0, 0.024, depth / 2 - 0.08]} receiveShadow>
        <boxGeometry args={[width, 0.008, 0.12]} />
        <meshStandardMaterial
          color={accent}
          roughness={0.7}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {Array.from({ length: pallets }, (_, index) => {
        const x = -width / 2 + ((index + 0.5) * width) / pallets;
        return (
          <group key={`pallet:${index}`} position={[x, 0, -depth / 2 + 0.55]}>
            <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.9, 0.16, 0.8]} />
              <meshStandardMaterial
                color="#B08A5E"
                roughness={0.9}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
            <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.8, 0.18, 0.7]} />
              <meshStandardMaterial
                color="#C9A87C"
                roughness={0.88}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          </group>
        );
      })}
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

/** A parking lot: asphalt ground with marked stalls either side of a driving aisle. */
function ParkingLot({
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
  const stalls = Math.max(2, Math.min(8, Math.floor(width / 2.6)));
  const stallWidth = width / stalls;
  const stallDepth = Math.min(2.6, depth * 0.32);
  return (
    <group>
      <mesh position={[0, 0.021, 0]} receiveShadow>
        <boxGeometry args={[width - 0.06, 0.004, depth - 0.06]} />
        <meshStandardMaterial
          color="#3A3F43"
          roughness={0.98}
          transparent={ghost}
          opacity={opacity * 0.75}
        />
      </mesh>
      {[-1, 1].flatMap((side) =>
        Array.from({ length: stalls + 1 }, (_, index) => {
          const x = -width / 2 + index * stallWidth;
          return (
            <mesh
              key={`stall:${side}:${index}`}
              position={[x, 0.026, side * (depth / 2 - stallDepth / 2)]}
              receiveShadow
            >
              <boxGeometry args={[0.08, 0.006, stallDepth]} />
              <meshStandardMaterial
                color={accent}
                roughness={0.8}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          );
        }),
      )}
      <mesh position={[0, 0.026, 0]} receiveShadow>
        <boxGeometry args={[width - 0.06, 0.005, 0.07]} />
        <meshStandardMaterial
          color="#F4D35E"
          roughness={0.85}
          transparent={ghost}
          opacity={opacity * 0.8}
        />
      </mesh>
    </group>
  );
}

/** A dining area: a warm floor with round tables and chair positions. */
function DiningArea({
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
  const columns = Math.max(1, Math.min(4, Math.floor(width / 2.4)));
  const rows = Math.max(1, Math.min(3, Math.floor(depth / 2.4)));
  const tables: { x: number; z: number }[] = [];
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      tables.push({
        x: -width / 2 + ((column + 0.5) * width) / columns,
        z: -depth / 2 + ((row + 0.5) * depth) / rows,
      });
    }
  }
  return (
    <group>
      <mesh position={[0, 0.021, 0]} receiveShadow>
        <boxGeometry args={[width - 0.08, 0.004, depth - 0.08]} />
        <meshStandardMaterial
          color="#E7DCC0"
          roughness={0.95}
          transparent={ghost}
          opacity={opacity * 0.7}
        />
      </mesh>
      {tables.map((table, index) => (
        <group key={`table:${index}`} position={[table.x, 0, table.z]}>
          <mesh position={[0, 0.36, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.36, 0.36, 0.04, 20]} />
            <meshStandardMaterial
              color="#F8F9FA"
              roughness={0.35}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.06, 0.36, 10]} />
            <meshStandardMaterial
              color="#C0C4C8"
              roughness={0.3}
              metalness={0.8}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          {Array.from({ length: 4 }, (_, seat) => {
            const angle = (seat / 4) * Math.PI * 2 + Math.PI / 4;
            return (
              <mesh
                key={`chair:${seat}`}
                position={[Math.cos(angle) * 0.58, 0.22, Math.sin(angle) * 0.58]}
                rotation={[0, -angle, 0]}
                castShadow
              >
                <boxGeometry args={[0.36, 0.04, 0.36]} />
                <meshStandardMaterial
                  color={accent}
                  roughness={0.6}
                  transparent={ghost}
                  opacity={opacity}
                />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}
