import type { ThreeElements } from '@react-three/fiber';
import { Box, assertPositive } from './_primitives';

export type CirculationDetail = 'low' | 'baseline';
export type GroupTransformProps = Omit<ThreeElements['group'], 'children' | 'dispose'>;

export interface GlassBalustradeProps extends GroupTransformProps {
  /** Horizontal length along local +Z, in metres. */
  length?: number;
  /** Height from floor to top of the glazing, in metres. */
  height?: number;
  /** Panel thickness, in metres. */
  glassThickness?: number;
  detail?: CirculationDetail;
}

/** Straight floor-mounted smoke-glass guard with bronze shoes and a continuous cap rail. */
export function GlassBalustrade({
  length = 4,
  height = 1.2,
  glassThickness = 0.025,
  detail = 'baseline',
  ...transform
}: GlassBalustradeProps) {
  assertPositive('length', length);
  assertPositive('height', height);
  assertPositive('glassThickness', glassThickness);
  const panelCount = detail === 'baseline' ? Math.max(1, Math.ceil(length / 1.5)) : 1;
  const panelLength = length / panelCount;
  const shoeCount = detail === 'baseline' ? Math.max(2, Math.ceil(length / 1.6) + 1) : 2;
  const railHeight = height + 0.045;
  return (
    <group {...transform}>
      {Array.from({ length: panelCount }, (_, index) => (
        <Box
          key={`glass-${index}`}
          size={[glassThickness, height, panelLength - Math.min(0.006, panelLength * 0.04)]}
          position={[0, height / 2, (index + 0.5) * panelLength]}
          color="#55777a"
          roughness={0.2}
          metalness={0.22}
          transmission={0.32}
        />
      ))}
      <Box
        size={[glassThickness * 2.4, 0.055, length + 0.06]}
        position={[0, railHeight, length / 2]}
        color="#b18b53"
        roughness={0.26}
        metalness={0.76}
        bevel={0.012}
      />
      <Box
        size={[glassThickness * 2.8, 0.038, length + 0.04]}
        position={[0, 0.025, length / 2]}
        color="#88704d"
        roughness={0.31}
        metalness={0.72}
      />
      {Array.from({ length: shoeCount }, (_, index) => {
        const z = shoeCount === 1 ? length / 2 : (index * length) / (shoeCount - 1);
        return (
          <group key={`shoe-${index}`} position={[0, 0, z]}>
            <Box
              size={[0.105, 0.14, 0.1]}
              position={[0, 0.085, 0]}
              color="#9c7949"
              metalness={0.72}
            />
            {detail === 'baseline' && (
              <Box
                size={[0.16, 0.025, 0.15]}
                position={[0, 0.015, 0]}
                color="#c0a16c"
                metalness={0.78}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

export default GlassBalustrade;
