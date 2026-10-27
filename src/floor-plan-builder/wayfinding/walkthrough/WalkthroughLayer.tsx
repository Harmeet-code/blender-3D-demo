import { Profiler, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { AvatarObject } from '../../components/AvatarObject.tsx';
import { ProceduralObject } from '../../components/ProceduralObject.tsx';
import { createObject } from '../../model/inventory.ts';
import type { PlanDocument } from '../../model/types.ts';
import { usePlaybackStore, type PlaybackSession } from '../store/playback-store.ts';
import { advanceFollower } from './follower.ts';
import { AvatarRig } from './avatar-rig.ts';
import { CameraRig } from './CameraRig.tsx';

function Runtime({
  session,
  document,
  floorId,
  onFloor,
  originY,
}: {
  session: PlaybackSession;
  document: PlanDocument;
  floorId: string;
  onFloor: (id: string) => boolean | void;
  originY: number;
}) {
  const { runtime } = session;
  const root = useRef<Group>(null),
    body = useRef<Group>(null),
    callbacks = useRef(onFloor);
  callbacks.current = onFloor;
  const rig = useMemo(() => new AvatarRig(), []),
    lastSnapshot = useRef(0);
  const status = usePlaybackStore((state) => state.status),
    mode = usePlaybackStore((state) => state.mode);
  const activeFloor = usePlaybackStore((state) => state.snapshot.floorId);
  const get = useThree((state) => state.get),
    setFrameloop = useThree((state) => state.setFrameloop),
    invalidate = useThree((state) => state.invalidate);
  const avatar = useMemo(() => {
    const authored = session.document.floors
      .flatMap((floor) => floor.objects)
      .find((object) => object.recipe === 'avatar');
    return {
      ...(authored ?? createObject('avatar', [0, 0])),
      scale: [1, 1, 1] as [number, number, number],
      avatarAnimated: false,
      avatarPin: false,
      avatarPose: 'idle' as const,
    };
  }, [session.document]);
  useLayoutEffect(() => {
    if (body.current) {
      rig.bind(body.current);
    }
    invalidate();
  }, [runtime, rig, invalidate, originY]);
  useEffect(() => usePlaybackStore.subscribe(() => invalidate()), [invalidate]);
  useEffect(() => {
    const previous = get().frameloop;
    const update = () => {
      setFrameloop(status === 'playing' && !window.document.hidden ? 'always' : 'demand');
      invalidate();
    };
    update();
    window.document.addEventListener('visibilitychange', update);
    return () => {
      window.document.removeEventListener('visibilitychange', update);
      setFrameloop(previous);
    };
  }, [status, get, setFrameloop, invalidate]);
  useEffect(() => {
    if (
      activeFloor &&
      activeFloor !== floorId &&
      document.floors.some((floor) => floor.source.id === activeFloor)
    ) {
      if (callbacks.current(activeFloor) === false) {
        usePlaybackStore
          .getState()
          .fail('Apply or discard your draft edits before switching floors, then resume.');
      }
    }
  }, [activeFloor, floorId, document, status]);
  const originalFloor = useRef(session.initialFloor);
  useEffect(
    () => () => {
      callbacks.current(originalFloor.current);
    },
    [],
  );
  useFrame((_, rawDelta) => {
    const state = usePlaybackStore.getState();
    const dt = window.document.hidden ? 0 : Math.min(rawDelta, 0.1);
    if (state.status === 'playing') {
      let remaining = dt * state.speed;
      while (remaining > 1e-7) {
        const step = Math.min(1 / 120, remaining);
        advanceFollower(runtime, step);
        remaining -= step;
      }
    } else if (runtime.arrived && runtime.arrivalTime < 1.1) {
      runtime.arrivalTime += dt;
      invalidate();
    }
    if (root.current) {
      root.current.position.set(
        runtime.position[0],
        runtime.position[1] + originY,
        runtime.position[2],
      );
      root.current.rotation.y = runtime.yaw;
    }
    if (body.current) {
      body.current.visible = state.mode !== 'first';
      rig.update(runtime, originY);
    }

    lastSnapshot.current += dt;
    if (lastSnapshot.current >= 0.1 || (runtime.arrived && state.status === 'playing')) {
      lastSnapshot.current = 0;
      state.publish(runtime);
    }
  }, -3);
  // Upper floors render landing proxies. Retain the lower shaft during its traversal.
  const leg = runtime.path.legs.find(
    (candidate) =>
      (candidate.floorId === activeFloor && candidate.kind === 'elevator') ||
      (candidate.toFloorId === activeFloor && candidate.kind === 'elevator'),
  );
  const lower = leg?.connector;
  const lowerFloor = lower
    ? session.document.floors.find((floor) =>
        floor.objects.some((object) => object.id === lower.id),
      )
    : undefined;
  return (
    <>
      <group ref={root} name="WalkthroughAvatar" raycast={() => {}}>
        <group ref={body}>
          <AvatarObject object={avatar} color={avatar.avatarClothing} forceDetail />
        </group>
        {mode === 'overview' && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} raycast={() => {}}>
            <ringGeometry args={[0.32, 0.38, 24]} />
            <meshBasicMaterial
              color="#06B6D4"
              toneMapped={false}
              transparent
              opacity={0.85}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
      {lower && lowerFloor && lowerFloor.source.id !== floorId && (
        <group position={[0, lowerFloor.source.heightOffset + originY, 0]}>
          <ProceduralObject object={lower} color={lower.color} />
        </group>
      )}
      <CameraRig runtime={runtime} document={document} floorId={floorId} originY={originY} />
    </>
  );
}
export function WalkthroughLayer(props: {
  document: PlanDocument;
  floorId: string;
  onFloor: (id: string) => boolean | void;
  originY?: number;
}) {
  const session = usePlaybackStore((state) => state.session);
  if (!session) {
    return null;
  }
  const runtime = <Runtime {...props} originY={props.originY ?? 0} session={session} />;
  return import.meta.env.DEV ? (
    <Profiler
      id="WalkthroughRuntime"
      onRender={() => {
        session.runtime.renderCommits++;
      }}
    >
      {runtime}
    </Profiler>
  ) : (
    runtime
  );
}
