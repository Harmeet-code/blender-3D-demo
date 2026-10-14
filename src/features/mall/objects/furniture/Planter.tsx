import { assertFurnitureDimensions, furnitureColors } from './primitives.tsx';
import type { FurnitureDetail, FurnitureGroupProps } from './primitives.tsx';

export interface PlanterProps extends FurnitureGroupProps {
  /** Outside width in metres. */
  width?: number;
  /** Outside depth in metres. */
  depth?: number;
  /** Overall height including foliage, in metres. */
  height?: number;
  potColor?: string;
  foliageColor?: string;
  detail?: FurnitureDetail;
  /** Hide the procedural olive tree crown for a simple planted pot. */
  tree?: boolean;
}

/** Tapered limestone vessel with a soil inset and a lightweight procedural olive tree. */
export function Planter({
  width = 0.94,
  depth = 0.94,
  height = 2.05,
  potColor = furnitureColors.stone,
  foliageColor = furnitureColors.foliage,
  detail = 'baseline',
  tree = true,
  ...groupProps
}: PlanterProps) {
  assertFurnitureDimensions('Planter', { width, depth, height });
  const potHeight = Math.min(height * 0.32, 0.68);
  const potTopRadius = Math.min(width, depth) * 0.5;
  const potBottomRadius = potTopRadius * 0.78;
  const ellipseX = width / Math.min(width, depth);
  const ellipseZ = depth / Math.min(width, depth);
  const radialSegments = detail === 'low' ? 10 : 24;
  const foliageCount = detail === 'low' ? 5 : 9;
  const treeHeight = Math.max(0, height - potHeight);
  const foliageScale = Math.min(potTopRadius * 0.8, (treeHeight * 0.3) / 0.82);
  const soilY = potHeight * 0.88;
  const crownVertexHeight = detail === 'low' ? Math.sqrt((5 + Math.sqrt(5)) / 10) : 1;
  const crownY = height - foliageScale * 0.82 * crownVertexHeight;

  return (
    <group {...groupProps}>
      <mesh
        position={[0, potHeight / 2, 0]}
        scale={[ellipseX, 1, ellipseZ]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[potTopRadius, potBottomRadius, potHeight, radialSegments]} />
        <meshStandardMaterial color={potColor} roughness={0.54} />
      </mesh>
      <mesh position={[0, soilY, 0]} scale={[ellipseX, 1, ellipseZ]}>
        <cylinderGeometry
          args={[potTopRadius * 0.87, potTopRadius * 0.87, potHeight * 0.04, radialSegments]}
        />
        <meshStandardMaterial color={furnitureColors.soil} roughness={1} />
      </mesh>
      <mesh
        position={[0, potHeight * 0.96, 0]}
        rotation-x={Math.PI / 2}
        scale={[ellipseX, ellipseZ, 1]}
        castShadow
      >
        <torusGeometry
          args={[
            potTopRadius * 0.93,
            Math.min(width, depth) * 0.025,
            detail === 'low' ? 4 : 8,
            radialSegments,
          ]}
        />
        <meshStandardMaterial color={potColor} roughness={0.5} />
      </mesh>
      {tree && treeHeight > 0 && (
        <>
          <mesh position={[0, potHeight + treeHeight * 0.39, 0]} castShadow>
            <cylinderGeometry
              args={[
                potTopRadius * 0.055,
                potTopRadius * 0.085,
                treeHeight * 0.76,
                detail === 'low' ? 5 : 9,
              ]}
            />
            <meshStandardMaterial color={furnitureColors.oak} roughness={0.82} />
          </mesh>
          {Array.from({ length: foliageCount }, (_, index) => {
            const outer = [
              [0, 0],
              [0.5, 0],
              [-0.5, 0],
              [0, 0.5],
              [0, -0.5],
              [0.32, 0.32],
              [-0.32, 0.32],
              [0.32, -0.32],
              [-0.32, -0.32],
            ] as const;
            const [xRatio, zRatio] = outer[index]!;
            const x = xRatio * potTopRadius * ellipseX;
            const z = zRatio * potTopRadius * ellipseZ;
            const y = crownY;
            const scale = foliageScale * (index % 2 ? 1 : 0.9);
            return (
              <group key={`olive-cluster-${index}`} position={[x, y, z]}>
                <mesh scale={[scale * 1.18 * ellipseX, scale * 0.82, scale * ellipseZ]} castShadow>
                  <icosahedronGeometry args={[1, detail === 'low' ? 0 : 1]} />
                  <meshStandardMaterial
                    color={index % 3 === 0 ? furnitureColors.foliageLight : foliageColor}
                    roughness={0.88}
                    flatShading={detail === 'low'}
                  />
                </mesh>
              </group>
            );
          })}
        </>
      )}
    </group>
  );
}

export default Planter;
