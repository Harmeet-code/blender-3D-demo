import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { QualityGovernor, useGraphicsQuality } from '../model/graphics-quality.ts';
/** A demand canvas samples only consecutive frames with actual camera movement. */
export function AdaptiveGraphics() {
  const last = useRef(new Vector3());
  const governor = useRef(new QualityGovernor());
  const previousFrame = useRef(0);
  useFrame(({ camera }, delta) => {
    const moving = last.current.distanceToSquared(camera.position) > 1e-10;
    last.current.copy(camera.position);
    const now = performance.now(),
      consecutive = previousFrame.current > 0 && now - previousFrame.current < 2000;
    previousFrame.current = now;
    if (moving && consecutive && useGraphicsQuality.getState().mode === 'auto') {
      governor.current.tier = useGraphicsQuality.getState().tier;
      const tier = governor.current.observe(delta * 1000);
      if (tier !== useGraphicsQuality.getState().tier) {
        useGraphicsQuality.setState({ tier });
      }
    }
  });
  return null;
}
