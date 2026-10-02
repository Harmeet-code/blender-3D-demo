import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Mesh, MathUtils } from 'three';
import { resolveAsset, clearAssetFault } from '../model/catalog.ts';
import { useAssetStatus } from '../model/asset-status.ts';
import { retainCommon } from '../model/resource-cache.ts';
import { useWorldStore } from '../../viewer/model/viewer-store.ts';
import type { AssetMetadata } from '../model/asset-schema.ts';
import type { Logo } from '../model/branding.ts';
import { BrandingSurface } from './BrandingSurface.tsx';
const failedUrls = new Set<string>();
class AssetBoundary extends Component<
  { id: string; url: string; revision: number; children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    failedUrls.add(this.props.url);
    useAssetStatus.getState().setStatus(this.props.id, {
      kind: 'error',
      message: `Could not load ${this.props.id}: ${error.message}`,
    });
  }
  override componentDidUpdate(previous: { revision: number }) {
    if (previous.revision !== this.props.revision && this.state.failed) {
      this.setState({ failed: false });
    }
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function AssetPlaceholder({
  statusId,
  metadata,
  loading = false,
  report = true,
}: {
  statusId: string;
  metadata?: AssetMetadata;
  loading?: boolean;
  report?: boolean;
}) {
  useEffect(() => {
    if (!report) {
      return;
    }
    useAssetStatus.getState().setStatus(statusId, {
      kind: loading ? 'loading' : 'error',
      message: loading
        ? `Loading ${statusId}`
        : `${statusId} unavailable; showing geometry fallback`,
    });
    return () => useAssetStatus.getState().setStatus(statusId, null);
  }, [statusId, loading, report]);
  const size = metadata?.dimensions ?? [4, 2.5, 4];
  const min = metadata?.bounds.min ?? [-2, 0, -2];
  return (
    <mesh position={size.map((n, i) => n / 2 + (min[i] ?? 0)) as [number, number, number]}>
      <boxGeometry args={size as [number, number, number]} />
      <meshStandardMaterial color={loading ? '#64748b' : '#f59e0b'} wireframe />
    </mesh>
  );
}
function AssetDiagnostic({ id, message }: { id: string; message: string }) {
  useEffect(() => {
    useAssetStatus.getState().setStatus(id, { kind: 'error', message });
    return () => useAssetStatus.getState().setStatus(id, null);
  }, [id, message]);
  return null;
}
export function AssetLoad({
  id,
  version = 1,
  statusId,
  children,
  fallback,
}: {
  id: string;
  version?: number;
  statusId: string;
  children: (url: string, metadata: AssetMetadata) => ReactNode;
  fallback?: ReactNode | ((phase: 'loading' | 'error' | 'rollback') => ReactNode);
}) {
  const lowQuality = useWorldStore((s) => s.lowQuality);
  const geometryFallback = useWorldStore((s) => s.geometryFallback);
  const revision = useAssetStatus((s) => s.revision);
  const resolved = resolveAsset(id, version, lowQuality);
  const customFallback = (phase: 'loading' | 'error' | 'rollback') =>
    typeof fallback === 'function' ? fallback(phase) : fallback;
  if (resolved.isErr() || geometryFallback) {
    return (
      <>
        {resolved.isErr() && (
          <AssetDiagnostic
            id={`reference:${statusId}`}
            message={`${resolved.error.code}: ${resolved.error.message}`}
          />
        )}
        {customFallback(geometryFallback ? 'rollback' : 'error') ?? (
          <AssetPlaceholder
            statusId={statusId}
            metadata={resolved.isOk() ? resolved.value.metadata : undefined}
            report={!geometryFallback}
          />
        )}
      </>
    );
  }
  const { url, metadata } = resolved.value;
  return (
    <AssetBoundary
      key={url}
      revision={revision}
      id={statusId}
      url={url}
      fallback={
        customFallback('error') ?? <AssetPlaceholder statusId={statusId} metadata={metadata} />
      }
    >
      <Suspense
        fallback={
          customFallback('loading') ?? (
            <AssetPlaceholder statusId={statusId} metadata={metadata} loading />
          )
        }
      >
        {children(url, metadata)}
      </Suspense>
    </AssetBoundary>
  );
}
function LoadedAsset({
  url,
  statusId,
  metadata,
  logo,
  doorOpen = false,
}: {
  url: string;
  statusId: string;
  metadata: AssetMetadata;
  logo?: Logo;
  doorOpen?: boolean;
}) {
  const gltf = useGLTF(url, false, false);
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((node) => {
      if (node instanceof Mesh) {
        node.castShadow = [
          'booth-frame',
          'wall-panel',
          'forklift',
          'stairs',
          'escalator-entrance',
        ].includes(metadata.id);
        node.receiveShadow = true;
      }
    });
    return copy;
  }, [gltf.scene, metadata.id]);
  useEffect(() => retainCommon(url, gltf.scene), [url, gltf.scene]);
  useEffect(() => {
    useAssetStatus.getState().setStatus(statusId, null);
  }, [statusId]);
  useEffect(() => {
    for (const name of metadata.branding?.defaultNodes ?? []) {
      const node = scene.getObjectByName(name);
      if (node) {
        node.visible = !logo;
      }
    }
  }, [scene, metadata, logo]);
  const closed = useRef<{ left: number; right: number } | null>(null);
  useFrame((_, delta) => {
    if (metadata.id !== 'elevator-entrance') {
      return;
    }
    const left = scene.getObjectByName('door_left'),
      right = scene.getObjectByName('door_right');
    if (!left || !right) {
      return;
    }
    closed.current ??= { left: left.position.x, right: right.position.x };
    left.position.x = MathUtils.damp(
      left.position.x,
      closed.current.left - (doorOpen ? 0.82 : 0),
      7,
      delta,
    );
    right.position.x = MathUtils.damp(
      right.position.x,
      closed.current.right + (doorOpen ? 0.82 : 0),
      7,
      delta,
    );
  });
  const { branding } = metadata;
  const socket = metadata.sockets[branding?.socket ?? 'socket_branding'];
  return (
    <group dispose={null}>
      <primitive object={scene} dispose={null} />
      {logo && socket && (
        <BrandingSurface
          logo={logo}
          position={[socket.position[0], socket.position[1], socket.position[2] + 0.003]}
          width={branding?.width ?? 3.6}
          height={branding?.height ?? 0.24}
        />
      )}
    </group>
  );
}
export interface AssetInstanceProps {
  id: string;
  version?: number;
  position?: [number, number, number];
  yawRadians?: number;
  scale?: [number, number, number];
  collidable?: boolean;
  boothId?: string;
  placementId?: string;
  logo?: Logo;
  doorOpen?: boolean;
}
export function AssetColliders({
  metadata,
  position = [0, 0, 0],
  yawRadians = 0,
  scale = [1, 1, 1],
}: {
  metadata: AssetMetadata;
  position?: [number, number, number];
  yawRadians?: number;
  scale?: [number, number, number];
}) {
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, yawRadians, 0]}>
      {metadata.colliders.map((collider, index) => (
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
export function AssetInstance({
  id,
  version = 1,
  position = [0, 0, 0],
  yawRadians = 0,
  scale = [1, 1, 1],
  collidable = false,
  boothId,
  placementId,
  logo,
  doorOpen,
}: AssetInstanceProps) {
  const resolved = resolveAsset(id, version);
  const statusId = placementId ?? `${id}@${version}:${boothId ?? position.join(',')}`;
  const dollhouse = useWorldStore((s) => s.dollhouse);
  return (
    <group>
      <group
        position={position}
        rotation={[0, yawRadians, 0]}
        scale={scale}
        userData={{ boothId, assetId: id, placementId: statusId }}
      >
        <AssetLoad id={id} version={version} statusId={statusId}>
          {(url, metadata) => (
            <LoadedAsset
              url={url}
              metadata={metadata}
              statusId={statusId}
              logo={logo}
              doorOpen={doorOpen}
            />
          )}
        </AssetLoad>
      </group>
      {collidable && !dollhouse && resolved.isOk() && (
        <AssetColliders
          metadata={resolved.value.metadata}
          position={position}
          yawRadians={yawRadians}
          scale={scale}
        />
      )}
    </group>
  );
}
export function retryAssetLoads() {
  for (const url of failedUrls) {
    useGLTF.clear(url);
  }
  failedUrls.clear();
  clearAssetFault();
  useAssetStatus.getState().retry();
}
export function hasFailedAssetLoads() {
  return failedUrls.size > 0;
}
