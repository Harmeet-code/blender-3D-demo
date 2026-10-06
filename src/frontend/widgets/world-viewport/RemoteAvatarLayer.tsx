import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { AvatarState } from '../../entities/building/model/building-schema.ts';
import { interpolateAvatar } from '../../entities/viewer/model/interpolate-avatar.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

function RemoteAvatar({ target }: { target: AvatarState }) {
  const mesh = useRef<Mesh>(null);
  const current = useRef<AvatarState>(target);
  const latest = useRef<AvatarState>(target);
  latest.current = target;

  useFrame((_, delta) => {
    const smoothing = 1 - Math.exp(-10 * Math.min(delta, 0.1));
    current.current = interpolateAvatar(current.current, latest.current, smoothing);
    const node = mesh.current;
    if (node) {
      node.position.set(
        current.current.position[0],
        current.current.position[1],
        current.current.position[2],
      );
      node.rotation.y = current.current.rotationY;
    }
  });

  return (
    <mesh ref={mesh} castShadow>
      <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
      <meshStandardMaterial color="#f0abfc" />
    </mesh>
  );
}

/** Render-only interpolated remote avatars on the active floor. */
export function RemoteAvatarLayer() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const remoteAvatars = useWorldStore((s) => s.remoteAvatars);
  const visible = Array.from(remoteAvatars.values()).filter(
    (avatar: AvatarState) => avatar.floorId === currentFloorId,
  );
  return (
    <group>
      {visible.map((avatar: AvatarState) => (
        <RemoteAvatar key={avatar.id} target={avatar} />
      ))}
    </group>
  );
}
