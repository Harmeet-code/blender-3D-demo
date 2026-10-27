import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { gsap } from 'gsap';
import { Object3D, type Group, type InstancedMesh, type MeshBasicMaterial } from 'three';
import { usePlaybackStore } from '../store/playback-store.ts';
import type { Follower } from '../walkthrough/follower.ts';
import { useRouteMotion } from '../rendering/use-route-motion.ts';

export function ArrivalEffect({
  runtime,
  originY,
  count,
}: {
  runtime: Follower;
  originY: number;
  count: number;
}) {
  const status = usePlaybackStore((state) => state.status),
    comfort = usePlaybackStore((state) => state.comfort);
  const root = useRef<Group>(null),
    particles = useRef<InstancedMesh>(null),
    ring = useRef<Group>(null),
    material = useRef<MeshBasicMaterial>(null);
  const progress = useMemo(() => ({ t: 1 }), []),
    dummy = useMemo(() => new Object3D(), []),
    motion = useRouteMotion();
  const invalidate = useThree((state) => state.invalidate);
  const quiet = comfort || motion.reduced;
  useEffect(() => {
    if (status !== 'arrived') {
      progress.t = 1;
      invalidate();
      return;
    }
    progress.t = 0;
    const tween = gsap.to(progress, {
      t: 1,
      duration: quiet ? 0.8 : 1.6,
      ease: 'power1.out',
      onUpdate: invalidate,
    });
    return () => {
      tween.kill();
    };
  }, [status, runtime, progress, quiet, invalidate]);
  useFrame(() => {
    if (!root.current) {
      return;
    }
    root.current.visible = progress.t < 1 && motion.visible;
    root.current.position.set(
      runtime.position[0],
      runtime.position[1] + originY + 0.03,
      runtime.position[2],
    );
    if (ring.current) {
      ring.current.scale.setScalar(quiet ? 1 : 1 + progress.t * 2.5);
    }
    if (material.current) {
      material.current.opacity = (1 - progress.t) * 0.8;
    }
    if (particles.current) {
      particles.current.visible = !quiet;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.39996,
          radius = progress.t * (0.6 + (i % 5) * 0.25);
        dummy.position.set(
          Math.cos(angle) * radius,
          Math.max(0, Math.sin(progress.t * Math.PI) * (1 + (i % 3) * 0.3)),
          Math.sin(angle) * radius,
        );
        dummy.rotation.set(i + progress.t * 3, angle, progress.t * 2);
        dummy.scale.setScalar((1 - progress.t) * 0.07);
        dummy.updateMatrix();
        particles.current.setMatrixAt(i, dummy.matrix);
      }
      particles.current.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <group ref={root} visible={false} name="ArrivalCelebration" raycast={() => {}}>
      <group ref={ring}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial
            ref={material}
            color={[2.5, 1.2, 0.2]}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <instancedMesh ref={particles} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={[2, 1.3, 0.4]} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
