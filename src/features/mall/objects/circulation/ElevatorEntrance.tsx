import { Box, assertPositive } from './_primitives';
import type { CirculationDetail, GroupTransformProps } from './GlassBalustrade';

export interface ElevatorEntranceProps extends GroupTransformProps {
  /** Clear door opening width, metres. */
  width?: number;
  /** Finished opening height, metres. */
  height?: number;
  /** Portal frame depth into the wall, metres. Front faces local +Z. */
  depth?: number;
  /** How far the two centre-opening leaves slide apart (0 closed, 1 fully open). */
  doorOpen?: number;
  detail?: CirculationDetail;
}

/** Double-leaf lift portal; frame, recessed stainless threshold, call station and floor indicator. */
export function ElevatorEntrance({
  width = 1.6,
  height = 2.4,
  depth = 0.3,
  doorOpen = 0,
  detail = 'baseline',
  ...transform
}: ElevatorEntranceProps) {
  assertPositive('width', width);
  assertPositive('height', height);
  assertPositive('depth', depth);
  if (!Number.isFinite(doorOpen) || doorOpen < 0 || doorOpen > 1) {
    throw new RangeError(`doorOpen must be between 0 and 1; received ${doorOpen}`);
  }
  const jambWidth = Math.min(0.12, width * 0.08);
  const headerHeight = Math.min(0.18, height * 0.08);
  const leafWidth = width / 2;
  const closedCenter = width / 4;
  const slide = doorOpen * leafWidth;
  const front = depth / 2 + 0.012;
  return (
    <group {...transform}>
      <Box
        size={[jambWidth, height + headerHeight, depth]}
        position={[-width / 2 - jambWidth / 2, (height + headerHeight) / 2, 0]}
        color="#826944"
        roughness={0.3}
        metalness={0.74}
        bevel={0.012}
      />
      <Box
        size={[jambWidth, height + headerHeight, depth]}
        position={[width / 2 + jambWidth / 2, (height + headerHeight) / 2, 0]}
        color="#826944"
        roughness={0.3}
        metalness={0.74}
        bevel={0.012}
      />
      <Box
        size={[width + jambWidth * 2, headerHeight, depth]}
        position={[0, height + headerHeight / 2, 0]}
        color="#8e7045"
        roughness={0.28}
        metalness={0.76}
        bevel={0.014}
      />
      <Box
        size={[width, 0.045, depth + 0.08]}
        position={[0, 0.0225, 0.018]}
        color="#c0a16e"
        roughness={0.23}
        metalness={0.82}
        bevel={0.008}
      />
      {[-1, 1].map((side) => (
        <group key={`leaf-${side}`} position={[side * (closedCenter + slide), 0, 0]}>
          <Box
            size={[leafWidth - 0.012, height - 0.025, 0.045]}
            position={[0, height / 2, front]}
            color="#55585a"
            roughness={0.34}
            metalness={0.68}
            bevel={detail === 'baseline' ? 0.006 : 0}
          />
          {detail === 'baseline' && (
            <>
              {[0.22, 0.78].map((t) => (
                <Box
                  key={`trim-${t}`}
                  size={[leafWidth - 0.08, 0.012, 0.008]}
                  position={[0, height * t, front + 0.028]}
                  color="#a98a5a"
                  roughness={0.29}
                  metalness={0.76}
                />
              ))}
              <Box
                size={[0.012, height - 0.12, 0.009]}
                position={[side * (leafWidth / 2 - 0.025), height / 2, front + 0.03]}
                color="#92774d"
                metalness={0.68}
              />
            </>
          )}
        </group>
      ))}
      <Box
        size={[0.09, 0.2, 0.025]}
        position={[width / 2 + jambWidth + 0.11, 1.12, front + 0.035]}
        color="#a27e4c"
        roughness={0.26}
        metalness={0.73}
        bevel={0.012}
      />
      <Box
        size={[0.035, 0.06, 0.012]}
        position={[width / 2 + jambWidth + 0.11, 1.15, front + 0.055]}
        color="#e0b960"
        roughness={0.28}
        metalness={0.35}
      />
      <Box
        size={[0.22, 0.06, 0.022]}
        position={[0, height + headerHeight / 2, front + 0.02]}
        color="#253337"
        roughness={0.22}
        metalness={0.38}
      />
      <Box
        size={[0.045, 0.018, 0.01]}
        position={[0, height + headerHeight / 2, front + 0.037]}
        color="#e7c578"
        roughness={0.3}
        metalness={0.16}
      />
    </group>
  );
}

export default ElevatorEntrance;
