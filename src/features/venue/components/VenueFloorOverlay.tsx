import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, Vector3 } from 'three';
import type { Room } from '@/features/building/model/building-schema.ts';
import { boothPhysical } from '@/features/building/model/booth-physical.ts';
import { BrandingSurface } from '@/features/assets/components/BrandingSurface.tsx';
import type { Logo } from '@/features/assets/model/branding.ts';
import { apiBaseUrl } from '@/api/base-url.ts';
import { frameRuntime } from '@/features/world/model/frame-runtime.ts';
import { usePublicVenue } from './VenuePublicProvider.tsx';
import type { VenuePublicView } from '../model/venue-contracts.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useGraphicsQuality } from '@/features/world/model/graphics-quality.ts';

const statusColors = {
  available: '#22c55e',
  held: '#f59e0b',
  booked: '#3b82f6',
  unavailable: '#64748b',
};
type PublicBooth = VenuePublicView['booths'][number];
function BoothHeader({ room, booth }: { room: Room; booth: PublicBooth }) {
  const [logo, setLogo] = useState<Logo | null>(null);
  const spec = boothPhysical(room);
  const branding = booth.branding;
  const displayName = branding?.displayName;
  const logoUrl = branding?.logoUrl;
  const color = branding?.color;
  useEffect(() => {
    if (!displayName || !color) {
      setLogo(null);
      return;
    }
    const controller = new AbortController();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const draw = (bitmap?: ImageBitmap) => {
      if (controller.signal.aborted) {
        return;
      }
      context.fillStyle = color;
      context.fillRect(0, 0, 512, 64);
      let textStart = 12;
      if (bitmap) {
        const scale = Math.min(100 / bitmap.width, 48 / bitmap.height);
        context.drawImage(
          bitmap,
          8,
          (64 - bitmap.height * scale) / 2,
          bitmap.width * scale,
          bitmap.height * scale,
        );
        textStart = 116;
      }
      // A neutral backing preserves contrast even with very pale exhibitor brand colors.
      context.fillStyle = '#15202de0';
      context.fillRect(textStart - 4, 7, 512 - textStart - 4, 50);
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      let font = 28;
      context.font = `600 ${font}px system-ui`;
      while (font > 12 && context.measureText(displayName).width > 488 - textStart) {
        context.font = `600 ${--font}px system-ui`;
      }
      context.fillText(displayName, (textStart + 500) / 2, 32, 488 - textStart);
      setLogo({ canvas, width: 512, height: 64, name: displayName });
      frameRuntime.wake('venue-branding', 150);
    };
    draw();
    if (logoUrl && /^\/api\/media\/[a-f0-9]{64}\.(webp|png|jpg)$/.test(logoUrl)) {
      void (async () => {
        let bitmap: ImageBitmap | undefined;
        try {
          const response = await fetch(`${apiBaseUrl()}${logoUrl}`, {
            signal: controller.signal,
            cache: 'force-cache',
          });
          if (!response.ok) {
            return;
          }
          const blob = await response.blob();
          if (blob.size > 12 * 1024 * 1024 || controller.signal.aborted) {
            return;
          }
          bitmap = await createImageBitmap(blob, { resizeWidth: 512, resizeQuality: 'high' });
          draw(bitmap);
        } catch {
          /* Keep the readable text header if the uploaded logo cannot load. */
        } finally {
          bitmap?.close();
        }
      })();
    }
    return () => {
      controller.abort();
    };
  }, [displayName, logoUrl, color]);
  if (!branding || !logo || !spec.frame) {
    return null;
  }
  const frame = spec.frame;
  return (
    <group position={[frame.center[0], 0, frame.center[1]]} rotation-y={frame.yaw}>
      <BrandingSurface
        logo={logo}
        position={[0, spec.height - 0.11, frame.depth / 2 + 0.008]}
        width={Math.max(0.2, frame.width - 0.14)}
        height={0.2}
      />
    </group>
  );
}

/** Independent overlays retain shared booth batches and leave collision/navigation unchanged. */
export function VenueFloorOverlay({
  rooms,
  floorId,
  heightOffset,
}: {
  rooms: Room[];
  floorId: string;
  heightOffset: number;
}) {
  const { data, heatmap, operations } = usePublicVenue();
  const selected = useWorldStore((state) => state.selectedBoothId);
  const activeFloor = useWorldStore((state) => state.currentFloorId);
  const tier = useGraphicsQuality((state) => state.tier);
  const headerLimit = tier === 'efficient' ? 8 : tier === 'balanced' ? 16 : 24;
  const [nearby, setNearby] = useState<string[]>([]);
  const elapsed = useRef(1);
  const booths = useMemo(
    () =>
      new Map(
        data?.booths.filter((item) => item.floorId === floorId).map((item) => [item.id, item]) ??
          [],
      ),
    [data?.booths, floorId],
  );
  const branded = useMemo(
    () =>
      activeFloor === floorId
        ? rooms.filter((room) => booths.get(room.id)?.branding && boothPhysical(room).frame)
        : [],
    [rooms, booths, activeFloor, floorId],
  );
  useEffect(() => {
    elapsed.current = 1;
    frameRuntime.wake('venue-headers', 150);
  }, [branded, selected, headerLimit]);
  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.35) {
      return;
    }
    elapsed.current = 0;
    const next = branded
      .map((room) => ({
        id: room.id,
        distance:
          room.id === selected
            ? -1
            : Math.hypot(
                boothPhysical(room).interior[0] - camera.position.x,
                heightOffset - camera.position.y,
                boothPhysical(room).interior[1] - camera.position.z,
              ),
      }))
      .filter((item) => item.distance < 150)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, headerLimit)
      .map((item) => item.id)
      .sort();
    if (next.join('\0') !== nearby.join('\0')) {
      setNearby(next);
    }
  });
  const outlines = useMemo(
    () =>
      heatmap
        ? rooms.flatMap((room) => {
            const booth = booths.get(room.id);
            if (!booth) {
              return [];
            }
            return room.polygon.map((start, i) => {
              const end = room.polygon[(i + 1) % room.polygon.length]!;
              const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
              const matrix = new Matrix4().makeRotationY(
                -Math.atan2(end[1] - start[1], end[0] - start[0]),
              );
              matrix.scale(new Vector3(length, 0.006, 0.1));
              matrix.setPosition((start[0] + end[0]) / 2, 0.03, (start[1] + end[1]) / 2);
              return { matrix, color: statusColors[booth.status] };
            });
          })
        : [],
    [heatmap, rooms, booths],
  );
  const markers = useMemo(
    () =>
      operations
        ? (data?.operations ?? [])
            .filter((item) => item.floorId === floorId)
            .map((item) => {
              const radius =
                item.kind === 'occupancy'
                  ? Math.min(12, Math.max(1, Math.sqrt(item.count ?? 0) / 2))
                  : 0.8;
              const matrix = new Matrix4().makeRotationX(-Math.PI / 2);
              matrix.scale(new Vector3(radius, radius, 1));
              matrix.setPosition(item.position[0], 0.06, item.position[1]);
              return {
                matrix,
                color:
                  item.kind === 'incident'
                    ? '#ef4444'
                    : item.kind === 'cleaning'
                      ? '#a855f7'
                      : '#f97316',
              };
            })
        : [],
    [operations, data?.operations, floorId],
  );
  return (
    <group>
      <ColoredInstances items={outlines} shape="box" />
      <ColoredInstances items={markers} shape="circle" />
      {branded
        .filter((room) => nearby.includes(room.id))
        .map((room) => (
          <BoothHeader
            key={`${data?.eventId}:${room.id}`}
            room={room}
            booth={booths.get(room.id)!}
          />
        ))}
    </group>
  );
}
function ColoredInstances({
  items,
  shape,
}: {
  items: { matrix: Matrix4; color: string }[];
  shape: 'box' | 'circle';
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const current = mesh.current;
    if (!current) {
      return;
    }
    const color = new Color();
    items.forEach((item, i) => {
      current.setMatrixAt(i, item.matrix);
      current.setColorAt(i, color.set(item.color));
    });
    current.instanceMatrix.needsUpdate = true;
    if (current.instanceColor) {
      current.instanceColor.needsUpdate = true;
    }
    current.computeBoundingBox();
    current.computeBoundingSphere();
    frameRuntime.wake('venue-overlay', 150);
  }, [items]);
  useEffect(() => {
    const current = mesh.current;
    return () => {
      current?.dispose();
    };
  }, [items.length]);
  if (!items.length) {
    return null;
  }
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} raycast={() => {}}>
      {shape === 'box' ? <boxGeometry args={[1, 1, 1]} /> : <circleGeometry args={[1, 20]} />}
      <meshBasicMaterial
        transparent
        opacity={shape === 'circle' ? 0.3 : 0.8}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
