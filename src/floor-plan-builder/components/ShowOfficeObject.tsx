import { useMemo } from 'react';
import type { PlanObject } from '../model/types.ts';
import { ChairMesh } from './ChairObject.tsx';

const Box = ({ size, at, color, metalness = 0, opacity = 1 }: { size: [number, number, number]; at: [number, number, number]; color: string; metalness?: number; opacity?: number }) => (
  <mesh position={at} castShadow receiveShadow>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} metalness={metalness} roughness={0.68} transparent={opacity < 1} opacity={opacity} />
  </mesh>
);

const Cylinder = ({ at, radius, height, color }: { at: [number, number, number]; radius: number; height: number; color: string }) => (
  <mesh position={at} castShadow>
    <cylinderGeometry args={[radius, radius, height, 12]} />
    <meshStandardMaterial color={color} metalness={0.55} roughness={0.4} />
  </mesh>
);

/** Public registration counter, secure staff room and accessible cabin approach. */
export function ShowOfficeObject({ object, ghost = false, topDown = false }: { object: PlanObject; ghost?: boolean; topDown?: boolean }) {
  const variant = object.showOfficeVariant ?? 'cabin';
  const [width, overallHeight, depth] = object.dimensions;
  const cabin = variant === 'cabin';
  const popup = variant === 'pop-up';
  const floor = cabin ? 0.45 : 0;
  const shellHeight = cabin ? Math.min(2.8, overallHeight - 0.8) : variant === 'room' ? overallHeight : 2.25;
  const shellDepth = cabin ? Math.min(2.44, depth - 1.2) : depth;
  const shellCenterZ = cabin ? shellDepth / 2 : depth / 2;
  const shellBottom = floor;
  const wallColor = popup ? '#1E3A8A' : '#E8EDF0';
  const alpha = ghost ? 0.55 : 1;
  const cutaway = Math.max(0, Math.min(1, object.officeCutaway ?? 0));
  const wallOpacity = Math.max(0.15, 1 - cutaway * 0.85) * alpha;
  const windowOpen = object.officeWindowOpen ?? false;
  const doorOpen = object.officeDoorOpen ?? false;
  const blindsOpen = object.officeBlindsOpen ?? false;
  const detail = object.officeInteriorDetail ?? true;
  const counterZ = shellCenterZ - shellDepth / 2 - 0.12;
  const accessibleWidth = Math.min(1.2, width * 0.24);
  const mainCounterWidth = Math.max(1.2, width - accessibleWidth - 1.2);
  const tables = useMemo(() => Array.from({ length: 2 }, (_, row) => Array.from({ length: 2 }, (_, col) => ({ x: (col ? 1 : -1) * Math.min(width * 0.2, 1.2), z: shellCenterZ + (row ? 0.7 : -0.65) }))).flat(), [width, shellCenterZ]);

  return (
    <group name="show-office">
      {!popup && <>
        {cabin && [-width / 2 + 0.2, width / 2 - 0.2].map((x) => <Box key={x} size={[0.2, shellHeight, shellDepth]} at={[x, shellBottom + shellHeight / 2, shellCenterZ]} color={wallColor} opacity={wallOpacity} />)}
        <Box size={[width, 0.12, shellDepth]} at={[0, shellBottom + shellHeight, shellCenterZ]} color={cabin ? '#D7DEE2' : '#1E3A8A'} opacity={wallOpacity} />
        <Box size={[width, shellHeight, 0.15]} at={[0, shellBottom + shellHeight / 2, shellCenterZ + shellDepth / 2]} color={wallColor} opacity={wallOpacity} />
        <Box size={[width, 0.08, shellDepth]} at={[0, floor - 0.08, shellCenterZ]} color="#59636A" />
        {Array.from({ length: Math.max(2, Math.floor(width / 2)) }, (_, i) => {
          const x = -width / 2 + (i + 0.5) * (width / Math.max(2, Math.floor(width / 2)));
          return <group key={`front-${i}`}>
            <Box size={[Math.max(0.4, width / Math.max(2, Math.floor(width / 2)) - 0.22), 1.1, 0.08]} at={[x, floor + 1.65, 0.07]} color="#A7C9D8" opacity={0.45 * alpha} metalness={0.25} />
            <Box size={[0.035, 1.2, 0.08]} at={[x - 0.45, floor + 1.65, 0.09]} color="#77858C" metalness={0.8} />
          </group>;
        })}
      </>}
      {popup && <>
        {[-width / 2 + 0.15, width / 2 - 0.15].map(x => <Cylinder key={x} at={[x, 1.25, shellCenterZ]} radius={0.045} height={2.5} color="#9AA6AC" />)}
        <Box size={[width, 0.08, 0.08]} at={[0, 2.45, shellCenterZ]} color="#9AA6AC" metalness={0.6} />
        <Box size={[width, 0.05, depth]} at={[0, 2.52, shellCenterZ]} color="#E8E1D1" />
        <Box size={[width, 0.8, 0.08]} at={[0, 1.6, shellCenterZ + depth / 2 - 0.08]} color="#1E3A8A" />
      </>}
      {cabin && <>
        <Box size={[width, 0.12, shellDepth]} at={[0, floor - 0.14, shellCenterZ]} color="#626B70" />
        <Box size={[1, 0.8, 0.7]} at={[width / 2 - 0.9, overallHeight - 0.4, shellCenterZ]} color="#89949A" metalness={0.45} />
        {/* Full 1:12 ramp (5.4 m) and landing are placed in front of the entry. */}
        <group position={[0, 0, -1.2]}>
          <mesh position={[0, 0.225, -2.7]} rotation={[-Math.atan(1 / 12), 0, 0]} castShadow>
            <boxGeometry args={[1.2, 0.07, 5.4]} /><meshStandardMaterial color="#858C8E" metalness={0.28} roughness={0.8} />
          </mesh>
          <Box size={[1.5, 0.08, 1.5]} at={[0, 0.04, -5.95]} color="#777F82" />
          {[-0.62, 0.62].map(x => <group key={x}>
            <Cylinder at={[x, 0.52, -0.5]} radius={0.035} height={1.0} color="#9CA3A6" />
            <Cylinder at={[x, 0.28, -3]} radius={0.035} height={0.56} color="#9CA3A6" />
            <Cylinder at={[x, 0.07, -5.45]} radius={0.035} height={0.14} color="#9CA3A6" />
            <Box size={[0.04, 0.04, 5.4]} at={[x, 1.0, -2.7]} color="#AAB2B5" metalness={0.75} />
          </group>)}
          {[0, 1, 2].map(i => <Box key={i} size={[1.5, 0.15, 0.3]} at={[width / 2 - 1.0, 0.075 + i * 0.15, -0.15 - i * 0.3]} color="#A99472" />)}
        </group>
      </>}
      {/* Dual-height FOH service counter with genuinely open knee space. */}
      <Box size={[mainCounterWidth, 0.07, 0.62]} at={[-accessibleWidth / 2, floor + 1.1, counterZ]} color="#424B50" />
      <Box size={[mainCounterWidth, 0.95, 0.08]} at={[-accessibleWidth / 2, floor + 0.58, counterZ + 0.28]} color="#D9DEE0" />
      <Box size={[accessibleWidth, 0.06, 0.62]} at={[width / 2 - accessibleWidth / 2 - 0.15, floor + 0.85, counterZ]} color="#424B50" />
      <Box size={[accessibleWidth, 0.65, 0.08]} at={[width / 2 - accessibleWidth / 2 - 0.15, floor + 0.34, counterZ + 0.28]} color="#D9DEE0" />
      {[-1.6, 0, 1.6].filter(x => Math.abs(x) < width / 2 - 0.45).map((x,i) => <group key={`station-${i}`}>
        <Box size={[0.35, 0.14, 0.3]} at={[x, floor + 1.19, counterZ - 0.08]} color="#283641" />
        <Box size={[0.24, 0.18, 0.025]} at={[x, floor + 1.35, counterZ - 0.1]} color="#163A53" />
        <Box size={[0.12, 0.16, 0.12]} at={[x + 0.28, floor + 1.18, counterZ - 0.1]} color="#D5DADD" />
      </group>)}
      {/* Staff stations, storage and clearly differentiated restricted workspace. */}
      {detail && <>
        {tables.map((p, i) => <group key={`desk-${i}`}>
          <Box size={[1.2, 0.07, 0.65]} at={[p.x, floor + 0.76, p.z]} color="#876C50" />
          <Box size={[0.4, 0.28, 0.04]} at={[p.x, floor + 0.98, p.z + 0.12]} color="#202C37" />
          <ChairMesh at={[p.x, floor, p.z + 0.55]} yaw={Math.PI} style="banquet-padded" />
        </group>)}
        {[-width/2+0.55, -width/2+1.1, width/2-0.55].map((x,i) => <Box key={`cab-${i}`} size={[0.42, 1.05, 0.42]} at={[x, floor + 0.525, shellCenterZ + shellDepth*0.35]} color={i===2?'#8797A0':'#B6C0C4'} />)}
        <Box size={[1.6, 0.9, 0.05]} at={[0, floor + 1.55, shellCenterZ + shellDepth/2 - 0.1]} color="#E5E9E7" />
        <Box size={[0.4, 0.7, 0.4]} at={[width/2-0.4, floor+0.4, shellCenterZ+0.55]} color="#F1F4F5" />
        {Array.from({length: Math.min(object.officeVisitors ?? 0, 8)}, (_,i) => <group key={`visitor-${i}`} position={[(i%2)*0.55-0.28,0,-1.1-Math.floor(i/2)]}><Cylinder at={[0,0.85,0]} radius={0.18} height={1.15} color="#49708A" /><mesh position={[0,1.55,0]}><sphereGeometry args={[0.16,12,10]}/><meshStandardMaterial color="#D5A783"/></mesh></group>)}
        {Array.from({length: Math.min(object.officeStaff ?? 2, 4)}, (_,i) => <group key={`staff-${i}`} position={[-1.2+i*0.8,floor, shellCenterZ-0.25]}><Cylinder at={[0,0.92,0]} radius={0.18} height={0.8} color="#34566E"/><mesh position={[0,1.48,0]}><sphereGeometry args={[0.16,12,10]}/><meshStandardMaterial color="#D5A783"/></mesh></group>)}
      </>}
      {/* Entry status and highly legible wayfinding banner. */}
      <Box size={[Math.min(width-0.4, 4.8), 0.42, 0.1]} at={[0, overallHeight > 3 ? 3.18 : shellHeight + 0.12, shellCenterZ + shellDepth/2+0.08]} color="#1E3A8A" />
      <mesh position={[0, shellHeight + 0.12, shellCenterZ + shellDepth/2 + 0.15]}>
        <planeGeometry args={[Math.min(width-0.6,4.5),0.3]}/><meshBasicMaterial color="#FFFFFF" toneMapped={false}/>
      </mesh>
      <Box size={[0.6, 0.25, 0.04]} at={[width/2-0.38, floor+1.5, 0]} color={object.officeStatus === 'closed' ? '#8A2929' : '#1D6A4A'} />
      {windowOpen && <Box size={[0.9,0.45,0.04]} at={[0,floor+1.7,0.01]} color="#559BB1" opacity={0.35}/>}
      {!blindsOpen && Array.from({length:6},(_,i)=><Box key={`blind-${i}`} size={[0.9,0.025,0.025]} at={[-width/3,floor+1.55+i*0.07,0.13]} color="#87949A"/>)}
      {doorOpen && <Box size={[0.95,2.1,0.08]} at={[-width/2+0.6,floor+1.05,-0.48]} color="#688B9A" opacity={0.35}/>}
      {topDown && <Box size={[width,0.03,depth]} at={[0,0.02,shellCenterZ]} color="#163A53" opacity={0.18}/>}
    </group>
  );
}
