import { Box, assertPositive } from './_primitives';
import type { CirculationDetail, GroupTransformProps } from './GlassBalustrade';

export interface StaircaseProps extends GroupTransformProps {
  /** Floor-to-floor vertical rise, metres. */
  rise?: number;
  /** Horizontal flight run, excluding the end landings, metres. */
  run?: number;
  /** Clear stair width between handrails, metres. */
  width?: number;
  landingLength?: number;
  detail?: CirculationDetail;
}

/** Open commercial stair with individual nosed treads, stringers and continuous rails. */
export function Staircase({
  rise = 4,
  run = 6,
  width = 2,
  landingLength = 1,
  detail = 'baseline',
  ...transform
}: StaircaseProps) {
  assertPositive('rise', rise);
  assertPositive('run', run);
  assertPositive('width', width);
  assertPositive('landingLength', landingLength);
  const count = detail === 'baseline' ? 20 : 10;
  const treadDepth = run / count;
  const riserHeight = rise / count;
  const sideOffset = width / 2 + 0.08;
  const railLength = Math.hypot(run, rise);
  const slope = rise / run;
  const postCount = detail === 'baseline' ? 6 : 2;
  return (
    <group {...transform}>
      <Box
        size={[width + 0.18, 0.12, landingLength]}
        position={[0, -0.06, -landingLength / 2]}
        color="#b8a37d"
        roughness={0.37}
        metalness={0.08}
        bevel={0.025}
      />
      <Box
        size={[width + 0.18, 0.12, landingLength]}
        position={[0, rise - 0.06, run + landingLength / 2]}
        color="#b8a37d"
        roughness={0.37}
        metalness={0.08}
        bevel={0.025}
      />
      {Array.from({ length: count }, (_, index) => {
        const top = (index + 1) * riserHeight;
        const z = (index + 0.5) * treadDepth;
        return (
          <group key={`step-${index}`}>
            <Box
              size={[width, 0.055, treadDepth * 0.96]}
              position={[0, top - 0.028, z]}
              color="#c5b28e"
              roughness={0.38}
              metalness={0.05}
              bevel={0.012}
            />
            <Box
              size={[width - 0.015, 0.012, 0.024]}
              position={[0, top + 0.006, z - treadDepth * 0.46]}
              color="#a47e4a"
              roughness={0.3}
              metalness={0.62}
            />
            {detail === 'baseline' && (
              <Box
                size={[width, Math.max(0.025, riserHeight - 0.045), 0.035]}
                position={[0, top - riserHeight / 2, z + treadDepth * 0.47]}
                color="#8d8069"
                roughness={0.48}
                metalness={0.12}
              />
            )}
          </group>
        );
      })}
      {[-sideOffset, sideOffset].map((x) => (
        <group key={`rail-${x}`}>
          <group position={[x, 0, 0]} rotation={[-Math.atan(slope), 0, 0]}>
            <Box
              size={[0.105, 0.14, railLength]}
              position={[0, 0.04, railLength / 2]}
              color="#947548"
              roughness={0.34}
              metalness={0.66}
            />
            <Box
              size={[0.045, 0.045, railLength + 0.16]}
              position={[0, 0.99, railLength / 2]}
              color="#9c7544"
              roughness={0.25}
              metalness={0.75}
              bevel={0.018}
            />
            {Array.from({ length: postCount }, (_, index) => {
              const t = index / (postCount - 1);
              return (
                <Box
                  key={`post-${index}`}
                  size={[0.045, 0.96, 0.045]}
                  position={[0, 0.51, t * railLength]}
                  color="#9b794b"
                  roughness={0.29}
                  metalness={0.72}
                />
              );
            })}
          </group>
        </group>
      ))}
    </group>
  );
}

export default Staircase;
