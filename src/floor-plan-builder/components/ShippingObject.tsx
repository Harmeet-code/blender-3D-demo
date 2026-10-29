import { useMemo, useRef } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { PlanObject } from '../model/types.ts';
import { shippingSpatialLayout } from '../model/shipping-spatial.ts';

type Props = { object: PlanObject; width: number; depth: number; ghost?: boolean };
const steel = '#27343B';
const yellow = '#F5B51B';
const red = '#B9352C';
const concrete = '#747B7D';
const palette = ['#245B82', '#D66A2C', '#A83A32', '#47764A', '#52616A'];

function Box({
  position,
  size,
  color,
  ghost = false,
  metalness = 0.05,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  ghost?: boolean;
  metalness?: number;
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.72}
        metalness={metalness}
        transparent={ghost}
        opacity={ghost ? 0.45 : 1}
      />
    </mesh>
  );
}

function DockDoor({
  x,
  y,
  state,
  number,
  ghost,
  docked,
}: {
  x: number;
  y: number;
  state: string;
  number: number;
  ghost: boolean;
  docked: boolean;
}) {
  const slats = useRef<Group>(null);
  const progress = useRef(0);
  const target = state === 'open' ? 1 : 0;
  useFrame((_, delta) => {
    const direction = target > progress.current ? 1 : -1;
    progress.current = Math.max(
      0,
      Math.min(1, progress.current + direction * Math.min(delta / 2.5, 1)),
    );
    const t = progress.current;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    if (slats.current) {
      slats.current.position.y = 1.2 + eased * (y - 0.5);
      slats.current.scale.y = 1 - eased * 0.88;
    }
  });
  return (
    <group position={[x, 0, 0]}>
      <Box position={[0, 1.2 + y / 2, 0.1]} size={[3.35, y, 0.2]} color="#D5D4CD" ghost={ghost} />
      <Box
        position={[-1.72, 1.2 + y / 2, -0.04]}
        size={[0.22, y + 0.25, 0.34]}
        color={steel}
        ghost={ghost}
      />
      <Box
        position={[1.72, 1.2 + y / 2, -0.04]}
        size={[0.22, y + 0.25, 0.34]}
        color={steel}
        ghost={ghost}
      />
      <Box position={[0, y + 1.33, 0]} size={[3.66, 0.26, 0.4]} color={yellow} ghost={ghost} />
      <group ref={slats} position={[0, 1.2, 0]}>
        {Array.from({ length: 16 }, (_, i) => (
          <Box
            key={i}
            position={[0, ((i + 0.5) * y) / 16, -0.12]}
            size={[3.18, (y / 16) * 0.88, 0.09]}
            color={i % 2 ? '#AEB6B6' : '#CFD3D0'}
            ghost={ghost}
            metalness={0.35}
          />
        ))}
      </group>
      <Box position={[0, y + 1.68, 0]} size={[3.8, 0.34, 0.18]} color="#173847" ghost={ghost} />
      <Text
        position={[0, y + 1.68, -0.105]}
        fontSize={0.19}
        color="white"
        anchorX="center"
        anchorY="middle"
      >{`BAY ${String(number).padStart(2, '0')}`}</Text>
      <Box position={[-1.42, 1.98, 0]} size={[0.24, 1.1, 0.28]} color="#171C1E" ghost={ghost} />
      <mesh position={[-1.42, state === 'open' ? 2.3 : 1.65, -0.17]}>
        <sphereGeometry args={[0.105, 12, 8]} />
        <meshBasicMaterial
          color={docked || state === 'open' ? red : '#39BD6B'}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Pallet({
  x,
  z,
  color = '#A47748',
  ghost = false,
}: {
  x: number;
  z: number;
  color?: string;
  ghost?: boolean;
}) {
  return (
    <group position={[x, 0, z]}>
      {[-0.32, 0, 0.32].map((xx) => (
        <Box
          key={xx}
          position={[xx, 0.08, 0]}
          size={[0.13, 0.16, 1.0]}
          color="#67472F"
          ghost={ghost}
        />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <Box
          key={i}
          position={[0, 0.18, -0.42 + i * 0.21]}
          size={[1.05, 0.07, 0.13]}
          color={color}
          ghost={ghost}
        />
      ))}
    </group>
  );
}

function Container({
  x,
  z,
  y = 0,
  color,
  label,
  ghost,
}: {
  x: number;
  z: number;
  y?: number;
  color: string;
  label: string;
  ghost: boolean;
}) {
  return (
    <group position={[x, y, z]}>
      <Box
        position={[0, 1.295, 0]}
        size={[2.44, 2.59, 6.06]}
        color={color}
        ghost={ghost}
        metalness={0.24}
      />
      {Array.from({ length: 19 }, (_, i) => (
        <Box
          key={`rib${i}`}
          position={[-1.18 + i * 0.131, 1.295, 0]}
          size={[0.035, 2.47, 6.08]}
          color={i % 2 ? color : '#34444B'}
          ghost={ghost}
          metalness={0.35}
        />
      ))}
      {[-1.19, 1.19].flatMap((xx) =>
        [-2.96, 2.96].map((zz) => (
          <group key={`${xx}:${zz}`}>
            <Box
              position={[xx, 0.13, zz]}
              size={[0.2, 0.26, 0.2]}
              color="#ADB5B4"
              ghost={ghost}
              metalness={0.65}
            />
            <Box
              position={[xx, 2.46, zz]}
              size={[0.2, 0.26, 0.2]}
              color="#ADB5B4"
              ghost={ghost}
              metalness={0.65}
            />
          </group>
        )),
      )}
      <Box position={[1.225, 1.3, 0]} size={[0.07, 2.3, 0.07]} color="#D0C9B8" ghost={ghost} />
      <Box position={[1.225, 1.3, 2.7]} size={[0.07, 2.3, 0.07]} color="#D0C9B8" ghost={ghost} />
      <Box position={[1.245, 1.3, -2.72]} size={[0.04, 1.05, 0.04]} color="#E0D9C9" ghost={ghost} />
      <Text
        position={[1.26, 1.72, -2.8]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.18}
        color="#F4F1E8"
        anchorX="center"
      >
        {label}
      </Text>
    </group>
  );
}

function Forklift({ x, z, ghost }: { x: number; z: number; ghost: boolean }) {
  const vehicle = useRef<Group>(null);
  const forks = useRef<Group>(null);
  useFrame(({ clock }) => {
    const phase = (clock.elapsedTime % 12) / 12;
    if (vehicle.current) {
      vehicle.current.position.x = x + Math.sin(phase * Math.PI * 2) * 1.5;
    }
    if (forks.current) {
      forks.current.position.y = 0.42 + (phase > 0.35 && phase < 0.62 ? 0.4 : 0);
    }
  });
  return (
    <group ref={vehicle} position={[x, 0, z]}>
      {[-0.55, 0.55].flatMap((xx) =>
        [-0.65, 0.65].map((zz) => (
          <mesh key={`${xx}:${zz}`} position={[xx, 0.24, zz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.26, 0.26, 0.18, 14]} />
            <meshStandardMaterial
              color="#202526"
              roughness={0.9}
              transparent={ghost}
              opacity={ghost ? 0.45 : 1}
            />
          </mesh>
        )),
      )}
      <Box position={[0, 0.62, 0]} size={[1.15, 0.65, 1.45]} color="#D8A51C" ghost={ghost} />
      <Box position={[0, 1.12, -0.28]} size={[0.85, 0.12, 0.64]} color="#252C2E" ghost={ghost} />
      <Box position={[-0.36, 1.6, -0.52]} size={[0.08, 1.15, 0.08]} color="#303A3D" ghost={ghost} />
      <Box position={[0.36, 1.6, -0.52]} size={[0.08, 1.15, 0.08]} color="#303A3D" ghost={ghost} />
      <Box position={[0, 2.17, -0.52]} size={[0.8, 0.08, 0.08]} color="#303A3D" ghost={ghost} />
      <group ref={forks} position={[0, 0.42, 0.85]}>
        <Box
          position={[-0.26, 0, 0.65]}
          size={[0.09, 0.08, 1.3]}
          color="#C5C9C5"
          ghost={ghost}
          metalness={0.45}
        />
        <Box
          position={[0.26, 0, 0.65]}
          size={[0.09, 0.08, 1.3]}
          color="#C5C9C5"
          ghost={ghost}
          metalness={0.45}
        />
      </group>
    </group>
  );
}

function NearProps({ width, density, ghost }: { width: number; density: number; ghost: boolean }) {
  const count = Math.round(density * 4);
  return (
    <group>
      {/* Braced shipping crate and a pair of taped, labelled cartons. */}
      {count > 0 && (
        <group position={[-width / 2 + 0.65, 0, 4.65]}>
          <Box position={[0, 0.55, 0]} size={[0.95, 1.1, 0.95]} color="#A77848" ghost={ghost} />
          <Box position={[0, 0.55, 0]} size={[0.07, 1.2, 0.07]} color="#D0AD76" ghost={ghost} />
          <Box position={[0, 0.55, 0.49]} size={[0.95, 0.07, 0.07]} color="#D0AD76" ghost={ghost} />
          <mesh position={[0, 0.55, 0.55]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[1.28, 0.06, 0.06]} />
            <meshStandardMaterial color="#D0AD76" transparent={ghost} opacity={ghost ? 0.45 : 1} />
          </mesh>
          <Box
            position={[0.22, 1.18, 0.49]}
            size={[0.35, 0.018, 0.015]}
            color="#F4E5C1"
            ghost={ghost}
          />
          <Text position={[0.22, 1.2, 0.51]} fontSize={0.08} color="#26343A" anchorX="center">
            FRAGILE
          </Text>
        </group>
      )}
      {Array.from({ length: count }, (_, i) => (
        <group
          key={`carton${i}`}
          position={[width / 2 - 1.4 - (i % 2) * 0.5, 0, 4.65 + Math.floor(i / 2) * 0.48]}
        >
          <Box
            position={[0, 0.24, 0]}
            size={[0.44, 0.46, 0.44]}
            color={i % 2 ? '#C99A5F' : '#D8B37A'}
            ghost={ghost}
          />
          <Box position={[0, 0.475, 0]} size={[0.065, 0.012, 0.45]} color="#B83E31" ghost={ghost} />
          <Box
            position={[0.12, 0.245, 0.226]}
            size={[0.12, 0.11, 0.012]}
            color="#F1EBD9"
            ghost={ghost}
          />
          {[0, 1, 2, 3].map((line) => (
            <Box
              key={line}
              position={[0.1 + line * 0.018, 0.245, 0.235]}
              size={[0.008, 0.07, 0.004]}
              color="#263238"
              ghost={ghost}
            />
          ))}
        </group>
      ))}
      {density > 0.3 && (
        <group position={[width / 2 - 0.8, 0, 3.5]}>
          {/* Red pallet jack: low fork frame, handle and swivelling load wheels. */}
          <Box position={[0, 0.16, 0.45]} size={[0.48, 0.16, 0.72]} color="#BD3A2C" ghost={ghost} />
          {[-0.18, 0.18].map((x) => (
            <Box
              key={x}
              position={[x, 0.08, 1.0]}
              size={[0.07, 0.07, 1.05]}
              color="#B9C1C0"
              ghost={ghost}
              metalness={0.4}
            />
          ))}
          <Box
            position={[0, 0.62, -0.03]}
            size={[0.055, 0.9, 0.055]}
            color="#424C4F"
            ghost={ghost}
          />
          <Box
            position={[0, 1.08, -0.13]}
            size={[0.42, 0.07, 0.07]}
            color="#252D2F"
            ghost={ghost}
          />
        </group>
      )}
      {density > 0.45 && (
        <group position={[-width / 2 + 0.7, 0, 5.6]}>
          {/* Upright hand truck and two tyres. */}
          <Box
            position={[0, 0.65, 0]}
            size={[0.07, 1.25, 0.08]}
            color="#46545A"
            ghost={ghost}
            metalness={0.3}
          />
          <Box
            position={[0, 0.18, 0.24]}
            size={[0.55, 0.07, 0.46]}
            color="#8A9698"
            ghost={ghost}
            metalness={0.45}
          />
          <Box
            position={[0, 1.25, -0.08]}
            size={[0.36, 0.07, 0.07]}
            color="#46545A"
            ghost={ghost}
          />
          {[-0.19, 0.19].map((x) => (
            <mesh key={x} position={[x, 0.16, -0.01]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.09, 12]} />
              <meshStandardMaterial color="#202426" />
            </mesh>
          ))}
        </group>
      )}
      {density > 0.65 && (
        <group position={[width / 2 - 0.8, 0, 6.4]}>
          {/* Compact check-in counter. */}
          <Box position={[0, 0.86, 0]} size={[1.2, 0.12, 0.62]} color="#34464B" ghost={ghost} />
          <Box position={[-0.48, 0.42, 0]} size={[0.08, 0.8, 0.52]} color="#566368" ghost={ghost} />
          <Box position={[0.48, 0.42, 0]} size={[0.08, 0.8, 0.52]} color="#566368" ghost={ghost} />
          <Box
            position={[0, 0.95, 0.08]}
            size={[0.48, 0.035, 0.34]}
            color="#1B292E"
            ghost={ghost}
          />
          <Text position={[0, 1.04, 0.12]} fontSize={0.105} color="#F0E5C9" anchorX="center">
            CHECK IN
          </Text>
        </group>
      )}
      {density > 0.85 && (
        <group position={[-width / 2 + 1.4, 0, 6.35]}>
          {/* Wheeled wire cage trolley for parcels staged beside the desk. */}
          <Box position={[0, 0.22, 0]} size={[0.82, 0.06, 0.92]} color="#899496" ghost={ghost} />
          {[-0.37, 0.37].flatMap((x) =>
            [-0.42, 0.42].map((z) => (
              <Box
                key={`${x}:${z}`}
                position={[x, 0.92, z]}
                size={[0.035, 1.4, 0.035]}
                color="#BAC3C3"
                ghost={ghost}
                metalness={0.45}
              />
            )),
          )}
          {[0.4, 0.8, 1.2].map((y) => (
            <Box
              key={y}
              position={[0, y, 0.42]}
              size={[0.72, 0.025, 0.025]}
              color="#BAC3C3"
              ghost={ghost}
              metalness={0.45}
            />
          ))}
          {[-0.28, 0.28].map((x) => (
            <mesh key={x} position={[x, 0.12, 0.42]}>
              <cylinderGeometry args={[0.11, 0.11, 0.08, 10]} />
              <meshStandardMaterial color="#202526" />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function SafetyPictogram({
  kind,
  position,
}: {
  kind: 'ppe' | 'forklift';
  position: [number, number, number];
}) {
  const ppe = kind === 'ppe';
  return (
    <group position={position} rotation={[0, ppe ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <Box position={[0, 0, 0]} size={[0.82, 1.05, 0.07]} color={ppe ? '#F2C94C' : '#E6E8E3'} />
      {ppe ? (
        <>
          <mesh position={[0, 0.29, 0.06]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color="#172226" />
          </mesh>
          <Box position={[0, 0.44, 0.06]} size={[0.34, 0.055, 0.08]} color="#172226" />
          <Box position={[0, 0.02, 0.06]} size={[0.28, 0.4, 0.08]} color="#173F4A" />
          {[-1, 1].map((side) => (
            <group key={side}>
              <Box position={[side * 0.22, 0.05, 0.06]} size={[0.09, 0.37, 0.08]} color="#172226" />
              <Box
                position={[side * 0.09, -0.28, 0.06]}
                size={[0.09, 0.32, 0.08]}
                color="#172226"
              />
            </group>
          ))}
          <Text position={[0, -0.45, 0.07]} fontSize={0.105} color="#172226" anchorX="center">
            PPE
          </Text>
        </>
      ) : (
        <>
          <Box position={[0, -0.2, 0.06]} size={[0.43, 0.2, 0.09]} color="#E1A814" />
          <Box position={[-0.13, -0.03, 0.06]} size={[0.2, 0.15, 0.08]} color="#E1A814" />
          <Box position={[-0.02, 0.14, 0.06]} size={[0.28, 0.055, 0.08]} color="#172226" />
          <Box position={[0.15, 0.0, 0.06]} size={[0.055, 0.42, 0.08]} color="#172226" />
          <Box position={[0.28, -0.26, 0.06]} size={[0.28, 0.045, 0.08]} color="#172226" />
          {[-0.14, 0.14].map((x) => (
            <mesh key={x} position={[x, -0.34, 0.07]}>
              <cylinderGeometry args={[0.07, 0.07, 0.07, 10]} />
              <meshStandardMaterial color="#172226" />
            </mesh>
          ))}
          <Text position={[0, -0.46, 0.07]} fontSize={0.09} color="#172226" anchorX="center">
            FORKLIFT
          </Text>
        </>
      )}
    </group>
  );
}

/** Metre-scale shipping apron. Local +Z points into the building; its door line is Z=0. */
export function ShippingObject({ object, width, depth, ghost = false }: Props) {
  const variant = object.shippingVariant ?? 'dock-bay';
  const height = object.dimensions?.[1] ?? 5;
  const layout = useMemo(() => shippingSpatialLayout(object), [object]);
  const bays = width >= 10 ? Math.floor((width - 6) / 4) + 1 : 1;
  const spacing = bays > 1 ? 4 : 0;
  const doorStates: string[] = object.shippingDoorStates ?? [];
  const seeded = useMemo(() => {
    let state = object.shippingSeed ?? 47;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }, [object.shippingSeed]);
  const containers = useMemo(() => {
    const random = seeded;
    const count =
      variant === 'container-yard' ? Math.round(4 + (object.shippingDensity ?? 0.5) * 4) : 0;
    return Array.from({ length: count }, (_, i) => ({
      x: -width / 2 + 1.3 + (i % 4) * 2.7,
      z: 3.5,
      y: i >= 4 ? 2.59 : 0,
      color: palette[Math.floor(random() * palette.length)]!,
      label: `ANXU ${String(248100 + Math.floor(random() * 7000))}`,
    }));
  }, [object.shippingDensity, object.shippingSeed, seeded, variant, width]);
  const doorX = (index: number) =>
    layout.bayCenters[index]?.[0] ?? (bays === 1 ? 0 : (index - (bays - 1) / 2) * spacing);
  const staging = variant === 'staging-only';
  const trailerDocked = object.shippingTrailerDocked ?? variant === 'dock-bay';
  return (
    <group name="shipping-object" position={[0, 0, -depth / 2]}>
      <Box
        position={[0, -0.02, depth / 2]}
        size={[width, 0.04, depth]}
        color={staging ? '#6F7475' : concrete}
        ghost={ghost}
      />
      {staging ? (
        <>
          {[-2.2, 0, 2.2].map((z) => (
            <Box
              key={z}
              position={[0, 0.015, z + depth / 2]}
              size={[width * 0.82, 0.012, 0.035]}
              color="#E6D7A5"
              ghost={ghost}
            />
          ))}
          <Text
            position={[0, 0.04, depth / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.42}
            color="#F4E8C1"
            anchorX="center"
          >
            STAGING • KEEP CLEAR
          </Text>
          {Array.from({ length: 3 }, (_, i) => (
            <Pallet key={i} x={-1.7 + i * 1.7} z={3.8} ghost={ghost} />
          ))}
        </>
      ) : variant === 'container-yard' ? (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <Box
              key={`lane${i}`}
              position={[0, 0.01, i * 1.8 + 1]}
              size={[width - 0.5, 0.015, 0.035]}
              color={i % 2 ? '#A69B6C' : '#C9BB79'}
              ghost={ghost}
            />
          ))}
          {containers.map((container, i) => (
            <Container key={i} {...container} ghost={ghost} />
          ))}
          <Forklift x={0} z={7.5} ghost={ghost} />
          <Text
            position={[0, 0.04, depth / 2 - 0.4]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.35}
            color="#F2E8C4"
            anchorX="center"
          >
            CONTAINER STORAGE • STACK MAX 2
          </Text>
        </>
      ) : (
        <>
          {/* Dock apron extends outside the polygon while the loading platform bridges 1.3 m inside. */}
          {Array.from({ length: Math.floor(width / 0.85) + 1 }, (_, i) => {
            const x = -width / 2 + i * 0.85;
            return (
              <Box
                key={`stripe-${i}`}
                position={[x, 0.012, -2.45]}
                size={[0.4, 0.025, 4.1]}
                color={i % 2 ? '#111719' : yellow}
                ghost={ghost}
              />
            );
          })}
          <Box
            position={[0, 0.6, 1.5]}
            size={[width - 0.3, 1.2, 3]}
            color="#555E62"
            ghost={ghost}
          />
          {Array.from({ length: Math.floor(width / 0.18) }, (_, i) => (
            <Box
              key={`deck-${i}`}
              position={[-width / 2 + 0.1 + i * 0.18, 1.22, 1.5]}
              size={[0.025, 0.035, 2.85]}
              color="#9AA1A0"
              ghost={ghost}
              metalness={0.45}
            />
          ))}
          <group
            position={[0, 1.2, 0.01]}
            rotation={[((object.shippingLevelerAngle ?? 0) * Math.PI) / 180, 0, 0]}
          >
            <Box
              position={[0, 0, -0.6]}
              size={[2.0, 0.12, 2.2]}
              color="#3D4649"
              ghost={ghost}
              metalness={0.35}
            />
            {Array.from({ length: 10 }, (_, i) => (
              <Box
                key={`leveler-rib${i}`}
                position={[-0.9 + i * 0.2, 0.07, -0.6]}
                size={[0.025, 0.04, 2.08]}
                color="#9BA3A3"
                ghost={ghost}
                metalness={0.5}
              />
            ))}
          </group>
          <mesh position={[0, 1.21, 0.01]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.07, 0.07, 2.1, 12]} />
            <meshStandardMaterial color="#242B2D" metalness={0.65} />
          </mesh>
          <group position={[3.8, 0, 0.5]}>
            {Array.from({ length: 4 }, (_, i) => (
              <Box
                key={`step${i}`}
                position={[0, 0.15 + i * 0.3, -0.35 + i * 0.5]}
                size={[0.9, 0.3, 0.5]}
                color={i % 2 ? '#717B7C' : '#858D8D'}
                ghost={ghost}
              />
            ))}
            {[-0.39, 0.39].map((x) => (
              <Box
                key={`step-rail${x}`}
                position={[x, 0.84, 0.15]}
                size={[0.06, 0.72, 0.06]}
                color="#465357"
                ghost={ghost}
              />
            ))}
            <Box position={[0, 1.2, 0.15]} size={[0.9, 0.06, 0.06]} color="#465357" ghost={ghost} />
          </group>
          {Array.from({ length: bays }, (_, i) => (
            <group key={`bay${i}`}>
              <DockDoor
                x={doorX(i)}
                y={Math.min(3.2, height - 1.8)}
                state={doorStates[i] ?? 'closed'}
                number={i + 1}
                ghost={ghost}
                docked={trailerDocked}
              />
              <Box
                position={[doorX(i) - 1.4, 1, -0.17]}
                size={[0.25, 0.5, 0.15]}
                color="#151A1B"
                ghost={ghost}
              />
              <Box
                position={[doorX(i) + 1.4, 1, -0.17]}
                size={[0.25, 0.5, 0.15]}
                color="#151A1B"
                ghost={ghost}
              />
              <Box
                position={[doorX(i) - 1.8, 1.3, -0.2]}
                size={[0.16, 0.6, 0.16]}
                color={yellow}
                ghost={ghost}
              />
              <Box
                position={[doorX(i) + 1.8, 1.3, -0.2]}
                size={[0.16, 0.6, 0.16]}
                color={yellow}
                ghost={ghost}
              />
              <Box
                position={[doorX(i), 0.05, 4.4]}
                size={[2.2, 0.1, 2.2]}
                color="#343C3D"
                ghost={ghost}
              />
              <Box
                position={[doorX(i), 0.11, 5.1]}
                size={[2.0, 0.025, 0.035]}
                color="#F2E9CC"
                ghost={ghost}
              />
              <Text
                position={[doorX(i), 0.12, 4.4]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.24}
                color="#F2E9CC"
                anchorX="center"
              >
                KEEP CLEAR
              </Text>
            </group>
          ))}
          <Box
            position={[0, height, 0.25]}
            size={[width + 0.35, 0.22, 1.8]}
            color="#39474C"
            ghost={ghost}
          />
          <Box
            position={[0, height + 0.13, 0.25]}
            size={[width + 0.35, 0.04, 1.8]}
            color="#D5C49A"
            ghost={ghost}
          />
          <Text
            position={[0, height + 0.25, 0.25]}
            fontSize={0.42}
            color="#17313A"
            anchorX="center"
            anchorY="middle"
          >
            SHIPPING &amp; RECEIVING
          </Text>
          <Text position={[0, height + 0.25, 0.7]} fontSize={0.19} color="#17313A" anchorX="center">
            07:00–18:00 • PPE REQUIRED
          </Text>
          {/* Canopy projects toward the trailer approach, supported by visible steel outriggers. */}
          <Box
            position={[0, 4.95, -1.8]}
            size={[width + 1.1, 0.18, 1.8]}
            color="#26383E"
            ghost={ghost}
          />
          {[-width / 2 + 0.35, width / 2 - 0.35].map((x) => (
            <Box
              key={x}
              position={[x, 4.3, -1.25]}
              size={[0.12, 1.3, 0.12]}
              color="#68777A"
              ghost={ghost}
            />
          ))}
          {Array.from({ length: bays }, (_, i) => (
            <group key={`lamp${i}`} position={[doorX(i) + 2.2, 3.8, -0.7]}>
              <Box position={[0, 0.7, 0]} size={[0.08, 0.08, 1.3]} color="#303B3E" ghost={ghost} />
              <Box
                position={[0, 0.4, -0.62]}
                size={[0.08, 0.55, 0.08]}
                color="#303B3E"
                ghost={ghost}
              />
              <mesh position={[0, 0.15, -0.62]}>
                <sphereGeometry args={[0.13, 12, 8]} />
                <meshStandardMaterial
                  color="#FFE7A1"
                  emissive="#F7BD50"
                  emissiveIntensity={ghost ? 0 : 1.5}
                />
              </mesh>
            </group>
          ))}
          <Pallet x={-width / 2 + 0.8} z={3.65} ghost={ghost} />
          <Pallet x={width / 2 - 0.8} z={3.65} color="#B48A5C" ghost={ghost} />
          {(object.shippingDensity ?? 0.5) > 0.3 && (
            <group position={[width / 2 - 0.8, 0, 3.65]}>
              <Box position={[0, 0.55, 0]} size={[0.82, 1.0, 0.64]} color="#C69B68" ghost={ghost} />
              <mesh position={[0, 0.58, 0]}>
                <boxGeometry args={[0.88, 1.08, 0.7]} />
                <meshStandardMaterial
                  color="#C8D9D4"
                  transparent
                  opacity={ghost ? 0.08 : 0.24}
                  roughness={0.28}
                />
              </mesh>
              <Box
                position={[0, 0.34, 0]}
                size={[0.9, 0.025, 0.72]}
                color="#D9E5E0"
                ghost={ghost}
              />
            </group>
          )}
          <NearProps width={width} density={object.shippingDensity ?? 0.5} ghost={ghost} />
          <Forklift x={0} z={5.5} ghost={ghost} />
          <SafetyPictogram kind="ppe" position={[width / 2 - 0.48, 2.45, 2.5]} />
          <SafetyPictogram kind="forklift" position={[-width / 2 + 0.48, 2.45, 2.5]} />
          {/* A restrained trailer silhouette makes the approach and actual loading gap legible. */}
          {trailerDocked && (
            <group position={[0, 0, -8.1]}>
              {/* Hollow trailer with a roof and floor; the dock end is open for the bridge. */}
              <Box
                position={[0, 1.27, 0]}
                size={[2.42, 0.14, 13.6]}
                color="#AEB6B5"
                ghost={ghost}
              />
              <Box position={[0, 3.98, 0]} size={[2.5, 0.16, 13.6]} color="#D5D9D5" ghost={ghost} />
              {[-1, 1].map((side) => (
                <group key={`trailer-side${side}`}>
                  <Box
                    position={[side * 1.22, 2.62, 0]}
                    size={[0.08, 2.55, 13.6]}
                    color="#E1E2DC"
                    ghost={ghost}
                  />
                  {Array.from({ length: 31 }, (_, i) => (
                    <Box
                      key={`side-rib${i}`}
                      position={[side * 1.267, 2.62, -6.5 + i * 0.43]}
                      size={[0.03, 2.42, 0.055]}
                      color={i % 2 ? '#D6DAD6' : '#BFC6C3'}
                      ghost={ghost}
                      metalness={0.12}
                    />
                  ))}
                </group>
              ))}
              <Box
                position={[0, 2.62, -6.77]}
                size={[2.36, 2.55, 0.08]}
                color="#D3D8D4"
                ghost={ghost}
              />
              {[-1.18, 1.18].flatMap((x) =>
                [-5.0, -4.45, -3.9].map((z) => (
                  <mesh key={`${x}:${z}`} position={[x, 0.7, z]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.5, 0.5, 0.22, 16]} />
                    <meshStandardMaterial color="#15191A" roughness={0.94} />
                  </mesh>
                )),
              )}
              {/* Landing legs, spreader footplates and crank crossbar. */}
              {[-0.82, 0.82].map((x) => (
                <group key={`landing${x}`}>
                  <Box
                    position={[x, 0.6, 2.75]}
                    size={[0.12, 1.2, 0.12]}
                    color="#586368"
                    ghost={ghost}
                  />
                  <Box
                    position={[x, 0.04, 2.75]}
                    size={[0.42, 0.08, 0.38]}
                    color="#424B4E"
                    ghost={ghost}
                  />
                </group>
              ))}
              <Box
                position={[0, 1.0, 2.75]}
                size={[1.7, 0.08, 0.08]}
                color="#717D80"
                ghost={ghost}
              />
              {/* Rear double doors swing 270° onto the trailer sides; bars and cam handles remain visible. */}
              {[-1, 1].map((side) => (
                <group
                  key={`rear-door${side}`}
                  position={[side * 1.22, 2.62, 6.78]}
                  rotation={[0, side * Math.PI * 1.5, 0]}
                >
                  <Box
                    position={[-side * 0.6, 0, 0]}
                    size={[1.2, 2.5, 0.06]}
                    color="#CAD0CD"
                    ghost={ghost}
                  />
                  <Box
                    position={[-side * 0.98, 0, -0.045]}
                    size={[0.055, 2.2, 0.045]}
                    color="#657174"
                    ghost={ghost}
                  />
                  <Box
                    position={[-side * 0.55, 0, -0.05]}
                    size={[0.035, 2.15, 0.035]}
                    color="#778184"
                    ghost={ghost}
                  />
                  <Box
                    position={[-side * 0.48, 0, -0.08]}
                    size={[0.1, 0.24, 0.05]}
                    color="#3A4447"
                    ghost={ghost}
                  />
                </group>
              ))}
              {/* Black mudflaps, red side markers and wheel chocks near the dock approach. */}
              {[-1, 1].map((side) => (
                <group key={`trailer-detail${side}`}>
                  <Box
                    position={[side * 1.18, 0.38, -5.35]}
                    size={[0.12, 0.7, 0.22]}
                    color="#242A2C"
                    ghost={ghost}
                  />
                  <Box
                    position={[side * 1.245, 1.3, 0]}
                    size={[0.04, 0.12, 0.55]}
                    color="#D24B37"
                    ghost={ghost}
                  />
                  <Box
                    position={[side * 1.25, 0.13, 4.6]}
                    size={[0.24, 0.22, 0.44]}
                    color={yellow}
                    ghost={ghost}
                  />
                  {Array.from({ length: 5 }, (_, i) => (
                    <mesh
                      key={`chock-chain${i}`}
                      position={[side * 1.18, 0.18, 4.24 + i * 0.09]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <torusGeometry args={[0.045, 0.012, 6, 8]} />
                      <meshStandardMaterial color="#626B6C" metalness={0.65} roughness={0.58} />
                    </mesh>
                  ))}
                </group>
              ))}
            </group>
          )}
          <Text
            position={[0, 2.8, -3.8]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.36}
            color="#F8E39B"
            anchorX="center"
          >{`BAY 01${bays > 1 ? '   •   BAY 02' : ''}`}</Text>
        </>
      )}
    </group>
  );
}
