import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Mesh } from 'three';
import type { AvatarState } from '@/features/building/model/building-schema.ts';
import { MathUtils } from 'three';
import { frameRuntime } from '../model/frame-runtime.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';

function RemoteAvatar({ target }: { target: AvatarState }) {
  const mesh = useRef<Mesh>(null);
  const gl = useThree((s) => s.gl);
  const current = useRef<AvatarState>({ ...target, position: [...target.position] });
  const latest = useRef<AvatarState>(target);
  latest.current = target;
  useEffect(() => () => frameRuntime.release(`remote:${target.id}`), [target.id]);

  useFrame((_, delta) => {
    const smoothing = 1 - Math.exp(-10 * Math.min(delta, 0.1));
    const pose = current.current;
    for (let i = 0; i < 3; i++) {
      pose.position[i] = MathUtils.lerp(pose.position[i]!, latest.current.position[i]!, smoothing);
    }
    const difference = Math.atan2(
      Math.sin(latest.current.rotationY - pose.rotationY),
      Math.cos(latest.current.rotationY - pose.rotationY),
    );
    pose.rotationY += difference * smoothing;
    const error = Math.hypot(
      pose.position[0] - latest.current.position[0],
      pose.position[1] - latest.current.position[1],
      pose.position[2] - latest.current.position[2],
    );
    if (error > 0.0001 || Math.abs(difference) > 0.0001) {
      frameRuntime.wake(`remote:${target.id}`, 100);
      gl.shadowMap.needsUpdate = true;
    } else {
      pose.position[0] = latest.current.position[0];
      pose.position[1] = latest.current.position[1];
      pose.position[2] = latest.current.position[2];
      pose.rotationY = latest.current.rotationY;
      frameRuntime.release(`remote:${target.id}`);
    }
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
