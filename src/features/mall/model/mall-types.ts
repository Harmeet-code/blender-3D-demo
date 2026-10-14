export type MallView = 'exterior' | 'arrival' | 'atrium' | 'parking' | 'suv' | 'pickup';
export type MallCategory = 'exterior' | 'interior' | 'garage';
export type MallTuple3 = [number, number, number];

export interface MallViewDefinition {
  position: MallTuple3;
  target: MallTuple3;
  fov: number;
}

export interface MallLightDefinition {
  name: string;
  type: string;
  position: MallTuple3;
  target: MallTuple3;
  color: MallTuple3;
  power: number;
  size: number;
}

/** glTF 2.0 material properties used by the original mall's web export. */
export interface MallGltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorFactor?: [number, number, number, number];
    metallicFactor?: number;
    roughnessFactor?: number;
  };
  emissiveFactor?: MallTuple3;
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  alphaCutoff?: number;
  doubleSided?: boolean;
  extensions?: {
    KHR_materials_transmission?: { transmissionFactor?: number };
    KHR_materials_ior?: { ior?: number };
    KHR_materials_clearcoat?: {
      clearcoatFactor?: number;
      clearcoatRoughnessFactor?: number;
    };
    KHR_materials_sheen?: {
      sheenColorFactor?: MallTuple3;
      sheenRoughnessFactor?: number;
    };
    KHR_materials_emissive_strength?: { emissiveStrength?: number };
    [name: string]: unknown;
  };
}

export interface MallEncodedBuffer {
  encoding: 'f32-base64' | 'u16-base64' | 'u32-base64';
  data: string;
  length: number;
}
export type MallBufferField = number[] | MallEncodedBuffer;

export interface MallGeometryRecipe {
  id: string;
  kind: 'box' | 'buffer';
  size?: MallTuple3;
  positions?: MallBufferField;
  normals?: MallBufferField;
  uvs?: MallBufferField;
  indices?: MallBufferField;
  groups?: Array<{ start: number; count: number; materialIndex: number }>;
}

export interface MallSceneObject {
  id: string;
  category: MallCategory;
  cell: [number, number, number];
  geometryId: string;
  materials: string[];
  /** Column-major, right-handed web world transform. */
  matrix: number[];
  bounds: { min: MallTuple3; max: MallTuple3 };
  sourceType: string;
  semantic?: string;
}

export interface MallSceneData {
  schemaVersion: 1;
  sourceSha256: string;
  sourceGeometryObjects: number;
  views: Record<MallView, MallViewDefinition>;
  lights: MallLightDefinition[];
  materials: Record<string, MallGltfMaterial>;
  geometries: MallGeometryRecipe[];
  objects: MallSceneObject[];
}

export interface MallSceneManifest {
  url: string;
  sha256: string;
  sourceSha256: string;
  sourceGeometryObjects?: number;
  compression?: 'gzip';
  geometryCount?: number;
  objectCount?: number;
  [key: string]: unknown;
}
