import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import type { InstancedMesh, Raycaster, Intersection } from 'three';
import { Matrix4, Quaternion, Vector3, type Material, type BufferGeometry } from 'three';
import { AssetLoad, AssetColliders, AssetPlaceholder } from './AssetInstance.tsx';
import { useWorldStore } from '../../viewer/model/viewer-store.ts';
import { useAssetStatus } from '../model/asset-status.ts';
import { retainCommon, compiledPrimitives } from '../model/resource-cache.ts';
import { resolveAsset } from '../model/catalog.ts';
import type { AssetMetadata } from '../model/asset-schema.ts';
export interface BatchPlacement {
  id: string;
  boothId?: string;
  position: [number, number, number];
  yawRadians: number;
  scale?: [number, number, number];
}
function PrimitiveBatch({
  geometry,
  material,
  placements,
  assetId,
}: {
  geometry: BufferGeometry;
  material: Material;
  placements: readonly BatchPlacement[];
  assetId: string;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const select = useWorldStore((s) => s.selectBooth);
  useEffect(() => {
    const instance = mesh.current;
    return () => {
      instance?.dispose();
    };
  }, []);
  useLayoutEffect(() => {
    if (!mesh.current) {
      return;
    }
    placements.forEach((placement, i) => {
      const matrix = new Matrix4().compose(
        new Vector3(...placement.position),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), placement.yawRadians),
        new Vector3(...(placement.scale ?? [1, 1, 1])),
      );
      mesh.current?.setMatrixAt(i, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    mesh.current.computeBoundingBox();
  }, [placements]);
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, placements.length]}
      dispose={null}
      castShadow={['booth-frame', 'wall-panel'].includes(assetId)}
      receiveShadow
      userData={{ batchAssetId: assetId, placements }}
      raycast={function (this: InstancedMesh, raycaster: Raycaster, intersections: Intersection[]) {
        const bounds = geometry.boundingBox;
        if (!bounds) {
          return;
        }
        const matrix = new Matrix4(),
          point = new Vector3();
        for (let instanceId = 0; instanceId < this.count; instanceId++) {
          this.getMatrixAt(instanceId, matrix);
          matrix.premultiply(this.matrixWorld);
          const ray = raycaster.ray.clone().applyMatrix4(matrix.clone().invert());
          if (!ray.intersectBox(bounds, point)) {
            continue;
          }
          point.applyMatrix4(matrix);
          const distance = raycaster.ray.origin.distanceTo(point);
          if (distance >= raycaster.near && distance <= raycaster.far) {
            intersections.push({ distance, point: point.clone(), object: this, instanceId });
          }
        }
      }}
      onClick={(event) => {
        const booth = placements[event.instanceId ?? -1]?.boothId;
        if (booth) {
          event.stopPropagation();
          select(booth);
        }
      }}
    />
  );
}
function LoadedBatch({
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
  const gltf = useGLTF(url, false, false);
  const groups = useMemo(() => compiledPrimitives(url, gltf.scene), [url, gltf.scene]);
  useEffect(() => retainCommon(url, gltf.scene), [url, gltf.scene]);
  useEffect(() => {
    useAssetStatus.getState().setStatus(statusId, null);
  }, [statusId]);
  return (
    <group>
      {groups.map(({ geometry, material }) => (
        <PrimitiveBatch
          key={material.uuid}
          geometry={geometry}
          material={material}
          placements={placements}
          assetId={id}
        />
      ))}
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
