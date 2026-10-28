import { useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { TraversalMotionContext } from '../wayfinding/walkthrough/motion-context.tsx';
import { proximityDoors } from '../wayfinding/game/door-state.ts';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { CanvasTexture, MathUtils, SRGBColorSpace, type Group } from 'three';
import { materials } from './materials.ts';
import { entranceClearWidth, entranceNavigation } from '../model/entrance.ts';
import type { PlanObject } from '../model/types.ts';

function useHeaderSign() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#111C27';
    context.fillRect(0, 0, 1024, 160);
    context.fillStyle = '#06B6D4';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 56px Arial, sans-serif';
    context.fillText('WELCOME TO EXHIBITION HALL A', 512, 80, 980);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useLaneSign(text: string, color: string) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#111C27';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 84px Arial, sans-serif';
    context.fillText(text, 64, 68, 110);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, [text, color]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function EntranceObject({
  object,
  color,
  ghost = false,
  topDown = false,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
  topDown?: boolean;
}) {
  const [w, h, d] = object.dimensions;
  const playback = useContext(TraversalMotionContext);
  const gate = object.entranceGate;
  const open = gate === 'open-arch' ? true : object.entranceOpen;
  const opening = entranceClearWidth(object);
  const root = useRef<Group>(null);
  const near: boolean = true;
  const leftDoor = useRef<Group>(null);
  const rightDoor = useRef<Group>(null);
  const arms = useRef<Group>(null);
  const slide = useRef({ value: open ? 1 : 0 });
  const opacity = ghost ? 0.45 : 1;

  useFrame(({ invalidate }, delta) => {
    const target =
      playback && gate === 'arch-sliding-doors' && object.entranceOpen
        ? proximityDoors.has(object.id)
          ? 1
          : 0
        : open
          ? 1
          : 0;
    const current = slide.current.value;
    if (Math.abs(current - target) > 0.001) {
      slide.current.value = MathUtils.damp(current, target, 6, Math.min(delta, 0.1));
      if (leftDoor.current) {
        leftDoor.current.position.x = -0.9 * slide.current.value;
      }
      if (rightDoor.current) {
        rightDoor.current.position.x = 0.9 * slide.current.value;
      }
      if (arms.current) {
        arms.current.rotation.y = slide.current.value * ((2 * Math.PI) / 3);
      }
      invalidate();
    } else if (slide.current.value !== target) {
      slide.current.value = target;
      if (leftDoor.current) {
        leftDoor.current.position.x = -0.9 * target;
      }
      if (rightDoor.current) {
        rightDoor.current.position.x = 0.9 * target;
      }
      invalidate();
    }
  });

  useEffect(() => {
    slide.current.value = open ? 1 : 0;
    if (leftDoor.current) {
      leftDoor.current.position.x = open ? -0.9 : 0;
    }
    if (rightDoor.current) {
      rightDoor.current.position.x = open ? 0.9 : 0;
    }
  }, [open, gate]);

  const header = useHeaderSign();
  const go = useLaneSign('▲', '#10B981');
  const stop = useLaneSign('✕', '#F43F5E');
  const lane = open ? go : stop;

  const columnX = w / 2 - 0.25;
  const headerY = h - 0.3;
  void color;

  const far = (
    <group name="EntranceFar">
      <mesh position={[-columnX, h / 2, 0]} castShadow>
        <boxGeometry args={[0.5, h, d]} />
        <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[columnX, h / 2, 0]} castShadow>
        <boxGeometry args={[0.5, h, d]} />
        <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, headerY, 0]} castShadow>
        <boxGeometry args={[w, 0.6, d]} />
        <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
      </mesh>
    </group>
  );

  if (!near && !topDown) {
    return <group ref={root}>{far}</group>;
  }

  return (
    <group ref={root} name="VenueEntrance">
      <mesh position={[-columnX, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, h, d]} />
        <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[columnX, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, h, d]} />
        <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, headerY, 0]} castShadow>
        <boxGeometry args={[w, 0.6, d]} />
        <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
      </mesh>
      {!ghost && header && (
        <mesh name="SignageHeader" position={[0, headerY, d / 2 + 0.005]}>
          <planeGeometry args={[Math.min(2.4, w - 0.6), 0.4]} />
          <meshBasicMaterial map={header} toneMapped={false} />
        </mesh>
      )}
      {gate === 'arch-sliding-doors' && (
        <>
          <group ref={leftDoor} position={[-0.9 * slide.current.value, 0, 0]}>
            <mesh position={[-opening / 4, 1.2, 0]} castShadow>
              <boxGeometry args={[0.85, 2.4, 0.02]} />
              <meshPhysicalMaterial
                {...materials.polishedGlass}
                transparent
                opacity={ghost ? 0.45 : 0.55}
                depthWrite={false}
                side={2}
              />
            </mesh>
            <mesh position={[-opening / 4 + 0.435, 1.2, 0]}>
              <boxGeometry args={[0.02, 2.4, 0.03]} />
              <meshStandardMaterial {...materials.rubber} transparent={ghost} opacity={opacity} />
            </mesh>
          </group>
          <group ref={rightDoor} position={[0.9 * slide.current.value, 0, 0]}>
            <mesh position={[opening / 4, 1.2, 0]} castShadow>
              <boxGeometry args={[0.85, 2.4, 0.02]} />
              <meshPhysicalMaterial
                {...materials.polishedGlass}
                transparent
                opacity={ghost ? 0.45 : 0.55}
                depthWrite={false}
                side={2}
              />
            </mesh>
            <mesh position={[opening / 4 - 0.435, 1.2, 0]}>
              <boxGeometry args={[0.02, 2.4, 0.03]} />
              <meshStandardMaterial {...materials.rubber} transparent={ghost} opacity={opacity} />
            </mesh>
          </group>
          {near && (
            <mesh position={[0, 0.011, 0]}>
              <boxGeometry args={[opening, 0.02, 0.02]} />
              <meshStandardMaterial
                color="#3A4046"
                roughness={0.6}
                metalness={0.4}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          )}
        </>
      )}
      {gate === 'turnstile-lanes' && (
        <>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (opening / 4), 0, 0]}>
              <mesh position={[0, 0.5, 0]} castShadow>
                <boxGeometry args={[0.3, 1.0, 1.0]} />
                <meshStandardMaterial
                  {...materials.brushedSteel}
                  transparent={ghost}
                  opacity={opacity}
                />
              </mesh>
              <group ref={side < 0 ? undefined : arms} position={[0, 0.9, 0.3]}>
                {[0, 1, 2].map((arm) => (
                  <mesh
                    key={arm}
                    rotation={[0, (arm * 2 * Math.PI) / 3, Math.PI / 2]}
                    position={[
                      Math.cos((arm * 2 * Math.PI) / 3) * 0.12,
                      Math.sin((arm * 2 * Math.PI) / 3) * 0.12,
                      0.2,
                    ]}
                  >
                    <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
                    <meshStandardMaterial
                      {...materials.brushedSteel}
                      transparent={ghost}
                      opacity={opacity}
                    />
                  </mesh>
                ))}
              </group>
            </group>
          ))}
        </>
      )}
      {[-1, 1].map((side) => (
        <mesh
          key={`banner-${side}`}
          position={[side * (w / 2 + 0.008), 1.25, 0]}
          rotation={[0, side * (Math.PI / 2), 0]}
          castShadow
        >
          <boxGeometry args={[0.6, 2.5, 0.01]} />
          <meshStandardMaterial {...materials.vinylBlue} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      {near && (
        <group position={[0, headerY - 0.35, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.1, 0.2]} />
            <meshStandardMaterial {...materials.darkPanel} transparent={ghost} opacity={opacity} />
          </mesh>
          <mesh position={[-0.1, -0.06, 0]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshBasicMaterial color={open ? '#10B981' : '#F43F5E'} toneMapped={false} />
          </mesh>
          <mesh position={[0.1, -0.06, 0]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshBasicMaterial color="#F59E0B" toneMapped={false} />
          </mesh>
        </group>
      )}
      {!ghost && lane && (
        <mesh position={[0, headerY - 0.05, d / 2 + 0.005]}>
          <planeGeometry args={[0.18, 0.18]} />
          <meshBasicMaterial map={lane} toneMapped={false} transparent />
        </mesh>
      )}
      {topDown && (
        <TopDownOverlay
          w={w}
          d={d}
          open={open}
          portal={
            entranceNavigation({ width: w, height: h, depth: d, gate, doorsOpen: open }).portal
          }
        >
          <></>
        </TopDownOverlay>
      )}
    </group>
  );
}

function TopDownOverlay({
  w,
  d,
  open,
  portal,
  children,
}: {
  w: number;
  d: number;
  open: boolean;
  portal: [readonly [number, number], readonly [number, number]] | null;
  children: ReactNode;
}) {
  void children;
  const hw = w / 2;
  const outline: [number, number, number][] = [
    [-hw, 0.1, -d / 2],
    [hw, 0.1, -d / 2],
    [hw, 0.1, d / 2],
    [-hw, 0.1, d / 2],
    [-hw, 0.1, -d / 2],
  ];
  return (
    <>
      <Line points={outline} color="#1E2022" lineWidth={2} />
      <Line
        points={[
          [-hw, 0.1, 0],
          [hw, 0.1, 0],
        ]}
        color="#06B6D4"
        lineWidth={1.5}
        dashed
      />
      {portal && (
        <Line
          points={[
            [portal[0][0], 0.1, portal[0][1]],
            [portal[1][0], 0.1, portal[1][1]],
          ]}
          color="#FFFFFF"
          lineWidth={2}
          dashed
        />
      )}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.3, 0.8, 3]} />
        <meshBasicMaterial color={open ? '#10B981' : '#F43F5E'} toneMapped={false} />
      </mesh>
    </>
  );
}
