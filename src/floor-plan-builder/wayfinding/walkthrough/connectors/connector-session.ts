import { CHARACTER_CONFIG } from '../character-config.ts';
import {
  resolveConnectorTraversal, sampleConnectorTraversal,
  type ConnectorFrame, type ConnectorTraversalRequest,
} from './connector-runtime.ts';

/** One session per route leg. Recreate after document, role or collision-world changes.
 * The caller applies only returned feet to the shared capsule's kinematic target.
 * Never apply sampleConnectorTraversal directly: it is a timeline, not a collision gate.
 */
export function createConnectorSession(
  request: ConnectorTraversalRequest,
  policyStatus: 'resolved' | 'unavailable',
) {
  const plan = resolveConnectorTraversal(request);
  let elapsed = 0;
  let started = false;
  let frame: ConnectorFrame = 'stage' in plan ? plan : sampleConnectorTraversal(plan, 0);
  if (policyStatus !== 'resolved') {
    frame = { ...frame, stage: 'blocked', walking: false, reason: 'Connector role policy is unavailable.' };
  }
  const block = (reason: string) => {
    frame = { ...frame, stage: 'blocked', walking: false, reason };
    return frame;
  };
  return {
    getFrame: () => frame,
    acceptResolvedFeet(feet: readonly [number, number, number]) {
      if (!('stage' in plan) && plan.kind === 'elevator' && (frame.stage === 'board' || frame.stage === 'exit')) {
        // Spend only physically achieved horizontal boarding distance. Sill contact
        // must delay door closure, never accumulate a catch-up displacement.
        const lag = Math.hypot(frame.feet[0] - feet[0], frame.feet[2] - feet[2]);
        elapsed = Math.max(0, elapsed - lag / 1.2);
        frame = { ...frame, feet: [...feet] };
      }
    },
    restart: () => {
      elapsed = 0;
      started = false;
      frame = 'stage' in plan ? plan : sampleConnectorTraversal(plan, 0);
      if (policyStatus !== 'resolved') {block('Connector role policy is unavailable.');}
    },
    stop: () => block('Connector traversal cancelled; retain the last accepted capsule pose.'),
    /** Large/resumed frame gaps stop safely rather than jumping across a connector. */
    advance(deltaSeconds: number): ConnectorFrame {
      if (frame.stage === 'blocked' || frame.stage === 'complete' || 'stage' in plan) {return frame;}
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 0.25) {
        return block('Connector time step is invalid or exceeds 0.25 seconds.');
      }
      if (!started && plan.kind === 'elevator' && request.getElevatorCabinY) {
        const y = request.getElevatorCabinY();
        if (y === undefined || !Number.isFinite(y)) {return block('Elevator cabin pose is unavailable.');}
        plan.initialCabinY = y;
        plan.initialDoorOpen = request.getElevatorDoorOpen?.() ?? 0;
      }
      started = true;
      // Bounded sampling also rechecks stationary wait/door stages against dynamic obstacles.
      const steps = Math.max(1, Math.ceil(deltaSeconds * plan.speedMps / (CHARACTER_CONFIG.radiusM / 2)));
      for (let i = 0; i < steps; i++) {
        const nextTime = elapsed + deltaSeconds / steps;
        const next = sampleConnectorTraversal(plan, nextTime);
        try {
          const sweep = request.validateSweep(frame.feet, next.feet);
          if (!sweep.clear) {return block(sweep.reason ?? 'Connector capsule sweep blocked.');}
          if (next.stage === 'complete') {
            const landing = request.validateEndpoint(plan.to.floorId, next.feet);
            if (!landing.clear) {return block(landing.reason ?? 'Connector destination landing blocked.');}
          }
        } catch {
          return block('Connector collision validation is unavailable.');
        }
        elapsed = nextTime;
        frame = next;
      }
      return frame;
    },
  };
}
