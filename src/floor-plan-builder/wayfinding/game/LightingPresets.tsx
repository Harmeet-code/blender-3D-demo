import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { ACESFilmicToneMapping, BackSide, Color, Object3D, type Mesh } from 'three';
import { QUALITY, type Lighting, type Tier } from '../store/polish-store.ts';
import type { PlanFloor } from '../../model/types.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';

const PRESETS = {
  day: {
    sky: '#CADDE4',
    ground: '#697C72',
    sun: '#FFF7EB',
    key: 1.8,
    fill: 0.45,
    exposure: 1,
    position: [0.55, 1.2, 0.6],
  },
  golden: {
    sky: '#D9B29B',
    ground: '#625E6A',
    sun: '#FFD09A',
    key: 2,
    fill: 0.4,
    exposure: 1,
    position: [-1.1, 0.65, 0.6],
  },
  evening: {
    sky: '#18263E',
    ground: '#35334B',
    sun: '#9FBFFF',
    key: 1.1,
    fill: 0.7,
    exposure: 1.15,
    position: [0.6, 0.8, -0.7],
  },
} as const;

/** Camera-centred sky has no assets, shadows, depth writes or interaction. */
function GradientSky({ lighting }: { lighting: Lighting }) {
  const mesh = useRef<Mesh>(null);
  const uniforms = useMemo(
    () => ({
      zenith: { value: new Color(PRESETS[lighting].sky) },
      horizon: { value: new Color(PRESETS[lighting].sun).multiplyScalar(0.7) },
    }),
    [lighting],
  );
  useFrame(({ camera }) => {
    if (mesh.current) {
      mesh.current.position.copy(camera.position);
      // Keep the sky behind scene geometry even in the AO depth override pass.
      mesh.current.scale.setScalar(camera.far * 0.99);
    }
  });
  return (
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false} raycast={() => {}}>
      <sphereGeometry args={[1, 16, 8]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`varying float elevation;
          void main() {
            elevation = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={`uniform vec3 zenith;
          uniform vec3 horizon;
          varying float elevation;
          void main() {
            gl_FragColor = vec4(mix(horizon, zenith, smoothstep(-0.15, 0.8, elevation)), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`}
      />
    </mesh>
  );
}
export function LightingPresets({
  floor,
  baseY,
  lighting,
  tier,
}: {
  floor: PlanFloor;
  baseY: number;
  lighting: Lighting;
  tier: Tier;
}) {
  const { gl, invalidate } = useThree();
  const target = useMemo(() => new Object3D(), []);
  const b = polygonBounds(floor.boundary),
    cx = (b.minX + b.maxX) / 2,
    cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(10, b.maxX - b.minX, b.maxZ - b.minZ),
    p = PRESETS[lighting];
  useEffect(() => {
    const tone = gl.toneMapping,
      exposure = gl.toneMappingExposure;
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = p.exposure;
    invalidate();
    return () => {
      gl.toneMapping = tone;
      gl.toneMappingExposure = exposure;
      invalidate();
    };
  }, [gl, p, invalidate]);
  return (
    <>
      <color attach="background" args={[p.sky]} />
      <GradientSky lighting={lighting} />
      <hemisphereLight args={[p.sky, p.ground, p.fill]} />
      <primitive object={target} position={[cx, baseY, cz]} />
      <directionalLight
        key={`${tier}-${lighting}`}
        target={target}
        color={p.sun}
        intensity={p.key}
        position={[
          cx + p.position[0] * span,
          baseY + p.position[1] * span,
          cz + p.position[2] * span,
        ]}
        castShadow={QUALITY[tier].shadow > 0}
        shadow-mapSize={[QUALITY[tier].shadow, QUALITY[tier].shadow]}
        shadow-camera-left={-span * 0.7}
        shadow-camera-right={span * 0.7}
        shadow-camera-top={span * 0.7}
        shadow-camera-bottom={-span * 0.7}
        shadow-camera-near={0.1}
        shadow-camera-far={span * 4}
        shadow-normalBias={0.03}
        shadow-bias={-0.0001}
      />
      <Environment
        key={lighting}
        resolution={64}
        frames={1}
        environmentIntensity={lighting === 'evening' ? 0.65 : 0.4}
      >
        <color attach="background" args={[p.sky]} />
        <Lightformer
          position={[0, 6, 0]}
          rotation-x={Math.PI / 2}
          scale={[12, 12, 1]}
          intensity={lighting === 'evening' ? 0.7 : 2}
          color={p.sun}
        />
        <Lightformer
          position={[-5, 3, 4]}
          rotation-y={Math.PI / 3}
          scale={[6, 6, 1]}
          intensity={1}
          color={p.sky}
        />
      </Environment>
    </>
  );
}
