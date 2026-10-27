import { useEffect, useMemo, useRef } from 'react';
import {
  BallCollider,
  CapsuleCollider,
  ConvexHullCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierRigidBody,
  type IntersectionEnterPayload,
} from '@react-three/rapier';
import { ShapeUtils, Vector2 } from 'three';
import type { PlanDocument } from '../../model/types.ts';
import { objectPoints } from '../../model/geometry.ts';
import { entranceClearWidth } from '../../model/entrance.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { Follower } from '../walkthrough/follower.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
import { usePolishStore } from '../store/polish-store.ts';
import { proximityDoors } from './door-state.ts';

/** Sensor state is ephemeral. Navigation and authoring never read this visual door override. */
const isPlayer = (event: IntersectionEnterPayload) =>
  event.other.rigidBodyObject?.name === 'WalkthroughSensorBody';
function prism(polygon: [number, number][], baseY: number) {
  return new Float32Array(polygon.flatMap(([x, z]) => [x, baseY - 0.1, z, x, baseY + 1.9, z]));
}
function Sensors({
  document,
  floorId,
  originY,
  runtime,
  zones,
}: {
  document: PlanDocument;
  floorId: string;
  originY: number;
  runtime: Follower;
  zones: WalkableZone[];
}) {
  const { rapier } = useRapier(),
    body = useRef<RapierRigidBody>(null);
  const translation = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const overlaps = useRef(new Map<string, number>());
  const floor = document.floors.find((f) => f.source.id === floorId)!;
  const baseY = floor.source.heightOffset + originY;
  const shapes = useMemo(
    () =>
      zones
        .filter((zone) => zone.floorId === floorId)
        .flatMap((zone) => {
          const vertices = [...zone.polygon, ...zone.holes.flat()];
          return ShapeUtils.triangulateShape(
            zone.polygon.map(([x, z]) => new Vector2(x, z)),
            zone.holes.map((h) => h.map(([x, z]) => new Vector2(x, z))),
          ).map((triangle, index) => ({
            key: `${zone.id}:${index}`,
            id: zone.id,
            label: zone.name,
            points: prism(
              triangle.map((i) => vertices[i]!),
              baseY,
            ),
          }));
        }),
    [zones, floorId, baseY],
  );
  const doors = useMemo(
    () =>
      floor.objects
        .filter(
          (object) =>
            object.recipe === 'entrance' &&
            object.entranceGate === 'arch-sliding-doors' &&
            object.entranceOpen,
        )
        .map((object) => {
          const half = entranceClearWidth(object) / 2;
          const footprint = objectPoints(object, [
            [-half, -2.2],
            [half, -2.2],
            [half, 2.2],
            [-half, 2.2],
          ]);
          return { id: object.id, name: object.name, points: prism(footprint, baseY) };
        }),
    [floor, baseY],
  );
  useEffect(
    () => () => {
      proximityDoors.clear();
      overlaps.current.clear();
    },
    [runtime, floorId],
  );
  useBeforePhysicsStep(() => {
    const [x, y, z] = runtime.position;
    translation.x = x;
    translation.y = y + originY + 0.9;
    translation.z = z;
    body.current?.setNextKinematicTranslation(translation);
  });
  const enter = (id: string, label: string, event: IntersectionEnterPayload) => {
    if (!isPlayer(event)) {
      return;
    }
    const count = overlaps.current.get(id) ?? 0;
    overlaps.current.set(id, count + 1);
    if (!count) {
      usePolishStore.getState().announce(label);
    }
  };
  const exit = (id: string, event: IntersectionEnterPayload) => {
    if (isPlayer(event)) {
      overlaps.current.set(id, Math.max(0, (overlaps.current.get(id) ?? 1) - 1));
    }
  };
  return (
    <>
      <RigidBody
        ref={body}
        name="WalkthroughSensorBody"
        type="kinematicPosition"
        colliders={false}
        position={[runtime.position[0], runtime.position[1] + originY + 0.9, runtime.position[2]]}
      >
        <CapsuleCollider
          args={[0.5, 0.3]}
          sensor
          activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
        />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        {shapes.map((shape) => (
          <ConvexHullCollider
            key={shape.key}
            args={[shape.points]}
            sensor
            activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
            onIntersectionEnter={(event) => enter(shape.id, `Entering ${shape.label}`, event)}
            onIntersectionExit={(event) => exit(shape.id, event)}
          />
        ))}
        {runtime.path.legs
          .filter((leg) => leg.floorId === floorId)
          .flatMap((leg, index) =>
            leg.points.map((p, i) => (
              <BallCollider
                key={`waypoint-${index}-${i}`}
                args={[0.45]}
                position={[p[0], p[1] + originY + 0.9, p[2]]}
                sensor
                activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
                onIntersectionEnter={(event) => {
                  if (isPlayer(event)) {
                    usePolishStore
                      .getState()
                      .announce(
                        p === runtime.path.legs.at(-1)?.points.at(-1)
                          ? 'Approaching destination'
                          : `Waypoint ${index + 1}.${i + 1} reached`,
                      );
                  }
                }}
              />
            )),
          )}
        {doors.map((door) => (
          <ConvexHullCollider
            key={door.id}
            args={[door.points]}
            sensor
            activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
            onIntersectionEnter={(event) => {
              if (isPlayer(event)) {
                proximityDoors.add(door.id);
                usePolishStore.getState().announce(`${door.name} · automatic doors opening`);
              }
            }}
            onIntersectionExit={(event) => {
              if (isPlayer(event)) {
                proximityDoors.delete(door.id);
              }
            }}
          />
        ))}
      </RigidBody>
    </>
  );
}
export function WalkthroughSensors(props: {
  document: PlanDocument;
  floorId: string;
  originY: number;
  runtime: Follower;
  zones: WalkableZone[];
}) {
  const status = usePlaybackStore((state) => state.status);
  return (
    <Physics
      gravity={[0, 0, 0]}
      timeStep={1 / 60}
      updateLoop="independent"
      paused={status !== 'playing'}
      interpolate={false}
    >
      <Sensors {...props} />
    </Physics>
  );
}
