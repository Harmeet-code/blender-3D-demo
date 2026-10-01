import { Component, Suspense, useEffect, useMemo, type ReactNode, type ErrorInfo } from 'react';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { resolveAsset, clearAssetFault } from '../model/catalog.ts';
import { useAssetStatus } from '../model/asset-status.ts';
class AssetBoundary extends Component<
  { id: string; children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, _info: ErrorInfo) {
    useAssetStatus.getState().setStatus(this.props.id, {
      kind: 'error',
      message: `Could not load ${this.props.id}: ${error.message}`,
    });
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Placeholder({ id, loading = false }: { id: string; loading?: boolean }) {
  useEffect(() => {
    useAssetStatus.getState().setStatus(id, {
      kind: loading ? 'loading' : 'error',
      message: loading ? `Loading ${id}` : `${id} is unavailable; showing geometry fallback`,
    });
    return () => useAssetStatus.getState().setStatus(id, null);
  }, [id, loading]);
  return (
    <mesh position={[0, 0.3, 0]}>
      <boxGeometry args={[0.5, 0.6, 0.5]} />
      <meshStandardMaterial color={loading ? '#64748b' : '#f59e0b'} wireframe />
    </mesh>
  );
}
function LoadedAsset({ url, id }: { url: string; id: string }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((node) => {
      node.castShadow = true;
      node.receiveShadow = true;
    });
    return copy;
  }, [gltf.scene]);
  useEffect(() => {
    useAssetStatus.getState().setStatus(id, null);
  }, [id]);
  return <primitive object={scene} dispose={null} />;
}
export interface AssetInstanceProps {
  id: string;
  version?: number;
  position?: [number, number, number];
  yawRadians?: number;
  scale?: [number, number, number];
  collidable?: boolean;
  boothId?: string;
}
export function AssetInstance({
  id,
  version = 1,
  position = [0, 0, 0],
  yawRadians = 0,
  scale = [1, 1, 1],
  collidable = false,
  boothId,
}: AssetInstanceProps) {
  const resolved = resolveAsset(id, version);
  const revision = useAssetStatus((state) => state.revision);
  const statusId = `${id}@${version}`;
  const content = resolved.isOk() ? (
    <AssetBoundary
      key={`${statusId}:${revision}`}
      id={statusId}
      fallback={<Placeholder id={statusId} />}
    >
      <Suspense fallback={<Placeholder id={statusId} loading />}>
        <LoadedAsset url={resolved.value.url} id={statusId} />
      </Suspense>
    </AssetBoundary>
  ) : (
    <Placeholder id={statusId} />
  );
  if (!collidable || resolved.isErr()) {
    return (
      <group
        position={position}
        rotation={[0, yawRadians, 0]}
        scale={scale}
        userData={{ boothId, assetId: id }}
      >
        {content}
      </group>
    );
  }
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={position}
      rotation={[0, yawRadians, 0]}
      userData={{ boothId, assetId: id }}
    >
      <group scale={scale}>{content}</group>
      {resolved.value.metadata.colliders.map((collider, index) => (
        <CuboidCollider
          key={index}
          args={collider.halfExtents.map((n, i) => n * (scale[i] ?? 1)) as [number, number, number]}
          position={
            collider.position.map((n, i) => n * (scale[i] ?? 1)) as [number, number, number]
          }
          rotation={collider.rotation}
        />
      ))}
    </RigidBody>
  );
}
export function retryAssetLoads() {
  for (const statusId of Object.keys(useAssetStatus.getState().statuses)) {
    const [id, version] = statusId.split('@');
    const asset = resolveAsset(id ?? '', Number(version ?? 1));
    if (asset.isOk()) {
      useGLTF.clear(asset.value.url);
    }
  }
  clearAssetFault();
  useAssetStatus.getState().retry();
}
