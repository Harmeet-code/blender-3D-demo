import type { ThreeElements } from '@react-three/fiber';
import {
  FurnitureBox,
  furnitureColors,
  assertFurnitureDimensions,
} from '../furniture/primitives.tsx';

export interface SlattedConsoleProps extends Omit<ThreeElements['group'], 'children'> {
  width?: number;
  height?: number;
  depth?: number;
  detail?: 'baseline' | 'low';
}
export function SlattedConsole({
  width = 3.2,
  height = 0.83,
  depth = 0.6,
  detail = 'baseline',
  ...props
}: SlattedConsoleProps) {
  assertFurnitureDimensions('SlattedConsole', { width, height, depth });
  const flutes =
    detail === 'low' ? Math.max(4, Math.ceil(width / 0.4)) : Math.max(4, Math.ceil(width / 0.2));
  return (
    <group {...props}>
      <FurnitureBox
        size={[width, height, depth]}
        position={[0, height / 2, 0]}
        radius={0.055}
        color={furnitureColors.oak}
        detail={detail}
      />
      {Array.from({ length: flutes }, (_, index) => (
        <FurnitureBox
          key={index}
          size={[0.055, height * 0.87, 0.055]}
          position={[-width / 2 + width * ((index + 0.5) / flutes), height / 2, depth / 2 + 0.028]}
          radius={0.01}
          color={furnitureColors.bronze}
          roughness={0.27}
          metalness={0.75}
          detail={detail}
        />
      ))}
    </group>
  );
}
export default SlattedConsole;
