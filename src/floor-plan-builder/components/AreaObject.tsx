import { useEffect, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Shape, ShapeGeometry } from 'three';
import type { PlanObject } from '../model/types.ts';

export function AreaObject({
  object,
  color,
  ghost = false,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
}) {
  void color;
  const geometry = useMemo(() => {
    const shape = new Shape();
    object.polygon.forEach(([x, z], index) => {
      if (index === 0) {
        shape.moveTo(x, -z);
      } else {
        shape.lineTo(x, -z);
      }
    });
    shape.closePath();
    const value = new ShapeGeometry(shape);
    value.rotateX(-Math.PI / 2);
    value.translate(0, 0.025, 0);
    return value;
  }, [object.polygon]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const outline = object.polygon.map(([x, z]): [number, number, number] => [x, 0.035, z]);
  outline.push(outline[0]!);
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color={object.color}
          roughness={0.95}
          transparent
          opacity={ghost ? 0.2 : 0.72}
          depthWrite={!ghost}
        />
      </mesh>
      <Line points={outline} color={object.color} lineWidth={1.5} transparent opacity={ghost ? 0.25 : 0.9} />
    </>
  );
}
