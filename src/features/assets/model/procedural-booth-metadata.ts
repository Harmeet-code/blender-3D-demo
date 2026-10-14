import sizes from '@/assets/metadata/booth-sizes.v1.json';
import { assetMetadataSchema } from './asset-schema.ts';
/** Metadata only: shared server validation must not allocate GPU recipes. */
export const proceduralBoothMetadata = sizes.map((size) => {
  const width = size.dimensionsFeet[0]! * 0.3048,
    depth = size.dimensionsFeet[1]! * 0.3048;
  return assetMetadataSchema.parse({
    id: size.id,
    version: 1,
    label: size.label,
    anchor: 'floor-contact',
    facing: '+Z',
    dimensions: [width, 2.8, depth],
    bounds: { min: [-width / 2, 0, -depth / 2], max: [width / 2, 2.8, depth / 2] },
    footprint: [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ],
    requiredNodes: ['root', 'socket_entry', 'socket_branding', 'mesh_branding'],
    sockets: {
      socket_entry: { position: [0, 0, depth / 2], rotation: [0, 0, 0] },
      socket_branding: { position: [0, 2.69, depth / 2], rotation: [0, 0, 0] },
    },
    colliders: size.colliders.map((box) => ({ ...box, rotation: [0, 0, 0] })),
    materialRoles: {
      finish_panel: 'surface',
      finish_branding: 'branding',
      booth_satin_bronze: 'surface',
      booth_natural_oak: 'surface',
      booth_warm_led: 'surface',
    },
    branding: {
      node: 'mesh_branding',
      socket: 'socket_branding',
      width: width - 0.14,
      height: 0.2,
      normal: [0, 0, 1],
      defaultNodes: [],
    },
    source: {
      blend: size.source,
      recipe: 'src/features/assets/catalog/sized-booths.ts',
      license: 'LicenseRef-Project-Owned',
      generatorVersion: 'r3f-1',
    },
    budget: { triangles: 100000, materials: 8, bytes: 2097152, textureSize: 1 },
    // Generated geometry metrics are attached to its scene; no native transfer here.
    metrics: { triangles: 0, materials: 0, bytes: 0, textureBytes: 0 },
  });
});
