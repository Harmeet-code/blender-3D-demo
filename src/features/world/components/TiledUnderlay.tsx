import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Frustum,
  Matrix4,
  Vector3,
  type Texture,
  PerspectiveCamera,
  type Group,
} from 'three';
import type { Floor } from '@/features/building/model/building-schema.ts';
import { tileBounds, type TilePyramid } from '@/features/building/model/floor-tiles.ts';
import { sourceToMetres } from '@/features/building/model/floor-coordinates.ts';
import { retainTile } from '../model/tile-cache.ts';
import { frameRuntime } from '../model/frame-runtime.ts';
import { mediaUrl } from '@/features/layout-editor/api/media-client.ts';
import { scheduleUpload } from '../model/upload-admission.ts';
type Patch = { level: number; x: number; y: number };
function Tile({
  source,
  pyramid,
  patch,
  opacity,
  onReady,
}: {
  source: Floor;
  pyramid: TilePyramid;
  patch: Patch;
  opacity: number;
  onReady: (key: string, box: [number, number, number, number] | null) => void;
}) {
  const [texture, setTexture] = useState<Texture | null>(null);
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(() => {
    const b = tileBounds(pyramid, patch.level, patch.x, patch.y);
    const [w, h] = source.authoring!.imageSize!;
    const left = Math.max(0, b.left - 1),
      top = Math.max(0, b.top - 1),
      right = Math.min(b.width, b.right + 1),
      bottom = Math.min(b.height, b.bottom + 1);
    const g = new BufferGeometry();
    g.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          [b.u0, b.v0],
          [b.u1, b.v0],
          [b.u1, b.v1],
          [b.u0, b.v1],
        ].flatMap(([u = 0, v = 0]) => {
          const p = sourceToMetres([u * w, v * h], source.coordinateSystem);
          return [p[0], 0.007, p[1]];
        }),
        3,
      ),
    );
    const u0 = (b.left - left) / (right - left),
      u1 = (b.right - left) / (right - left),
      v0 = 1 - (b.bottom - top) / (bottom - top),
      v1 = 1 - (b.top - top) / (bottom - top);
    g.setAttribute('uv', new Float32BufferAttribute([u0, v1, u1, v1, u1, v0, u0, v0], 2));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [source, pyramid, patch]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    let live = true;
    const url = mediaUrl(
      pyramid.template
        .replace('{level}', String(patch.level))
        .replace('{x}', String(patch.x))
        .replace('{y}', String(patch.y)),
    );
    const handle = retainTile(url);
    handle.promise
      .then((next) => {
        if (live) {
          scheduleUpload(
            () => live,
            () => {
              next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
              gl.initTexture(next);
              setTexture(next);
              frameRuntime.wake('map-tile', 100);
            },
          );
        }
      })
      .catch(() => {
        /* Parent map stays visible after cancellation or failed tiles. */
      });
    return () => {
      live = false;
      onReady(`${patch.level}:${patch.x}:${patch.y}`, null);
      handle.release();
    };
  }, [pyramid, patch, gl, onReady]);
  useLayoutEffect(() => {
    if (!texture) {
      return;
    }
    const b = tileBounds(pyramid, patch.level, patch.x, patch.y),
      key = `${patch.level}:${patch.x}:${patch.y}`;
    onReady(key, [b.u0, 1 - b.v1, b.u1, 1 - b.v0]);
    return () => onReady(key, null);
  }, [texture, pyramid, patch, onReady]);
  return texture ? (
    <mesh geometry={geometry} receiveShadow renderOrder={1}>
      <meshStandardMaterial
        map={texture}
        color="#e1e5ea"
        side={2}
        transparent
        opacity={opacity}
        roughness={1}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  ) : null;
}
/** A preview remains beneath the bounded visible working set until each tile is ready. */
export function TiledUnderlay({
  source,
  height,
  opacity,
  onReady,
}: {
  source: Floor;
  height: number;
  opacity: number;
  onReady: (key: string, box: [number, number, number, number] | null) => void;
}) {
  const [patches, setPatches] = useState<Patch[]>([]);
  const root = useRef<Group>(null);
  const signature = useRef('');
  const elapsed = useRef(1);
  const scratch = useMemo(
    () => ({
      frustum: new Frustum(),
      matrix: new Matrix4(),
      box: new Box3(),
      center: new Vector3(),
    }),
    [],
  );
  const pyramid = source.authoring?.tiles;
  useFrame(({ camera, size }, delta) => {
    if (!pyramid || !source.authoring?.imageSize || source.coordinateSystem?.units !== 'pixels') {
      return;
    }
    elapsed.current += delta;
    if (elapsed.current < 0.2) {
      return;
    }
    elapsed.current = 0;
    const [w, h] = source.authoring.imageSize;
    const a = sourceToMetres([0, 0], source.coordinateSystem),
      b = sourceToMetres([w, 0], source.coordinateSystem);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    root.current?.updateWorldMatrix(true, false);
    const worldHeight = root.current ? root.current.getWorldPosition(scratch.center).y : height;
    const distance = Math.max(1, Math.abs(camera.position.y - worldHeight));
    const field =
      camera instanceof PerspectiveCamera
        ? 2 * distance * Math.tan((camera.fov * Math.PI) / 360)
        : span;
    const density = size.height / field;
    const level = Math.max(
      0,
      Math.min(
        pyramid.maxLevel,
        pyramid.maxLevel -
          Math.floor(Math.log2(Math.max(1, pyramid.width / Math.max(1, span * density)))),
      ),
    );
    const factor = 2 ** (pyramid.maxLevel - level);
    const cols = Math.ceil(Math.ceil(pyramid.width / factor) / 512),
      rows = Math.ceil(Math.ceil(pyramid.height / factor) / 512);
    scratch.frustum.setFromProjectionMatrix(
      scratch.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const visible: Array<Patch & { distance: number }> = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const bounds = tileBounds(pyramid, level, x, y);
        scratch.box.makeEmpty();
        for (const [u, v] of [
          [bounds.u0, bounds.v0],
          [bounds.u1, bounds.v0],
          [bounds.u1, bounds.v1],
          [bounds.u0, bounds.v1],
        ]) {
          const p = sourceToMetres([u! * w, v! * h], source.coordinateSystem);
          scratch.center.set(p[0], 0, p[1]);
          if (root.current) {
            scratch.center.applyMatrix4(root.current.matrixWorld);
          } else {
            scratch.center.y = height;
          }
          scratch.box.expandByPoint(scratch.center);
        }
        if (scratch.frustum.intersectsBox(scratch.box)) {
          visible.push({
            level,
            x,
            y,
            distance: scratch.box.getCenter(scratch.center).distanceToSquared(camera.position),
          });
        }
      }
    }
    const limit = 32;
    const next = visible
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(({ level, x, y }) => ({ level, x, y }));
    const key = next.map((p) => `${p.level}:${p.x}:${p.y}`).join('|');
    if (signature.current !== key) {
      signature.current = key;
      setPatches(next);
    }
  });
  return pyramid ? (
    <group ref={root}>
      {patches.map((p) => (
        <Tile
          key={`${p.level}:${p.x}:${p.y}`}
          source={source}
          pyramid={pyramid}
          patch={p}
          opacity={opacity}
          onReady={onReady}
        />
      ))}
    </group>
  ) : null;
}
