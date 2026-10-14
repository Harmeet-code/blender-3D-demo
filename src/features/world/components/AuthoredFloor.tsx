import { Suspense, useEffect, useMemo, useRef, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useGLTF, useTexture, Html } from '@react-three/drei';
import {
  Box3,
  Shape,
  Vector2,
  Vector3,
  SRGBColorSpace,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Vector4,
  Group,
} from 'three';
import { useThree } from '@react-three/fiber';
import { sourceToMetres } from '@/features/building/model/floor-coordinates.ts';
import { RigidBody, CuboidCollider, ConvexHullCollider } from '@react-three/rapier';
import type { Floor } from '@/features/building/model/building-schema.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { AssetInstance } from '@/features/assets/components/AssetInstance.tsx';
import { mediaUrl } from '@/features/layout-editor/api/media-client.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import {
  retainCommon,
  retainMapTexture,
  trackAssetLoader,
  trackMapRequest,
} from '@/features/assets/model/resource-cache.ts';
import mapPyramids from '@/assets/metadata/floor-tiles.v1.json';
import type { TilePyramid } from '@/features/building/model/floor-tiles.ts';
import { TiledUnderlay } from './TiledUnderlay.tsx';
import { frameRuntime } from '../model/frame-runtime.ts';
import { AuthoredFeatures } from './AuthoredFeatures.tsx';
import {
  authoredInstancePhysical,
  type AuthoredInstance,
} from '@/features/building/model/authored-instance-physical.ts';

function AssetRecovery({ kind, retry }: { kind: 'Model' | 'Floor image'; retry: () => void }) {
  return (
    <Html center>
      <div
        role="alert"
        className="w-56 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
      >
        <p>{kind} could not load.</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className="rounded border px-2 py-1" onClick={retry}>
            Retry {kind === 'Model' ? 'model' : 'image'}
          </button>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => window.location.reload()}
          >
            Refresh app
          </button>
        </div>
      </div>
    </Html>
  );
}

type GlbProps = { url: string; center?: boolean; dimensions?: [number, number, number] };
function LoadedGlb({ url, center = false, dimensions }: GlbProps) {
  const gltf = useGLTF(mediaUrl(url), false, false, trackAssetLoader);
  const gl = useThree((s) => s.gl);
  useEffect(() => retainCommon(mediaUrl(url), gltf.scene), [url, gltf.scene]);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    frameRuntime.wake('authored-ready', 200);
  }, [gltf, gl, dimensions]);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((node) => {
      if (node instanceof Mesh) {
        // The subfloor sits below the reference map; excluding it from the shadow
        // caster pass prevents grazing-angle self-shadow acne across a 500 m canvas.
        node.castShadow = !node.name.includes('calibrated_foundation');
        node.receiveShadow = true;
      }
    });
    if (center) {
      const box = new Box3().setFromObject(clone),
        middle = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      const fitted = dimensions
        ? dimensions.map((value, i) => value / Math.max(1e-8, size.getComponent(i)))
        : [1, 1, 1];
      const root = new Group();
      root.add(clone);
      root.scale.set(fitted[0]!, fitted[1]!, fitted[2]!);
      root.position.set(-middle.x * fitted[0]!, -box.min.y * fitted[1]!, -middle.z * fitted[2]!);
      return root;
    }
    return clone;
  }, [gltf, center, dimensions]);
  return <primitive object={scene} dispose={null} />;
}
export function Glb({ url, center = false, dimensions }: GlbProps) {
  return (
    <ErrorBoundary
      onReset={() => useGLTF.clear(mediaUrl(url))}
      fallbackRender={({ resetErrorBoundary }) => (
        <AssetRecovery kind="Model" retry={resetErrorBoundary} />
      )}
      resetKeys={[url]}
    >
      <Suspense fallback={null}>
        <LoadedGlb url={url} center={center} dimensions={dimensions} />
      </Suspense>
    </ErrorBoundary>
  );
}
function AuthoredInstanceView({
  item,
  dollhouse,
  floorId,
}: {
  item: AuthoredInstance;
  dollhouse: boolean;
  floorId: string;
}) {
  const physical = authoredInstancePhysical(item);
  return (
    <>
      <group position={[item.position[0], 0, item.position[1]]} rotation-y={item.yawRadians}>
        {item.assetId ? (
          <AssetInstance
            id={item.assetId}
            scale={physical.scale}
            placementId={`authored:${floorId}:${item.id}`}
          />
        ) : (
          item.url && (
            <group scale={item.scale}>
              <Glb url={item.url} center dimensions={item.dimensions} />
            </group>
          )
        )}
      </group>
      {!dollhouse && item.collidable && (
        <RigidBody type="fixed" colliders={false}>
          {physical.boxes.map((box, i) =>
            box.hull ? (
              <ConvexHullCollider key={i} args={[box.hull]} position={box.position} />
            ) : (
              <CuboidCollider
                key={i}
                args={box.halfExtents}
                position={box.position}
                rotation={box.rotation}
              />
            ),
          )}
        </RigidBody>
      )}
    </>
  );
}
function Underlay({ floor }: { floor: Floor }) {
  const mask = useRef({
    bounds: { value: Array.from({ length: 32 }, () => new Vector4()) },
    count: { value: 0 },
    ready: new Map<string, Vector4>(),
  });
  const ready = useCallback((key: string, box: [number, number, number, number] | null) => {
    if (box) {
      mask.current.ready.set(key, new Vector4(...box));
    } else {
      mask.current.ready.delete(key);
    }
    const boxes = [...mask.current.ready.values()].slice(0, 32);
    boxes.forEach((box, i) => mask.current.bounds.value[i]!.copy(box));
    mask.current.count.value = boxes.length;
    frameRuntime.wake('map-mask', 100);
  }, []);
  const source = useLayoutStore((state) =>
    state.source.floors.find((item) => item.id === floor.id),
  );
  trackMapRequest(mediaUrl(floor.image));
  const texture = useTexture(mediaUrl(floor.image));
  useEffect(() => retainMapTexture(mediaUrl(floor.image), texture), [floor.image, texture]);
  const tileSource = useMemo(() => {
    const tiles =
      source?.authoring?.tiles ?? (mapPyramids as Record<string, TilePyramid>)[floor.image];
    return source?.authoring && tiles
      ? { ...source, authoring: { ...source.authoring, tiles } }
      : source;
  }, [source, floor.image]);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  }, [texture, gl]);
  const imageSize = source?.authoring?.imageSize;
  const calibration = source?.coordinateSystem;
  const geometry = useMemo(() => {
    if (!imageSize || calibration?.units !== 'pixels') {
      return null;
    }
    const [w, h] = imageSize;
    const points: [number, number][] = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new Float32BufferAttribute(
        points.flatMap((p) => {
          const [x, z] = sourceToMetres(p, calibration);
          return [x, 0.006, z];
        }),
        3,
      ),
    );
    g.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [imageSize, calibration]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry ? (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={texture}
          customProgramCacheKey={() => 'floor-tile-parent-v1'}
          onBeforeCompile={(shader) => {
            shader.uniforms.tileBounds = mask.current.bounds;
            shader.uniforms.tileCount = mask.current.count;
            shader.fragmentShader = `uniform vec4 tileBounds[32]; uniform int tileCount;\n${shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n for (int i=0; i<32; i++) { if (i>=tileCount) break; vec4 b=tileBounds[i]; if (vMapUv.x>=b.x && vMapUv.x<=b.z && vMapUv.y>=b.y && vMapUv.y<=b.w) discard; }')}`;
          }}
          color="#e1e5ea"
          side={2}
          transparent
          opacity={floor.authoring?.underlayOpacity ?? 0.85}
          polygonOffset
          polygonOffsetFactor={0}
          polygonOffsetUnits={-1}
          roughness={1}
        />
      </mesh>
      {tileSource?.authoring?.tiles && (
        <TiledUnderlay
          source={tileSource}
          height={floor.heightOffset}
          opacity={floor.authoring?.underlayOpacity ?? 0.85}
          onReady={ready}
        />
      )}
    </group>
  ) : null;
}
export function AuthoredFloor({ floor }: { floor: Floor }) {
  const authoring = floor.authoring!;
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const shape = useMemo(
    () => new Shape(authoring.boundary.map(([x, z]) => new Vector2(x, -z))),
    [authoring.boundary],
  );
  const bounds = polygonBounds(authoring.boundary);
  return (
    <>
      <RigidBody type="fixed" colliders={dollhouse ? false : 'trimesh'}>
        <mesh rotation-x={-Math.PI / 2} receiveShadow visible={!authoring.shellUrl}>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color="#d0c9bc" roughness={0.8} />
        </mesh>
      </RigidBody>
      {floor.image && (
        <ErrorBoundary
          resetKeys={[floor.image]}
          onReset={() => useTexture.clear(mediaUrl(floor.image))}
          fallbackRender={({ resetErrorBoundary }) => (
            <AssetRecovery kind="Floor image" retry={resetErrorBoundary} />
          )}
        >
          <Suspense fallback={null}>
            <Underlay floor={floor} />
          </Suspense>
        </ErrorBoundary>
      )}
      <AuthoredFeatures floor={floor} dimmed={dollhouse} />
      {authoring.shellUrl && <Glb url={authoring.shellUrl} />}
      {authoring.instances.map((item) => (
        <AuthoredInstanceView key={item.id} item={item} dollhouse={dollhouse} floorId={floor.id} />
      ))}
      {authoring.obstacles.map((polygon, i) => {
        const obstacleShape = new Shape(polygon.map(([x, z]) => new Vector2(x, -z)));
        return (
          <RigidBody key={i} type="fixed" colliders={dollhouse ? false : 'trimesh'}>
            <mesh rotation-x={-Math.PI / 2} castShadow receiveShadow>
              <extrudeGeometry args={[obstacleShape, { depth: 2.8, bevelEnabled: false }]} />
              <meshStandardMaterial color="#5b6166" roughness={0.8} />
            </mesh>
          </RigidBody>
        );
      })}
      <Html position={[bounds.minX, 1, bounds.minZ]} style={{ pointerEvents: 'none' }}>
        <span className="rounded bg-black/75 px-2 py-1 text-xs whitespace-nowrap text-white">
          {floor.name} · metres
        </span>
      </Html>
    </>
  );
}
