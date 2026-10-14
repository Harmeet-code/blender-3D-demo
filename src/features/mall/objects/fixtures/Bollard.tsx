import type { ThreeElements } from '@react-three/fiber';

export interface BollardProps extends Omit<ThreeElements['group'], 'children'> {
  height?: number;
  radius?: number;
  color?: string;
}
export function Bollard({
  height = 0.95,
  radius = 0.065,
  color = '#3d4446',
  ...props
}: BollardProps) {
  if (!Number.isFinite(height) || height < 0.2 || !Number.isFinite(radius) || radius <= 0) {
    throw new RangeError('Bollard height must be at least 0.2 m and radius must be positive.');
  }
  return (
    <group {...props}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, height, 20]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.017, 0]} receiveShadow>
        <cylinderGeometry args={[radius * 1.5, radius * 1.5, 0.034, 24]} />
        <meshStandardMaterial color="#a28c67" metalness={0.78} roughness={0.3} />
      </mesh>
      <mesh position={[0, height * 0.84, 0]}>
        <cylinderGeometry args={[radius * 1.02, radius * 1.02, 0.055, 20]} />
        <meshStandardMaterial color="#d4c29b" metalness={0.4} roughness={0.42} />
      </mesh>
      <mesh position={[0, height, 0]} castShadow>
        <sphereGeometry args={[radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}
export default Bollard;
