import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { type Group } from 'three';
import type { PlanObject } from '../model/types.ts';
import { RouteLabel } from '../wayfinding/rendering/Beacon.tsx';

const DEG = Math.PI / 180;

function poseAngles(pose: PlanObject['avatarPose']) {
  switch (pose) {
    case 'walking':
      return { legL: 0.35, legR: -0.35, armL: -0.3, armR: 0.3, sit: 0 };
    case 'pointing':
      return { legL: 0, legR: 0, armL: 0.05, armR: 1.4, sit: 0 };
    case 'sitting':
      return { legL: 1.45, legR: 1.45, armL: 0.15, armR: 0.15, sit: 0.33 };
    default:
      return { legL: 0, legR: 0, armL: 0.05, armR: -0.05, sit: 0 };
  }
}

export function AvatarObject({
  object,
  color,
  ghost = false,
  topDown = false,
  showPin = false,
  forceDetail = false,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
  topDown?: boolean;
  showPin?: boolean;
  forceDetail?: boolean;
}) {
  void color;
  const skin = object.avatarSkin;
  const clothing = object.avatarClothing;
  const hair = object.avatarHair;
  const pose = poseAngles(object.avatarPose);
  const root = useRef<Group>(null);
  const upper = useRef<Group>(null);
  const near: boolean = true;
  const invalidate = useThree((state) => state.invalidate);
  const clock = useMemo(() => ({ elapsed: 0 }), []);
  const [sx, sy, sz] = object.scale;
  const lock: [number, number, number] = [1 / sx, 1 / sy, 1 / sz];

  useFrame((_, delta) => {
    if (object.avatarAnimated && !ghost && !forceDetail && upper.current) {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        clock.elapsed += Math.min(delta, 0.05);
        upper.current.position.y =
          -pose.sit + Math.sin((clock.elapsed * 2 * Math.PI) / 2.4) * 0.005;
        upper.current.rotation.z = Math.sin((clock.elapsed * 2 * Math.PI) / 4) * 0.8 * DEG;
        invalidate();
      }
    }
  });

  const opacity = ghost ? 0.45 : 1;
  const skinMat = { color: skin, roughness: 0.6, metalness: 0 };
  const clothMat = { color: clothing, roughness: 0.8, metalness: 0 };

  if (!near && !topDown && !forceDetail) {
    return (
      <group ref={root} name="AvatarFar">
        <group scale={lock}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.13, 1.3, 6]} />
            <meshStandardMaterial {...clothMat} transparent={ghost} opacity={opacity} />
          </mesh>
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.12, 6, 5]} />
            <meshStandardMaterial {...skinMat} transparent={ghost} opacity={opacity} />
          </mesh>
        </group>
      </group>
    );
  }

  if (topDown) {
    return (
      <group ref={root} name="AvatarTopDown">
        <group scale={lock}>
          <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.225, 20]} />
            <meshBasicMaterial color="#06B6D4" toneMapped={false} transparent opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.05, -0.32]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.09, 0.22, 3]} />
            <meshBasicMaterial color="#06B6D4" toneMapped={false} transparent opacity={opacity} />
          </mesh>
        </group>
      </group>
    );
  }

  return (
    <group ref={root} name="StandingAvatar">
      <group scale={lock}>
        <group name="WalkTorso" ref={upper} position={[0, -pose.sit, 0]}>
          <mesh position={[0, 1.12, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.14, 0.72, 14]} />
            <meshStandardMaterial {...clothMat} transparent={ghost} opacity={opacity} />
          </mesh>
          <group position={[0, 1.56, 0]}>
            <mesh position={[0, 0.12, 0]} castShadow>
              <sphereGeometry args={[0.12, 16, 12]} />
              <meshStandardMaterial {...skinMat} transparent={ghost} opacity={opacity} />
            </mesh>
            <mesh position={[0, 0.11, 0.012]} castShadow>
              <sphereGeometry args={[0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial
                color={hair}
                roughness={0.9}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          </group>
          {(
            [
              { side: -1, swing: pose.armL },
              { side: 1, swing: pose.armR },
            ] as const
          ).map(({ side, swing }) => (
            <group
              name={`WalkArm${side}`}
              key={side}
              position={[side * 0.22, 1.4, 0]}
              rotation={[swing, 0, side * -0.06]}
            >
              <mesh position={[0, -0.175, 0]} castShadow>
                <cylinderGeometry args={[0.04, 0.035, 0.35, 10]} />
                <meshStandardMaterial {...skinMat} transparent={ghost} opacity={opacity} />
              </mesh>
              {near && (
                <>
                  <mesh position={[0, 0, 0]}>
                    <sphereGeometry args={[0.05, 8, 6]} />
                    <meshStandardMaterial {...skinMat} transparent={ghost} opacity={opacity} />
                  </mesh>
                  <mesh position={[0, -0.35, 0]}>
                    <sphereGeometry args={[0.035, 8, 6]} />
                    <meshStandardMaterial {...skinMat} transparent={ghost} opacity={opacity} />
                  </mesh>
                </>
              )}
            </group>
          ))}
        </group>
        {(
          [
            { side: -1, swing: pose.legL },
            { side: 1, swing: pose.legR },
          ] as const
        ).map(({ side, swing }) => (
          <group
            name={`WalkHip${side}`}
            key={side}
            position={[side * 0.1, 0.81 - pose.sit, 0]}
            rotation={[swing, 0, 0]}
          >
            <mesh position={[0, -0.195, 0]} castShadow>
              <cylinderGeometry args={[0.05, 0.047, 0.39, 10]} />
              <meshStandardMaterial {...clothMat} transparent={ghost} opacity={opacity} />
            </mesh>
            <group name={`WalkKnee${side}`} position={[0, -0.39, 0]}>
              <mesh>
                <sphereGeometry args={[0.052, 8, 6]} />
                <meshStandardMaterial {...clothMat} transparent={ghost} opacity={opacity} />
              </mesh>
              <mesh position={[0, -0.195, 0]} castShadow>
                <cylinderGeometry args={[0.047, 0.04, 0.39, 10]} />
                <meshStandardMaterial {...clothMat} transparent={ghost} opacity={opacity} />
              </mesh>
              <group name={`WalkAnkle${side}`} position={[0, -0.39, 0]} rotation={[-swing, 0, 0]}>
                <mesh position={[0, 0, -0.04]} castShadow>
                  <boxGeometry args={[0.09, 0.06, 0.2]} />
                  <meshStandardMaterial
                    color="#1E2022"
                    roughness={0.9}
                    transparent={ghost}
                    opacity={opacity}
                  />
                </mesh>
              </group>
            </group>{' '}
          </group>
        ))}
        {(showPin || object.avatarPin) && !ghost && (
          <group name="WayfindingMarkerPin">
            <mesh position={[0, 2.2, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.15, 0.3, 16]} />
              <meshStandardMaterial
                color="#06B6D4"
                emissive="#06B6D4"
                emissiveIntensity={0.8}
                roughness={0.4}
              />
            </mesh>
            <mesh position={[0, 2.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.16, 0.2, 24]} />
              <meshBasicMaterial
                color="#06B6D4"
                toneMapped={false}
                transparent
                opacity={0.9}
                side={2}
              />
            </mesh>
            <RouteLabel at={[0, 2.55, 0]} text={object.name || 'YOU ARE HERE'} />
          </group>
        )}
        {ghost && (
          <Line
            points={[
              [0, 0, 0],
              [0, 1.8, 0],
            ]}
            color="#9ac8d8"
            lineWidth={1}
          />
        )}
      </group>
    </group>
  );
}
