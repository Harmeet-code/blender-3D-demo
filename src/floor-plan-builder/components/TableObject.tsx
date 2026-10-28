import { useRef } from 'react';
import { Line } from '@react-three/drei';
import { DoubleSide, type Group } from 'three';
import { tableChairNodes, tableHeight } from '../model/table.ts';
import { ChairMesh } from './ChairObject.tsx';
import type { PlanObject } from '../model/types.ts';

export function TableObject({
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
  void color;
  const [w, , d] = object.dimensions;
  const variant = object.tableVariant;
  const round = object.tableTop === 'round';
  const h = tableHeight(object);
  const root = useRef<Group>(null);
  const near: boolean = true;

  const opacity = ghost ? 0.45 : 1;
  const radius = Math.min(w, d) / 2;
  const draped = variant === 'cloth-draped';
  const chairs = tableChairNodes(object);
  const alu = { roughness: 0.3, metalness: 0.85 };

  if (!near && !topDown) {
    return (
      <group ref={root} name="TableFar">
        {round ? (
          <mesh position={[0, h / 2, 0]} castShadow>
            <cylinderGeometry args={[radius, radius, h, 10]} />
            <meshStandardMaterial
              color="#F8F9FA"
              roughness={0.2}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ) : (
          <mesh position={[0, h / 2, 0]} castShadow>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color="#F8F9FA"
              roughness={0.2}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group ref={root} name="TradeTable">
      {!draped && (
        <>
          {round ? (
            <mesh position={[0, h - 0.02, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[radius, radius, 0.04, 24]} />
              <meshStandardMaterial
                color="#F8F9FA"
                roughness={0.2}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          ) : (
            <mesh position={[0, h - 0.02, 0]} castShadow receiveShadow>
              <boxGeometry args={[w, 0.04, d]} />
              <meshStandardMaterial
                color="#F8F9FA"
                roughness={0.2}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          )}
        </>
      )}
      {draped ? (
        <group name="ClothCover">
          <mesh position={[0, (h * 3) / 4, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius / 1.75, h / 2, 20, 2, true]} />
            <meshStandardMaterial
              color={ghost ? '#F8F9FA' : '#2563EB'}
              roughness={0.85}
              transparent={ghost}
              opacity={opacity}
              side={DoubleSide}
            />
          </mesh>
          <mesh position={[0, h / 4, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[radius / 1.75, radius / 1.1, h / 2, 20, 2, true]} />
            <meshStandardMaterial
              color={ghost ? '#F8F9FA' : '#2563EB'}
              roughness={0.85}
              transparent={ghost}
              opacity={opacity}
              side={DoubleSide}
            />
          </mesh>
          <mesh position={[0, h - 0.02, 0]} castShadow>
            <cylinderGeometry args={[radius, radius, 0.04, 20]} />
            <meshStandardMaterial
              color="#F8F9FA"
              roughness={0.2}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <mesh
                key={`${x}:${z}`}
                position={[(x * radius) / 1.6, 0.15, (z * radius) / 1.6]}
                rotation={[z * 0.15, 0, -x * 0.15]}
                castShadow
              >
                <coneGeometry args={[0.09, 0.3, 8]} />
                <meshStandardMaterial
                  color={ghost ? '#F8F9FA' : '#2563EB'}
                  roughness={0.85}
                  transparent={ghost}
                  opacity={opacity}
                  side={DoubleSide}
                />
              </mesh>
            )),
          )}
        </group>
      ) : variant === 'cocktail-standing' ? (
        <group name="PedestalBase">
          <mesh position={[0, (h - 0.08) / 2 + 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, h - 0.08, 12]} />
            <meshStandardMaterial color="#C0C4C8" {...alu} transparent={ghost} opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.01, 0]} receiveShadow>
            <cylinderGeometry args={[0.35, 0.35, 0.02, 20]} />
            <meshStandardMaterial color="#C0C4C8" {...alu} transparent={ghost} opacity={opacity} />
          </mesh>
        </group>
      ) : (
        <group name="FourLegs">
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <group key={`${x}:${z}`} position={[x * (w / 2 - 0.08), 0, z * (d / 2 - 0.08)]}>
                <mesh position={[0, (h - 0.04) / 2, 0]} castShadow>
                  <cylinderGeometry args={[0.025, 0.025, h - 0.04, 10]} />
                  <meshStandardMaterial
                    color="#C0C4C8"
                    {...alu}
                    transparent={ghost}
                    opacity={opacity}
                  />
                </mesh>
                {near && (
                  <mesh position={[0, 0.01, 0]}>
                    <cylinderGeometry args={[0.03, 0.035, 0.02, 10]} />
                    <meshStandardMaterial
                      color="#20252A"
                      roughness={1}
                      transparent={ghost}
                      opacity={opacity}
                    />
                  </mesh>
                )}
              </group>
            )),
          )}
        </group>
      )}
      {!draped &&
        chairs.map((node, index) => (
          <ChairMesh key={index} at={[node.at[0], 0, node.at[1]]} yaw={node.yaw} ghost={ghost} />
        ))}
      {topDown && (
        <>
          {round ? (
            <Line
              points={Array.from({ length: 25 }, (_, i) => {
                const a = (i / 24) * Math.PI * 2;
                return [Math.cos(a) * radius, 0.1, Math.sin(a) * radius] as [
                  number,
                  number,
                  number,
                ];
              })}
              color="#1E2022"
              lineWidth={2}
            />
          ) : (
            <Line
              points={[
                [-w / 2, 0.1, -d / 2],
                [w / 2, 0.1, -d / 2],
                [w / 2, 0.1, d / 2],
                [-w / 2, 0.1, d / 2],
                [-w / 2, 0.1, -d / 2],
              ]}
              color="#1E2022"
              lineWidth={2}
            />
          )}
          {variant === 'cocktail-standing' && !draped && (
            <mesh position={[0, 0.05, 0]}>
              <circleGeometry args={[0.06, 10]} />
              <meshBasicMaterial color="#C0C4C8" toneMapped={false} side={DoubleSide} />
            </mesh>
          )}
          {chairs.map((node, index) => (
            <mesh
              key={index}
              position={[node.at[0], 0.05, node.at[1]]}
              rotation={[-Math.PI / 2, 0, node.yaw]}
            >
              <ringGeometry args={[0.2, 0.26, 16, 1, 0, Math.PI * 1.5]} />
              <meshBasicMaterial
                color="#2563EB"
                toneMapped={false}
                transparent
                opacity={0.9}
                side={DoubleSide}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}
