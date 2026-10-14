import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three';
import type { Room } from '@/features/building/model/building-schema.ts';
import { boothPhysical } from '@/features/building/model/booth-physical.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
/** IDs use one bounded texture and draw; customer logos retain their independent original textures. */
export function BoothLabels({ rooms }: { rooms: Room[] }) {
  const selected = useWorldStore((s) => s.selectedBoothId);
  const [ids, setIds] = useState<string[]>([]);
  const elapsed = useRef(1),
    signature = useRef('');
  const labels = useMemo(
    () => new Map(rooms.map((room) => [room.id, { room, spec: boothPhysical(room) }])),
    [rooms],
  );
  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 0.25) {
      return;
    }
    elapsed.current = 0;
    const next = rooms
      .map((room) => {
        const { spec } = labels.get(room.id)!;
        return {
          id: room.id,
          distance:
            room.id === selected
              ? -1
              : Math.hypot(
                  spec.interior[0] - camera.position.x,
                  spec.interior[1] - camera.position.z,
                ),
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 64)
      .map((item) => item.id)
      .sort();
    const key = next.join('\0');
    if (key !== signature.current) {
      signature.current = key;
      setIds(next);
    }
  });
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const uv = new Float32Array(ids.length * 4),
      positions: Array<[number, number, number]> = [];
    ids.forEach((id, i) => {
      const item = labels.get(id)!;
      const x = (i % 4) * 256,
        y = Math.floor(i / 4) * 64;
      context.fillStyle = '#23313e';
      context.fillRect(x + 2, y + 2, 252, 60);
      context.fillStyle = id === selected ? '#ffd795' : '#ffffff';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      let font = 32;
      const text = item.room.label ?? id;
      context.font = `${font}px system-ui`;
      while (font > 10 && context.measureText(text).width > 240) {
        context.font = `${--font}px system-ui`;
      }
      context.fillText(text, x + 128, y + 32, 240);
      uv.set([x / 1024, 1 - (y + 64) / 1024, 0.25, 0.0625], i * 4);
      positions.push([item.spec.interior[0], item.spec.height + 0.45, item.spec.interior[1]]);
    });
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const geometry = new PlaneGeometry(2.6, 0.65);
    geometry.setAttribute('atlasRect', new InstancedBufferAttribute(uv, 4));
    const material = new ShaderMaterial({
      uniforms: { atlas: { value: texture } },
      transparent: true,
      depthWrite: false,
      vertexShader:
        'attribute vec4 atlasRect; varying vec2 labelUv; void main(){ labelUv=atlasRect.xy+uv*atlasRect.zw; vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.); center.xy+=position.xy; gl_Position=projectionMatrix*center; }',
      fragmentShader:
        'uniform sampler2D atlas; varying vec2 labelUv; void main(){ gl_FragColor=texture2D(atlas,labelUv); if(gl_FragColor.a<0.05)discard;\n#include <colorspace_fragment>\n}',
    });
    const mesh = new InstancedMesh(geometry, material, ids.length);
    positions.forEach((position, i) =>
      mesh.setMatrixAt(i, new Matrix4().makeTranslation(...position)),
    );
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.renderOrder = 2;
    // Atlas text is bounded; selected/near labels stay readable at human scale.
    return { texture, geometry, material, mesh };
  }, [ids, labels, selected]);
  useEffect(
    () => () => {
      resources?.mesh.dispose();
      resources?.geometry.dispose();
      resources?.material.dispose();
      resources?.texture.dispose();
    },
    [resources],
  );
  return resources ? <primitive object={resources.mesh} dispose={null} /> : null;
}
