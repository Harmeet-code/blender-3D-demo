import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace, PlaneGeometry, MeshStandardMaterial } from 'three';
import type { Logo } from '../model/branding.ts';
export function BrandingSurface({
  logo,
  position,
  width,
  height,
}: {
  logo: Logo;
  position: [number, number, number];
  width: number;
  height: number;
}) {
  const texture = useMemo(() => {
    const value = new CanvasTexture(logo.canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, [logo]);
  const factor = Math.min(width / logo.width, height / logo.height);
  const geometry = useMemo(
    () => new PlaneGeometry(logo.width * factor, logo.height * factor),
    [logo, factor],
  );
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 0.75,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [texture],
  );
  useEffect(() => {
    texture.needsUpdate = true;
    return () => {
      texture.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, [texture, geometry, material]);
  return (
    <mesh
      position={position}
      geometry={geometry}
      material={material}
      dispose={null}
      userData={{
        ownedLogo: true,
        name: logo.name,
        dimensions: [logo.width * factor, logo.height * factor],
        sourcePixels: [logo.canvas.width, logo.canvas.height],
        textureId: texture.uuid,
      }}
    />
  );
}
