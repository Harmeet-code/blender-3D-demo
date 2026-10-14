import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import type { InstancedMesh, Raycaster, Intersection } from 'three';
import {
  Box3,
  Matrix4,
  Mesh,
  Ray,
  Vector3,
  type Material,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { InstanceSpatialIndex } from '../model/instance-spatial-index.ts';
import {
  AssetLoad,
  AssetColliders,
  AssetPlaceholder,
} from '@/features/assets/components/AssetInstance.tsx';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useAssetStatus } from '@/features/assets/model/asset-status.ts';
import {
  retainCommon,
  compiledPrimitives,
  trackAssetLoader,
  isProceduralAssetUrl,
  proceduralAssetScene,
} from '@/features/assets/model/resource-cache.ts';
import { resolveAsset } from '@/features/assets/model/catalog.ts';
import type { AssetMetadata } from '@/features/assets/model/asset-schema.ts';
import { useThree } from '@react-three/fiber';
import { frameRuntime } from '@/features/world/model/frame-runtime.ts';
import { useRoutePointSelection } from '@/features/navigation/model/route-point-selection.ts';
export interface BatchPlacement {
  id: string;
  boothId?: string;
  position: [number, number, number];
  yawRadians: number;
  scale?: [number, number, number];
}
export function PrimitiveBatch({
  geometry,
  material,
  placements,
  assetId,
  index,
}: {
  geometry: BufferGeometry;
  material: Material;
  placements: readonly BatchPlacement[];
  assetId: string;
  index: InstanceSpatialIndex;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const picking = useMemo(
    () => ({
      worldInverse: new Matrix4(),
      batchRay: new Ray(),
      localRay: new Ray(),
      point: new Vector3(),
      candidates: [] as number[],
    }),
    [],
  );
  const select = useWorldStore((s) => s.selectBooth);
  useEffect(() => {
    const instance = mesh.current;
    return () => {
      instance?.dispose();
    };
  }, [geometry, material, placements.length]);
  useLayoutEffect(() => {
    if (!mesh.current) {
      return;
    }
    index.transforms.forEach((matrix, i) => {
      mesh.current?.setMatrixAt(i, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    mesh.current.computeBoundingBox();
  }, [index]);
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, placements.length]}
      dispose={null}
      castShadow={
        assetId.startsWith('booth-') ||
        [
          'booth-frame',
          'wall-panel',
          'premium-booth',
          'forklift',
          'stairs',
          'escalator-entrance',
        ].includes(assetId)
      }
      receiveShadow
      userData={{ batchAssetId: assetId, placements }}
      raycast={function (this: InstancedMesh, raycaster: Raycaster, intersections: Intersection[]) {
        const bounds = geometry.boundingBox;
        if (!bounds) {
          return;
        }
        picking.worldInverse.copy(this.matrixWorld).invert();
        picking.batchRay.copy(raycaster.ray).applyMatrix4(picking.worldInverse);
        index.candidates(picking.batchRay, picking.candidates);
        for (const instanceId of picking.candidates) {
          if (instanceId >= this.count) {
            continue;
          }
          picking.localRay.copy(picking.batchRay).applyMatrix4(index.inverses[instanceId]!);
          if (!picking.localRay.intersectBox(bounds, picking.point)) {
            continue;
          }
          picking.point.applyMatrix4(index.transforms[instanceId]!).applyMatrix4(this.matrixWorld);
          const distance = raycaster.ray.origin.distanceTo(picking.point);
          if (distance >= raycaster.near && distance <= raycaster.far) {
            intersections.push({
              distance,
              point: picking.point.clone(),
              object: this,
              instanceId,
            });
          }
        }
      }}
      onClick={(event) => {
        if (useRoutePointSelection.getState().pickSlot) {
          return;
        }
        const booth = placements[event.instanceId ?? -1]?.boothId;
        if (booth) {
          event.stopPropagation();
          select(booth);
        }
      }}
    />
  );
}
export function LoadedBatch({
  url,
  id,
  statusId,
  placements,
}: {
  url: string;
  id: string;
  statusId: string;
  placements: readonly BatchPlacement[];
}) {
  return isProceduralAssetUrl(url) ? (
    <ProceduralBatch url={url} id={id} statusId={statusId} placements={placements} />
  ) : (
    <NativeBatch url={url} id={id} statusId={statusId} placements={placements} />
  );
}
type LoadedBatchProps = {
  url: string;
  id: string;
  statusId: string;
  placements: readonly BatchPlacement[];
};
function NativeBatch(props: LoadedBatchProps) {
  const gltf = useGLTF(props.url, false, false, trackAssetLoader);
  return <BatchScene {...props} source={gltf.scene} />;
}
function ProceduralBatch(props: LoadedBatchProps) {
  const source = useMemo(() => proceduralAssetScene(props.url), [props.url]);
  return <BatchScene {...props} source={source} />;
}
function BatchScene({
  url,
  id,
  statusId,
  placements,
  source,
}: LoadedBatchProps & { source: Object3D }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    frameRuntime.wake('asset-ready', 200);
  }, [source, gl, placements]);
  const groups = useMemo(() => compiledPrimitives(url, source), [url, source]);
  // Read-only diagnostic reference for equal-content comparison; never the released default.
  const reference =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('batch-reference');
  const originals = useMemo(
    () =>
      reference
        ? placements.map(() => {
            const object = source.clone(true);
            object.traverse((node) => {
              if (node instanceof Mesh) {
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                node.castShadow = !materials.some(
                  (material) =>
                    material.transparent ||
                    ('transmission' in material && Number(material.transmission) > 0),
                );
                node.receiveShadow = true;
              }
            });
            return object;
          })
        : [],
    [reference, placements, source],
  );
  const index = useMemo(() => {
    const bounds = new Box3();
    for (const { geometry } of groups) {
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox!);
    }
    return new InstanceSpatialIndex(bounds, placements);
  }, [groups, placements]);
  useEffect(() => retainCommon(url, source), [url, source]);
  useEffect(() => {
    useAssetStatus.getState().setStatus(statusId, null);
  }, [statusId]);
  return (
    <group>
      {reference
        ? placements.map((placement, i) => (
            <group
              key={placement.id}
              position={placement.position}
              rotation-y={placement.yawRadians}
              scale={placement.scale}
              onClick={(event) => {
                if (placement.boothId) {
                  event.stopPropagation();
                  useWorldStore.getState().selectBooth(placement.boothId);
                }
              }}
            >
              <primitive object={originals[i]!} dispose={null} />
            </group>
          ))
        : groups.map(({ geometry, material, independent }, groupIndex) =>
            independent ? (
              placements.map((placement) => (
                <mesh
                  key={`${groupIndex}:${placement.id}`}
                  geometry={geometry}
                  material={material}
                  dispose={null}
                  position={placement.position}
                  rotation-y={placement.yawRadians}
                  scale={placement.scale}
                  receiveShadow
                  userData={{ boothId: placement.boothId }}
                  onClick={(event) => {
                    if (placement.boothId) {
                      event.stopPropagation();
                      useWorldStore.getState().selectBooth(placement.boothId);
                    }
                  }}
                />
              ))
            ) : (
              <PrimitiveBatch
                key={`${material.uuid}:${groupIndex}`}
                geometry={geometry}
                material={material}
                placements={placements}
                assetId={id}
                index={index}
              />
            ),
          )}
    </group>
  );
}
export function AssetBatch({
  id,
  version = 1,
  placements,
  floorId,
  physics = true,
}: {
  id: string;
  version?: number;
  placements: readonly BatchPlacement[];
  floorId: string;
  physics?: boolean;
}) {
  const resolved = resolveAsset(id, version);
  const metadata: AssetMetadata | undefined = resolved.isOk() ? resolved.value.metadata : undefined;
  return (
    <group>
      <AssetLoad
        id={id}
        version={version}
        statusId={`batch:${floorId}:${id}@${version}`}
        fallback={(phase) => (
          <group>
            {placements.map((p) => (
              <group
                key={p.id}
                position={p.position}
                rotation={[0, p.yawRadians, 0]}
                scale={p.scale}
              >
                <AssetPlaceholder
                  statusId={p.id}
                  metadata={metadata}
                  loading={phase === 'loading'}
                  report={phase !== 'rollback'}
                />
              </group>
            ))}
          </group>
        )}
      >
        {(url) => (
          <LoadedBatch
            url={url}
            id={id}
            statusId={`batch:${floorId}:${id}@${version}`}
            placements={placements}
          />
        )}
      </AssetLoad>
      {metadata &&
        physics &&
        placements.map((placement) => (
          <AssetColliders
            key={placement.id}
            metadata={metadata}
            position={placement.position}
            yawRadians={placement.yawRadians}
            scale={placement.scale}
          />
        ))}
    </group>
  );
}
