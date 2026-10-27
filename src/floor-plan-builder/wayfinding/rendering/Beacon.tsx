import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  SRGBColorSpace,
  Color,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';
import { gsap } from 'gsap';
import { useRouteMotion } from './use-route-motion.ts';
import { QUALITY, selectTier, usePolishStore } from '../store/polish-store.ts';
import { usePlaybackStore } from '../store/playback-store.ts';

export function useTextSprite(text: string, accent = '#F8F9FA') {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = 'rgba(10,16,24,0.88)';
    ctx.beginPath();
    ctx.roundRect(8, 12, 1008, 232, 28);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 58px system-ui,sans-serif';
    const words = text.split(/\s+/),
      lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > 940) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
    const height = Math.min(88, 208 / lines.length);
    ctx.font = `600 ${Math.min(58, height * 0.75)}px system-ui,sans-serif`;
    lines.forEach((value, i) =>
      ctx.fillText(value, 512, 128 + (i - (lines.length - 1) / 2) * height, 940),
    );
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, [text, accent]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function RouteLabel({
  text,
  at,
  color = '#F8F9FA',
  faint = false,
}: {
  text: string;
  at: [number, number, number];
  color?: string;
  faint?: boolean;
}) {
  const sprite = useTextSprite(text, color),
    root = useRef<Mesh>(null);
  const scratch = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!root.current) {
      return;
    }
    const depth =
      camera.type === 'PerspectiveCamera'
        ? camera.position.distanceTo(root.current.getWorldPosition(scratch))
        : 1;
    const width = ((2 * depth) / (camera.projectionMatrix.elements[5]! * size.height)) * 180;
    root.current.scale.setScalar(Math.min(2.4, Math.max(0.7, width / 2.4)));
  });
  if (!sprite) {
    return null;
  }
  return (
    <Billboard position={at}>
      <mesh ref={root} renderOrder={24} raycast={() => {}}>
        <planeGeometry args={[2.4, 0.6]} />
        <meshBasicMaterial
          map={sprite}
          toneMapped={false}
          transparent
          opacity={faint ? 0.45 : 1}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </Billboard>
  );
}

export function Beacon({
  at,
  label,
  color = '#F59E0B',
  animated = true,
  topDown = false,
  showLabel = true,
}: {
  at: readonly [number, number, number];
  label: string;
  color?: string;
  animated?: boolean;
  topDown?: boolean;
  showLabel?: boolean;
}) {
  const ring = useRef<Mesh>(null),
    ringMaterial = useRef<MeshBasicMaterial>(null);
  const lighting = usePolishStore((state) => state.lighting);
  const tier = usePolishStore(selectTier);
  const playing = usePlaybackStore((state) => !!state.session);
  const luminousColor = useMemo(
    () => new Color(color).multiplyScalar(playing ? (lighting === 'evening' ? 3 : 2) : 1),
    [color, playing, lighting],
  );
  const pulse = useMemo(() => ({ value: 0 }), []);
  const glowMap = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, 'rgba(255,255,255,0.75)');
    glow.addColorStop(0.2, 'rgba(255,255,255,0.25)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => glowMap?.dispose(), [glowMap]);
  const invalidate = useThree((state) => state.invalidate),
    motion = useRouteMotion(animated);
  const gradient = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    const fade = ctx.createLinearGradient(0, 0, 0, 64);
    fade.addColorStop(0, '#000');
    fade.addColorStop(0.7, '#555');
    fade.addColorStop(1, '#fff');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 2, 64);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => gradient?.dispose(), [gradient]);
  useEffect(() => {
    pulse.value = 0;
    invalidate();
    if (!motion.animate) {
      return;
    }
    const tween = gsap.to(pulse, {
      value: 1,
      duration: 1.6,
      repeat: -1,
      ease: 'none',
      onUpdate: invalidate,
    });
    return () => {
      tween.kill();
    };
  }, [motion.animate, invalidate, pulse]);
  useFrame(() => {
    ring.current?.scale.setScalar(1 + pulse.value * 0.9);
    if (ringMaterial.current) {
      ringMaterial.current.opacity = 0.9 * (1 - pulse.value);
    }
  });
  return (
    <group name="RouteBeacon" position={[...at]}>
      {playing && QUALITY[tier].glow && glowMap && (
        <Billboard position={[0, topDown ? 0.06 : 1.2, 0]}>
          <mesh renderOrder={21} raycast={() => {}}>
            <planeGeometry args={[2.5, 2.5]} />
            <meshBasicMaterial
              map={glowMap}
              color={luminousColor}
              toneMapped={false}
              transparent
              opacity={0.45}
              blending={AdditiveBlending}
              depthWrite={false}
              depthTest={!topDown}
            />
          </mesh>
        </Billboard>
      )}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.025, 0]}
        renderOrder={22}
        raycast={() => {}}
      >
        <ringGeometry args={[0.2, 0.28, 24]} />
        <meshBasicMaterial
          color={luminousColor}
          toneMapped={false}
          depthTest={!topDown}
          depthWrite={false}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh
        ref={ring}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.03, 0]}
        renderOrder={22}
        raycast={() => {}}
      >
        <ringGeometry args={[0.36, 0.46, 32]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color={luminousColor}
          toneMapped={false}
          transparent
          depthWrite={false}
          depthTest={!topDown}
        />
      </mesh>
      {!topDown && (
        <mesh position={[0, 1.5, 0]} renderOrder={21} raycast={() => {}}>
          <cylinderGeometry args={[0.15, 0.3, 3, 16, 1, true]} />
          <meshBasicMaterial
            color={luminousColor}
            alphaMap={gradient}
            toneMapped={false}
            transparent
            opacity={0.35}
            blending={AdditiveBlending}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {showLabel && (
        <RouteLabel text={label} color={color} at={[0, topDown ? 0.1 : 3.4, topDown ? -0.9 : 0]} />
      )}
    </group>
  );
}
