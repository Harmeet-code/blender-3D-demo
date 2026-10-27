import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial } from 'three';
import { gsap } from 'gsap';
import { buildRibbonGeometry } from './ribbon-geometry.ts';
import { useRouteMotion } from './use-route-motion.ts';

const VERTEX = /* glsl */ `
  attribute float aS;
  attribute float aSide;
  attribute vec3 aCenter;
  attribute vec3 aOffset;
  uniform float uViewportHeight;
  uniform float uPerspective;
  varying float vS;
  varying float vSide;
  void main() {
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    float metresPerPixel = 2.0 * mix(1.0, max(0.01, -centerView.z), uPerspective)
      / (projectionMatrix[1][1] * max(1.0, uViewportHeight));
    float width = clamp(0.5, 7.0 * metresPerPixel, 30.0 * metresPerPixel);
    vec3 expanded = aCenter + aOffset * width * 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
    vS = aS; vSide = aSide;
  }
`;
const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uTotal;
  uniform float uDraw;
  uniform float uProgress;
  uniform float uRouteLength;
  uniform float uStart;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vS;
  varying float vSide;
  void main() {
    float s = uStart + vS;
    if (s > uDraw * max(uRouteLength, 0.001)) discard;
    float edge = abs(vSide);
    float aa = max(fwidth(vSide), 0.015);
    float outline = 1.0 - smoothstep(1.0-aa*2.0, 1.0, edge);
    float chevronPhase = fract(s / 1.3 - uTime * 0.65);
    float chevron = 1.0 - smoothstep(0.045, 0.1, abs(chevronPhase - (0.65 - edge*0.38)));
    float core = 1.0 - smoothstep(0.58, 1.0, edge);
    vec3 color = mix(uColor*0.55, vec3(0.95), chevron*0.9) + uColor*core*0.3;
    float walked = step(s + 0.001, uProgress * uRouteLength);
    color = mix(color, vec3(0.08,0.13,0.17), walked*0.82);
    float fadeLength = min(0.35, uTotal*0.2);
    float ends = smoothstep(0.0,fadeLength,vS) * (1.0-smoothstep(uTotal-fadeLength,uTotal,vS));
    gl_FragColor = vec4(color, uOpacity * outline * ends * (0.45+core*0.5));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface RibbonPath {
  key: string;
  points: [number, number][];
  y?: number;
  color?: string;
  faint?: boolean;
  startDistance?: number;
  routeLength?: number;
}
type Entry = { id: string; path: RibbonPath; retiring: boolean };
function pathIdentity(path: RibbonPath) {
  return `${path.key}:${path.y ?? 0.025}:${path.points.map((point) => point.join(',')).join(';')}`;
}

function RibbonMesh({
  entry,
  flow,
  progress: walked,
  topDown,
  onRetired,
  progressSource,
}: {
  entry: Entry;
  flow: boolean;
  progress: number;
  topDown: boolean;
  onRetired: (id: string) => void;
  progressSource?: { progress: number } | null;
}) {
  const { path, retiring, id } = entry;
  const invalidate = useThree((state) => state.invalidate);
  const motion = useRouteMotion(flow);
  const phase = useRef({ draw: 0, fade: 0 });
  const built = useMemo(() => {
    const data = buildRibbonGeometry(path.points, path.y ?? 0.025, 0.5);
    if (!data) {
      return null;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3));
    geometry.setAttribute('aCenter', new BufferAttribute(data.centers, 3));
    geometry.setAttribute('aOffset', new BufferAttribute(data.offsets, 3));
    geometry.setAttribute('aS', new BufferAttribute(data.distances, 1));
    geometry.setAttribute('aSide', new BufferAttribute(data.sides, 1));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    return { geometry, total: data.totalLength };
  }, [path.points, path.y]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uTotal: { value: built?.total ?? 0 },
          uDraw: { value: 0 },
          uProgress: { value: 0 },
          uRouteLength: { value: 0 },
          uStart: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: new Color('#1688EB') },
          uViewportHeight: { value: 1 },
          uPerspective: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: DoubleSide,
        toneMapped: false,
      }),
    [built],
  );
  useEffect(
    () => () => {
      built?.geometry.dispose();
      material.dispose();
    },
    [built, material],
  );
  useLayoutEffect(() => {
    phase.current.draw = motion.reduced ? 1 : 0;
    const tween = gsap.to(phase.current, {
      draw: 1,
      duration: motion.reduced ? 0 : 0.6,
      ease: 'power2.out',
      onUpdate: invalidate,
    });
    invalidate();
    return () => {
      tween.kill();
    };
  }, [built, motion.reduced, invalidate]);
  useEffect(() => {
    const tween = gsap.to(phase.current, {
      fade: retiring ? 0 : path.faint ? 0.16 : 1,
      duration: motion.reduced ? 0 : 0.6,
      ease: 'power1.out',
      onUpdate: invalidate,
      onComplete: () => {
        if (retiring) {
          onRetired(id);
        }
      },
    });
    invalidate();
    return () => {
      tween.kill();
    };
  }, [retiring, path.faint, id, onRetired, motion.reduced, invalidate]);
  useFrame(({ camera, size }, delta) => {
    if (!built) {
      return;
    }
    const u = material.uniforms;
    if (motion.animate && !retiring) {
      u.uTime!.value += Math.min(delta, 0.05);
    }
    u.uDraw!.value = phase.current.draw;
    u.uOpacity!.value = phase.current.fade;
    u.uProgress!.value = Math.min(1, Math.max(0, progressSource?.progress ?? walked));
    u.uTotal!.value = built.total;
    u.uStart!.value = path.startDistance ?? 0;
    u.uRouteLength!.value = path.routeLength ?? built.total;
    u.uViewportHeight!.value = size.height;
    u.uPerspective!.value = camera.type === 'PerspectiveCamera' ? 1 : 0;
    (u.uColor!.value as Color).set(path.color ?? '#1688EB');
    material.depthTest = !topDown && !path.faint;
    if (motion.animate && !retiring) {
      invalidate();
    }
  });
  if (!built) {
    return null;
  }
  return (
    <mesh
      name="RouteRibbonStrip"
      geometry={built.geometry}
      material={material}
      renderOrder={20}
      frustumCulled={false}
      raycast={() => {}}
    />
  );
}

/** Retiring strips keep their mesh/uniform owner until the fade completes. */
export function RouteRibbon({
  paths,
  flow = true,
  progress = 0,
  topDown = false,
  progressSource,
}: {
  paths: RibbonPath[];
  flow?: boolean;
  progress?: number;
  topDown?: boolean;
  progressSource?: { progress: number } | null;
}) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    paths.map((path) => ({ id: pathIdentity(path), path, retiring: false })),
  );
  useLayoutEffect(() => {
    const ids = new Set(paths.map(pathIdentity));
    setEntries((previous) => [
      ...paths.map((path) => ({ id: pathIdentity(path), path, retiring: false })),
      ...previous
        .filter((entry) => !ids.has(entry.id))
        .slice(-64)
        .map((entry) => Object.assign({}, entry, { retiring: true })),
    ]);
  }, [paths]);
  const onRetired = useCallback(
    (id: string) =>
      setEntries((current) => current.filter((entry) => entry.id !== id || !entry.retiring)),
    [],
  );
  return (
    <group name="RouteRibbon">
      {entries.map((entry) => (
        <RibbonMesh
          key={entry.id}
          entry={entry}
          flow={flow}
          progress={progress}
          topDown={topDown}
          onRetired={onRetired}
          progressSource={progressSource}
        />
      ))}
    </group>
  );
}
