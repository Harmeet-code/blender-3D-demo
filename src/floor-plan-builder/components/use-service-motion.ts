import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Frustum, Matrix4, Sphere, Vector3, type Group } from 'three';

/** Continuous details must explicitly wake demand canvases, and sleep in hidden tabs. */
export function useServiceMotion(active: boolean, root?: RefObject<Group | null>, radius = 3) {
  const invalidate = useThree((state) => state.invalidate);
  const [allowed, setAllowed] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden,
  );
  const visible = useRef(true);
  const bounds = useMemo(
    () => ({
      frustum: new Frustum(),
      matrix: new Matrix4(),
      sphere: new Sphere(),
      scale: new Vector3(),
    }),
    [],
  );
  useFrame(({ camera }) => {
    if (!root?.current) {
      return;
    }
    const node = root.current;
    node.getWorldPosition(bounds.sphere.center);
    node.getWorldScale(bounds.scale);
    bounds.sphere.radius = radius * Math.max(bounds.scale.x, bounds.scale.y, bounds.scale.z);
    bounds.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    bounds.frustum.setFromProjectionMatrix(bounds.matrix);
    visible.current = node.visible && bounds.frustum.intersectsSphere(bounds.sphere);
  });
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAllowed(!media.matches && !document.hidden);
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  useEffect(() => {
    invalidate();
  }, [active, allowed, invalidate]);
  return { animate: active && allowed, visible, invalidate };
}
