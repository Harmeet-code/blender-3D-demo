import type { ThreeElements } from '@react-three/fiber';

export interface PendantLightProps extends Omit<ThreeElements['group'], 'children'> {
  cableLength?: number;
  light?: boolean;
}
/** Ceiling attachment is the origin; negative Y hangs into the room. */
export function PendantLight({ cableLength = 1.8, light = false, ...props }: PendantLightProps) {
  if (!Number.isFinite(cableLength) || cableLength <= 0) {
    throw new RangeError('Cable length must be finite and positive.');
  }
  return (
    <group {...props}>
      <mesh position={[0, -cableLength / 2, 0]}>
        <cylinderGeometry args={[0.009, 0.009, cableLength, 8]} />
        <meshStandardMaterial color="#a38c62" metalness={0.75} roughness={0.27} />
      </mesh>
      <mesh position={[0, -cableLength - 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 20]} />
        <meshStandardMaterial color="#a38c62" metalness={0.75} roughness={0.27} />
      </mesh>
      <mesh position={[0, -cableLength - 0.35, 0]} scale={[1, 1.3, 1]}>
        <sphereGeometry args={[0.19, 24, 16]} />
        <meshStandardMaterial
          color="#ffdfaa"
          roughness={0.3}
          emissive="#ffc78a"
          emissiveIntensity={1.2}
        />
      </mesh>
      {light && (
        <pointLight
          position={[0, -cableLength - 0.35, 0]}
          color="#ffd5a8"
          intensity={5}
          distance={5}
          decay={2}
        />
      )}
    </group>
  );
}
export default PendantLight;
