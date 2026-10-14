import { useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { CatmullRomCurve3, Vector3 } from 'three';

export function FireExtinguisher(props: Omit<ThreeElements['group'], 'children'>) {
  const hose = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(0.025, 0.68, 0),
        new Vector3(0.13, 0.65, 0),
        new Vector3(0.15, 0.48, 0.01),
        new Vector3(0.14, 0.31, 0.03),
      ]),
    [],
  );
  return (
    <group {...props}>
      <mesh position={[0, 0.29, 0]} castShadow receiveShadow>
        <capsuleGeometry args={[0.085, 0.41, 8, 20]} />
        <meshStandardMaterial color="#b82c28" roughness={0.28} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.015, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.03, 20]} />
        <meshStandardMaterial color="#262b2d" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.595, 0]}>
        <cylinderGeometry args={[0.022, 0.027, 0.12, 16]} />
        <meshStandardMaterial color="#b59c68" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[0.15, 0.018, 0.035]} />
        <meshStandardMaterial color="#22292b" metalness={0.65} roughness={0.3} />
      </mesh>
      <mesh>
        <tubeGeometry args={[hose, 24, 0.012, 8, false]} />
        <meshStandardMaterial color="#15191b" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.62, 0.027]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.025, 0.025, 0.016, 20]} />
        <meshStandardMaterial color="#edeadf" metalness={0.15} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.34, 0.086]}>
        <planeGeometry args={[0.095, 0.15]} />
        <meshStandardMaterial color="#f2eee4" roughness={0.8} />
      </mesh>
    </group>
  );
}
export default FireExtinguisher;
