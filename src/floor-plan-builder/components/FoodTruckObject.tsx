import type { PlanObject } from '../model/types.ts';

export function FoodTruckObject({
  object,
  color,
  ghost = false,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
}) {
  void color;
  const [w, h, d] = object.dimensions;
  const opacity = ghost ? 0.45 : 1;
  const wheelRadius = Math.max(0.08, Math.min(h * 0.17, d * 0.16));
  const wheelY = wheelRadius;
  const wheelPositions: [number, number, number][] = [
    [-w * 0.29, wheelY, -d * 0.43],
    [-w * 0.29, wheelY, d * 0.43],
    [w * 0.31, wheelY, -d * 0.43],
    [w * 0.31, wheelY, d * 0.43],
  ];
  return (
    <group>
      <mesh position={[-w * 0.07, h * 0.49, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.64, h * 0.48, d * 0.9]} />
        <meshStandardMaterial color={object.color} roughness={0.72} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[w * 0.31, h * 0.39, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.3, h * 0.6, d * 0.88]} />
        <meshStandardMaterial color="#F8F9FA" roughness={0.68} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[w * 0.39, h * 0.66, 0]} castShadow>
        <boxGeometry args={[w * 0.12, h * 0.17, d * 0.74]} />
        <meshStandardMaterial color="#90B4C4" roughness={0.32} metalness={0.08} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[-w * 0.06, h * 0.66, d * 0.455]} castShadow>
        <boxGeometry args={[w * 0.34, h * 0.22, 0.035]} />
        <meshStandardMaterial color="#1E2022" roughness={0.46} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[-w * 0.06, h * 0.81, d * 0.51]} castShadow>
        <boxGeometry args={[w * 0.43, h * 0.055, d * 0.22]} />
        <meshStandardMaterial color="#F59E0B" roughness={0.75} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[w * 0.48, h * 0.24, d * 0.28]} castShadow>
        <boxGeometry args={[w * 0.025, h * 0.09, d * 0.13]} />
        <meshStandardMaterial color="#FFF4CC" emissive="#FDE68A" emissiveIntensity={0.18} transparent={ghost} opacity={opacity} />
      </mesh>
      {wheelPositions.map((position, index) => (
        <mesh key={index} position={position} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[wheelRadius, wheelRadius, Math.max(0.08, d * 0.07), 16]} />
          <meshStandardMaterial color="#25292B" roughness={0.9} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}
