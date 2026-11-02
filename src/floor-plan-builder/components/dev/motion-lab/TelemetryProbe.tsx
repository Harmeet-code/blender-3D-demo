import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { PlanDocument } from '../../../model/types.ts';
import { buildCollisionMap, validateCapsuleEndpoint, validateCapsuleSweep, type RoleAreaPolicy } from '../../../wayfinding/walkthrough/collision/capsule-clearance.ts';
import { CHARACTER_CONFIG } from '../../../wayfinding/walkthrough/character-config.ts';
import { sampleFootPlants, sampleGait, createFootPlantState } from '../../../wayfinding/walkthrough/rendering/gait.ts';
import { telemetryFrameSchema, type Role, type TelemetryFrame } from '../../../wayfinding/walkthrough/contracts.ts';
import { usePlaybackStore } from '../../../wayfinding/store/playback-store.ts';
import type { Vec3 } from '../../../wayfinding/walkthrough/path.ts';

export type MotionLabTelemetry = {
  frame: TelemetryFrame;
  accelerationMps2: Vec3;
  jerkMps3: Vec3;
  gazeDirection: Vec3;
  feet: { left: Vec3; right: Vec3; stance: [boolean, boolean]; basis: 'shared-gait-phase-estimate' | 'idle-foot-origin' | 'connector-foot-data-unavailable' };
  clearance: { clear: boolean | null; blockerId?: string; source?: string; reason?: string; numericMarginM: null };
  floorInteraction: { floorId: string; elevationM: number; changedFromFloorId?: string; connectorId?: string; connectorPhase: string | null };
  contactBasis: 'gait-phase-estimate-not-physics-contact';
  playbackGeneration?: number;
  derivativeResetReason?: 'playback-generation' | 'floor-transition' | 'invalid-delta' | null;
};

export type RecordedInput = { tick: number; forward: -1 | 0 | 1; strafe: -1 | 0 | 1; sprint: boolean };
export type MotionLabInputState = { forward: -1 | 0 | 1; strafe: -1 | 0 | 1; sprint: boolean };

function inputCodes(sample: MotionLabInputState) {
  return new Set([
    ...(sample.forward > 0 ? ['KeyW'] : []),
    ...(sample.forward < 0 ? ['KeyS'] : []),
    ...(sample.strafe > 0 ? ['KeyD'] : []),
    ...(sample.strafe < 0 ? ['KeyA'] : []),
    ...(sample.sprint ? ['ShiftLeft'] : []),
  ]);
}

function dispatchCode(type: 'keydown' | 'keyup', code: string) {
  const key = code === 'ShiftLeft' ? 'Shift' : code.slice(-1).toLowerCase();
  window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
}

/** Records and replays fixed 30 Hz held-input samples into the shared manual-input hook. */
export function MotionLabInputProbe({
  captureMode,
  heldInput,
  tape,
  replayEpoch,
  onSampleCount,
  onReplayComplete,
}: {
  captureMode: MutableRefObject<'idle' | 'record' | 'replay'>;
  heldInput: MutableRefObject<MotionLabInputState>;
  tape: MutableRefObject<RecordedInput[]>;
  replayEpoch: MutableRefObject<number>;
  onSampleCount: (count: number) => void;
  onReplayComplete: () => void;
}) {
  const accumulator = useRef(0);
  const replayIndex = useRef(0);
  const lastEpoch = useRef(replayEpoch.current);
  const replayHeld = useRef(new Set<string>());
  const publishElapsed = useRef(0);
  const releaseReplayKeys = () => {
    for (const code of replayHeld.current) dispatchCode('keyup', code);
    replayHeld.current.clear();
  };
  useEffect(() => {
    const clear = () => {
      accumulator.current = 0;
      releaseReplayKeys();
    };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      releaseReplayKeys();
      captureMode.current = 'idle';
    };
  }, []);
  useFrame((_, delta) => {
    if (lastEpoch.current !== replayEpoch.current) {
      lastEpoch.current = replayEpoch.current;
      replayIndex.current = 0;
      accumulator.current = 0;
      releaseReplayKeys();
    }
    accumulator.current += Math.min(Math.max(delta, 0), 0.25);
    let steps = 0;
    while (accumulator.current >= MOTION_LAB_DT && steps < 8) {
      if (captureMode.current === 'record') {
        tape.current.push({ tick: tape.current.length, ...heldInput.current });
      } else if (captureMode.current === 'replay') {
        const sample = tape.current[replayIndex.current++];
        if (!sample) {
          releaseReplayKeys();
          captureMode.current = 'idle';
          onReplayComplete();
        } else {
          const wanted = inputCodes(sample);
          for (const code of replayHeld.current) if (!wanted.has(code)) dispatchCode('keyup', code);
          for (const code of wanted) if (!replayHeld.current.has(code)) dispatchCode('keydown', code);
          replayHeld.current = wanted;
        }
      }
      accumulator.current -= MOTION_LAB_DT;
      steps++;
    }
    publishElapsed.current += delta;
    if (publishElapsed.current >= 0.2) {
      publishElapsed.current = 0;
      onSampleCount(tape.current.length);
    }
  });
  return null;
}

export function MotionLabTelemetryProbe({
  document,
  role,
  roleAreas = [],
  frames,
  onFrame,
}: {
  document: PlanDocument;
  role: Role;
  roleAreas?: readonly RoleAreaPolicy[];
  frames: MutableRefObject<MotionLabTelemetry[]>;
  onFrame: (frame: MotionLabTelemetry) => void;
}) {
  const maps = useMemo(() => new Map(document.floors.map((floor) => [floor.source.id, buildCollisionMap(floor, roleAreas)])), [document, roleAreas]);
  const tick = useRef(0);
  const last = useRef<{ position: Vec3; floorId: string; velocity: Vec3; acceleration: Vec3; traveledMeters: number; generation: number } | null>(null);
  const footPlant = useRef(createFootPlantState());
  const lastPublish = useRef(0);

  useFrame((_, rawDelta) => {
    const state = usePlaybackStore.getState();
    const session = state.session;
    if (!session) {
      last.current = null;
      return;
    }
    const runtime = session.runtime;
    const position: Vec3 = [...runtime.position];
    const floorId = runtime.floorId;
    const floor = document.floors.find((item) => item.source.id === floorId);
    const leg = runtime.path.legs[runtime.leg];
    const generationChanged = last.current?.generation !== session.generation;
    if (generationChanged) {
      last.current = { position, floorId, velocity: [0, 0, 0], acceleration: [0, 0, 0], traveledMeters: 0, generation: session.generation };
      footPlant.current = createFootPlantState();
      tick.current = 0;
      lastPublish.current = 0;
    }
    const previous = last.current!;
    const dtSeconds = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 0;
    const sameFloor = previous.floorId === floorId;
    const floorChanged = !sameFloor;
    const resetDerivatives = generationChanged || floorChanged || dtSeconds <= 0;
    const velocity: Vec3 = !generationChanged && sameFloor && dtSeconds > 0
      ? [(position[0] - previous.position[0]) / dtSeconds, (position[1] - previous.position[1]) / dtSeconds, (position[2] - previous.position[2]) / dtSeconds]
      : [0, 0, 0];
    const displacementMeters = generationChanged ? 0 : Math.hypot(position[0] - previous.position[0], position[1] - previous.position[1], position[2] - previous.position[2]);
    const traveledMeters = previous.traveledMeters + displacementMeters;
    const acceleration: Vec3 = !resetDerivatives && dtSeconds > 0
      ? [(velocity[0] - previous.velocity[0]) / dtSeconds, (velocity[1] - previous.velocity[1]) / dtSeconds, (velocity[2] - previous.velocity[2]) / dtSeconds]
      : [0, 0, 0];
    const jerk: Vec3 = !resetDerivatives && dtSeconds > 0
      ? [(acceleration[0] - previous.acceleration[0]) / dtSeconds, (acceleration[1] - previous.acceleration[1]) / dtSeconds, (acceleration[2] - previous.acceleration[2]) / dtSeconds]
      : [0, 0, 0];
    const locomotion: TelemetryFrame['locomotion'] = state.status === 'paused' && state.message
      ? 'blocked'
      : leg && leg.kind !== 'walk'
        ? 'connector'
        : runtime.speed > CHARACTER_CONFIG.walkSpeedMps + 0.01
          ? 'run'
          : runtime.speed > 0.02
            ? 'walk'
            : 'idle';
    const parsedFrame = telemetryFrameSchema.safeParse({
      tick: tick.current++,
      dtSeconds,
      floorId,
      position,
      velocity,
      yawRadians: runtime.yaw,
      traveledMeters,
      gaitDistanceMeters: runtime.gaitDistance,
      locomotion,
      ...(leg?.connector?.id ? { connectorId: leg.connector.id } : {}),
    });
    if (!parsedFrame.success) return;
    const frame = parsedFrame.data;
    const gazeVector: Vec3 = [runtime.look[0] - position[0], runtime.look[1] - position[1], runtime.look[2] - position[2]];
    const gazeLength = Math.hypot(...gazeVector);
    const gazeDirection: Vec3 = gazeLength > 1e-8 ? [gazeVector[0] / gazeLength, gazeVector[1] / gazeLength, gazeVector[2] / gazeLength] : [0, 0, -1];
    const gaitLocomotion = locomotion === 'connector' ? (leg?.kind === 'stairs' || leg?.kind === 'ramp' || leg?.kind === 'escalator' ? 'walk' : 'idle') : locomotion;
    const gait = sampleGait({ gaitDistanceM: runtime.gaitDistance, locomotion: gaitLocomotion, speedMps: runtime.speed, inclineRadians: Math.atan2(runtime.tangent[1], Math.hypot(runtime.tangent[0], runtime.tangent[2])) });
    const walking = gaitLocomotion === 'walk' || gaitLocomotion === 'run';
    const simpleWalkFeet = walking && leg?.kind === 'walk';
    const feet = simpleWalkFeet
      ? sampleFootPlants(footPlant.current, { rootPosition: position, groundY: floor?.source.heightOffset ?? position[1], yawRadians: runtime.yaw, phaseRadians: gait.phaseRadians })
      : ([[...position], [...position]] as [Vec3, Vec3]);
    if (!simpleWalkFeet) footPlant.current.stance = [false, false];
    const previousPosition: Vec3 = previous.position;
    const connectorTraversal = leg && leg.kind !== 'walk';
    const clearance = connectorTraversal
      ? { clear: null, reason: 'Connector-specific clearance is evaluated by the mounted WalkthroughLayer; floor-map clearance is unavailable here.' }
      : sameFloor && maps.has(floorId)
        ? validateCapsuleSweep(maps.get(floorId)!, role, previousPosition, position, CHARACTER_CONFIG)
        : floor && maps.has(floorId)
          ? validateCapsuleEndpoint(maps.get(floorId)!, role, position, CHARACTER_CONFIG)
          : { clear: false, reason: `Collision map for floor ${floorId} is unavailable.`, source: 'unknown-geometry' as const };
    const record: MotionLabTelemetry = {
      frame,
      accelerationMps2: acceleration,
      jerkMps3: jerk,
      gazeDirection,
      feet: { left: feet[0], right: feet[1], stance: [...footPlant.current.stance], basis: leg && leg.kind !== 'walk' ? 'connector-foot-data-unavailable' : walking ? 'shared-gait-phase-estimate' : 'idle-foot-origin' },
      clearance: { clear: clearance.clear, blockerId: clearance.blockerId, source: clearance.source, reason: clearance.reason, numericMarginM: null },
      floorInteraction: { floorId, elevationM: floor?.source.heightOffset ?? position[1], ...(sameFloor ? {} : { changedFromFloorId: previous.floorId }), ...(leg?.connector?.id ? { connectorId: leg.connector.id } : {}), connectorPhase: runtime.phase.includes('Elevator') || runtime.phase.includes('Stairs') || runtime.phase.includes('Ramp') || runtime.phase.includes('Escalator') ? runtime.phase : null },
      contactBasis: 'gait-phase-estimate-not-physics-contact',
      playbackGeneration: session.generation,
      derivativeResetReason: generationChanged ? 'playback-generation' : floorChanged ? 'floor-transition' : dtSeconds <= 0 ? 'invalid-delta' : null,
    };
    frames.current.push(record);
    if (frames.current.length > 30000) frames.current.shift();
    previous.position = position;
    previous.floorId = floorId;
    previous.velocity = velocity;
    previous.acceleration = acceleration;
    previous.traveledMeters = traveledMeters;
    previous.generation = session.generation;
    lastPublish.current += rawDelta;
    if (lastPublish.current >= 0.1) {
      lastPublish.current = 0;
      onFrame(record);
    }
  });
  return null;
}
