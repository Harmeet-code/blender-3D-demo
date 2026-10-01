import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

/** WASD capsule avatar stub. Physics + orbit camera wired via Rapier. */
export function AvatarController() {
  const body = useRef<RapierRigidBody>(null);
  const localAvatar = useWorldStore((s) => s.localAvatar);

  useFrame(() => {
    // Movement input (WASD) + socket broadcast hook goes here.
    void body;
    void localAvatar;
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
