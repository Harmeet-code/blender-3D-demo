import { Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { InterleavedBufferAttribute } from 'three';
import type { Line2 } from 'three/addons/lines/Line2.js';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { avatarRuntime } from '@/features/viewer/model/avatar-runtime.ts';

export function PathLine({
  points,
  trackAvatar = false,
}: {
  points: Array<[number, number, number]>;
  trackAvatar?: boolean;
}) {
  const line = useRef<Line2 | LineSegments2>(null);
  const previousSegment = useRef(-1);
  useEffect(() => {
    previousSegment.current = -1;
  }, [points]);
  useFrame(() => {
    if (!trackAvatar || !line.current || points.length < 2) {
      return;
    }
    const starts = line.current.geometry.getAttribute(
      'instanceStart',
    ) as InterleavedBufferAttribute;
    if (!starts?.data) {
      return;
    }
    const segment = Math.min(points.length - 2, Math.max(0, avatarRuntime.cursor - 1));
    const values = starts.data.array;
    starts.data.clearUpdateRanges();
    if (previousSegment.current !== segment) {
      // Shift the instance attributes at waypoint boundaries. Avoid zero-length
      // segments, whose normalized directions can produce invalid shader values.
      line.current.geometry.setAttribute(
        'instanceStart',
        new InterleavedBufferAttribute(starts.data, 3, segment * 6),
      );
      line.current.geometry.setAttribute(
        'instanceEnd',
        new InterleavedBufferAttribute(starts.data, 3, segment * 6 + 3),
      );
      line.current.geometry.instanceCount = points.length - 1 - segment;
    }
    previousSegment.current = segment;
    const offset = segment * 6;
    const [x, y, z] = avatarRuntime.position;
    if (values[offset] !== x || values[offset + 1] !== y - 0.95 || values[offset + 2] !== z) {
      values[offset] = x;
      values[offset + 1] = y - 0.95;
      values[offset + 2] = z;
      starts.data.addUpdateRange(offset, 3);
    }
    if (starts.data.updateRanges.length) {
      starts.data.needsUpdate = true;
    }
  });
  if (points.length < 2) {
    return null;
  }
  return <Line ref={line} points={points} color="#22ff88" lineWidth={3} dashed={false} />;
}
