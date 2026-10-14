import { Box, ContinuousBelt, assertPositive } from './_primitives';
import type { CirculationDetail, GroupTransformProps } from './GlassBalustrade';

export interface EscalatorProps extends GroupTransformProps {
  /** Vertical floor-to-floor rise, metres. */
  rise?: number;
  /** Horizontal flight run between landings, metres. */
  run?: number;
  /** Overall width including side assemblies, metres. */
  width?: number;
  /** Flat entry and exit landing length, metres. */
  landingLength?: number;
  detail?: CirculationDetail;
  /** Travel direction along local +Z. */
  direction?: 'up' | 'down';
}

const BRONZE = '#9a7542';
const DARK_METAL = '#22282b';
const RUBBER = '#181c1e';
const GLASS = '#55777a';
const YELLOW = '#d2aa55';

/** Reusable architectural escalator. Its entry floor is at local Z=0. */
export function Escalator({
  rise = 4.4,
  run = 9.5,
  width = 2.1,
  landingLength = 0.7,
  detail = 'baseline',
  direction = 'up',
  ...transform
}: EscalatorProps) {
  assertPositive('rise', rise);
  assertPositive('run', run);
  assertPositive('width', width);
  assertPositive('landingLength', landingLength);
  if (width < 0.65) {
    throw new RangeError('width must be at least 0.65 m for the tread and side assemblies');
  }
  const steps = Math.max(2, Math.round(run / 0.3));
  const going = run / steps;
  const riser = rise / steps;
  const angle = Math.atan2(rise, run);
  const travelSign = direction === 'up' ? 1 : -1;
  const startY = direction === 'up' ? 0 : rise;
  const endY = direction === 'up' ? rise : 0;
  const left = -width / 2 + 0.09;
  const right = width / 2 - 0.09;
  const railLength = Math.hypot(run, rise);
  const railWidth = detail === 'baseline' ? 0.055 : 0.035;
  return (
    <group {...transform}>
      {/* Landing plates align their top surfaces with the lower and upper floor planes. */}
      <Box
        size={[width, 0.1, landingLength]}
        position={[0, startY - 0.05, -landingLength / 2]}
        color={BRONZE}
        metalness={0.66}
        bevel={0.025}
      />
      <Box
        size={[width, 0.1, landingLength]}
        position={[0, endY - 0.05, run + landingLength / 2]}
        color={BRONZE}
        metalness={0.66}
        bevel={0.025}
      />
      <group
        position={[0, (startY + endY) / 2 - 0.1, run / 2]}
        rotation={[-travelSign * angle, 0, 0]}
      >
        <Box
          size={[width - 0.12, 0.09, railLength + 0.05]}
          position={[0, 0, 0]}
          color="#424749"
          roughness={0.72}
          metalness={0.42}
        />
      </group>
      {Array.from({ length: steps }, (_, index) => {
        const z = (index + 0.5) * going;
        const y = startY + travelSign * ((index + 1) * riser - 0.055);
        const ribCount = detail === 'baseline' ? 3 : 1;
        return (
          <group key={`step-${index}`} position={[0, y, z]}>
            <Box
              size={[width - 0.28, 0.07, going * 0.9]}
              position={[0, 0, 0]}
              color={DARK_METAL}
              roughness={0.58}
              metalness={0.58}
              bevel={0.008}
            />
            <Box
              size={[width - 0.3, 0.012, 0.018]}
              position={[0, 0.041, -going * 0.42]}
              color={YELLOW}
              roughness={0.42}
              metalness={0.28}
            />
            {Array.from({ length: ribCount }, (_, rib) => {
              const x = (rib - (ribCount - 1) / 2) * ((width - 0.48) / Math.max(1, ribCount - 1));
              return (
                <Box
                  key={`rib-${rib}`}
                  size={[0.014, 0.009, going * 0.68]}
                  position={[x, 0.04, 0.025]}
                  color="#777d7f"
                  roughness={0.62}
                  metalness={0.52}
                />
              );
            })}
          </group>
        );
      })}
      {[left, right].map((x) => {
        const xSign = x < 0 ? -1 : 1;
        return (
          <group key={`side-${x}`}>
            {/* Stainless skirt and smoked-glass guard follow the true slope. */}
            <group position={[x, startY, 0]} rotation={[travelSign * -angle, 0, 0]}>
              <Box
                size={[0.12, 0.16, railLength + 0.12]}
                position={[0, 0.11, railLength / 2]}
                color={BRONZE}
                metalness={0.72}
              />
              <Box
                size={[0.035, 0.76, railLength - 0.12]}
                position={[0, 0.58, railLength / 2]}
                color={GLASS}
                roughness={0.2}
                metalness={0.18}
                transmission={0.32}
              />
              <ContinuousBelt length={railLength} radius={railWidth / 2} color={RUBBER} />
              <Box
                size={[0.08, 0.026, railLength - 0.18]}
                position={[xSign * 0.027, 0.17, railLength / 2]}
                color="#c0a16a"
                metalness={0.75}
              />
            </group>
            {/* Wrapped end caps make each belt continuous across the comb plates. */}
            <Box
              size={[0.16, 0.34, 0.46]}
              position={[x, startY + 0.22, 0.08]}
              color="#646b6d"
              roughness={0.36}
              metalness={0.68}
              bevel={0.035}
            />
            <Box
              size={[0.16, 0.34, 0.46]}
              position={[x, endY + 0.22, run - 0.08]}
              color="#646b6d"
              roughness={0.36}
              metalness={0.68}
              bevel={0.035}
            />
          </group>
        );
      })}
      <Box
        size={[width - 0.24, 0.018, 0.13]}
        position={[0, startY + 0.016, 0.02]}
        color={YELLOW}
        roughness={0.46}
        metalness={0.25}
      />
      <Box
        size={[width - 0.24, 0.018, 0.13]}
        position={[0, endY + 0.016, run - 0.02]}
        color={YELLOW}
        roughness={0.46}
        metalness={0.25}
      />
    </group>
  );
}

export default Escalator;
