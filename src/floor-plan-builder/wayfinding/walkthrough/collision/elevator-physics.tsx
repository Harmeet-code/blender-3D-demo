import { useLayoutEffect, useRef } from 'react';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { circulationDesign } from '../../../model/circulation.ts';
import type { ConnectorRecord } from '../connectors/connector-runtime.ts';

export interface ElevatorPhysicsHandle {
  /** Absolute physics-frame cabin floor origin. Doors can open only at a stop. */
  setPose(y: number, open: number): boolean;
  rollback(): void;
  getCabinY(): number;
  getDoorOpen(): number;
}

/** Recipe-aligned compound cabin, enclosing shaft and interlocked landing leaves.
 * All movement is position-kinematic; the passenger keeps its own character controller.
 */
export function ElevatorPhysics({ record, originY, register }: {
  record: ConnectorRecord; originY: number; register: (handle: ElevatorPhysicsHandle | null) => void;
}) {
  const cabin = useRef<RapierRigidBody>(null);
  const doors = useRef<(RapierRigidBody | null)[]>([]);
  const geometry = record.elevator!;
  const object = geometry.object;
  const [w, rise, d] = object.dimensions;
  const [x,z] = object.position, yaw = object.yawRadians;
  const base = geometry.baseY + originY;
  const stops = [base, base + rise];
  const initial = base + (circulationDesign(object).cabinLevel === 'upper' ? rise : 0);
  const pose = useRef({y: initial, open: 0});
  const previousPose = useRef(pose.current);
  const worldPoint = (px: number, y: number, pz: number) => ({
    x: x + Math.cos(yaw)*px + Math.sin(yaw)*pz,
    y, z: z - Math.sin(yaw)*px + Math.cos(yaw)*pz,
  });
  useLayoutEffect(() => {
    register({ rollback() {
      const previous = previousPose.current;
      cabin.current?.setTranslation({x,y:previous.y,z}, true);
      cabin.current?.setNextKinematicTranslation({x,y:previous.y,z});
      const level = stops.findIndex((stop) => Math.abs(stop-previous.y)<0.001);
      const open = previous.open;
      const eased = open < 0.5 ? 4*open**3 : 1-(-2*open+2)**3/2;
      doors.current.forEach((body,index) => {
        const landing = Math.floor(index/2), side = index%2 ? 1 : -1;
        const target = worldPoint(side*(0.3+0.6*(landing === level ? eased : 0)),stops[landing]!,d/2-0.015);
        body?.setTranslation(target,true);
        body?.setNextKinematicTranslation(target);
      });
      pose.current = previous;
    }, getDoorOpen: () => pose.current.open, getCabinY: () => pose.current.y, setPose(y, open) {
      if (!cabin.current || doors.current.filter(Boolean).length !== 4 || !Number.isFinite(y) || !Number.isFinite(open) || open < 0 || open > 1 || y < base - 0.001 || y > base + rise + 0.001) {return false;}
      const level = stops.findIndex((stop) => Math.abs(stop-y)<0.001);
      if (open > 0 && level < 0) {return false;}
      if (Math.abs(y-pose.current.y)>0.001 && (open>0 || pose.current.open>0.0001)) {return false;}
      previousPose.current = pose.current;
      cabin.current.setNextKinematicTranslation({x,y,z});
      const eased = open < 0.5 ? 4*open**3 : 1-(-2*open+2)**3/2;
      doors.current.forEach((body,index) => {
        const landing = Math.floor(index/2), side = index%2 ? 1 : -1;
        body?.setNextKinematicTranslation(worldPoint(side*(0.3+0.6*(landing === level ? eased : 0)),stops[landing]!,d/2-0.015));
      });
      pose.current = {y,open};
      return true;
    }});
    return () => register(null);
  });
  const box = (key: string, half: [number,number,number], position: [number,number,number]) =>
    <CuboidCollider key={key} args={half} position={position} friction={0} />;
  return <>
    <RigidBody ref={cabin} type="kinematicPosition" colliders={false} position={[x,initial,z]} rotation={[0,yaw,0]}>
      {box('floor',[(w-0.35)/2,0.03,(d-0.35)/2],[0,0.03,0])}
      {box('roof',[(w-0.35)/2,0.04,(d-0.35)/2],[0,2.4,0])}
      {box('back',[(w-0.42)/2,1.15,0.009],[0,1.2,-d/2+0.2])}
      {[-1,1].map((side) => box(`side:${side}`,[0.006,1.15,(d-0.4)/2],[side*(w/2-0.2),1.2,0]))}
    </RigidBody>
    <RigidBody type="fixed" colliders={false} position={[x,base,z]} rotation={[0,yaw,0]}>
      {[-1,1].map((side) => box(`shaft:${side}`,[0.025,(rise+2.6)/2,d/2],[side*(w/2-0.06),(rise+2.6)/2,0]))}
      {box('shaft-back',[w/2,(rise+2.6)/2,0.025],[0,(rise+2.6)/2,-d/2+0.06])}
      {[0,rise].flatMap((height) => [
        ...[-1,1].map((side) => box(`jamb:${height}:${side}`,[(w-1.2)/4,1.1,0.045],[side*(0.6+(w-1.2)/4),height+1.1,d/2])),
        box(`header:${height}`,[0.675,0.06,0.06],[0,height+2.16,d/2]),
      ])}
    </RigidBody>
    {stops.flatMap((height,landing) => [-1,1].map((side,index) => {
      const position = worldPoint(side*0.3,height,d/2-0.015);
      return <RigidBody key={`${landing}:${side}`} ref={(body) => {doors.current[landing*2+index]=body;}}
        type="kinematicPosition" colliders={false} position={[position.x,position.y,position.z]} rotation={[0,yaw,0]}>
        <CuboidCollider args={[0.3,1.05,0.02]} position={[0,1.05,0]} friction={0} />
      </RigidBody>;
    }))}
  </>;
}
