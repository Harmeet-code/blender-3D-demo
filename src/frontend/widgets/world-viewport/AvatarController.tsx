import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

const AUTOPILOT_SPEED = 3;

/** WASD capsule avatar stub with autopilot route following. */
export function AvatarController() {
  const body = useRef<RapierRigidBody>(null);
  const localAvatar = useWorldStore((s) => s.localAvatar);

  useFrame((_, delta) => {
    const { autopilot, advanceAutopilot } = useWorldStore.getState();
    if (!autopilot) {
      return;
    }
    const current = useWorldStore.getState().localAvatar.position;
    advanceAutopilot(current, AUTOPILOT_SPEED * Math.min(delta, 0.1));
    const next = useWorldStore.getState().localAvatar.position;
    body.current?.setTranslation({ x: next[0], y: next[1], z: next[2] }, true);
  });

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={localAvatar.position}
      enabledRotations={[false, true, false]}
    >
      <CuboidCollider args={[0.4, 0.9, 0.4]} />
      <mesh castShadow>
        <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
        <meshStandardMaterial color="#7dd3fc" />
      </mesh>
    </RigidBody>
  );
}
