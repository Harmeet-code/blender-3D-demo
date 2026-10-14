import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LinearSRGBColorSpace,
  Matrix3,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  StaticDrawUsage,
  Vector3,
  type Material,
} from 'three';
import type {
  MallCategory,
  MallGltfMaterial,
  MallGeometryRecipe,
  MallSceneData,
  MallSceneObject,
} from './mall-types.ts';
import { decodeFloat32Buffer, decodeIndexBuffer } from './mall-buffers.ts';

type GroupRange = { start: number; count: number; materialIndex: number };

interface MergeBucket {
  category: MallCategory;
  cellKey: string;
  materialId: string;
  castsShadow: boolean;
  vertexCount: number;
  indexCount: number;
  hasUvs: boolean;
  positions?: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices?: Uint16Array | Uint32Array;
  cursor: number;
  indexCursor: number;
}

interface ObjectPlan {
  source: MallSceneObject;
  geometry: BufferGeometry;
  matrix: Matrix4;
  ranges: GroupRange[];
  instanceKey: string;
}

const vectorA = new Vector3();
const normalA = new Vector3();
const normalMatrix = new Matrix3();
function getExtension<K extends keyof NonNullable<MallGltfMaterial['extensions']>>(
  source: MallGltfMaterial,
  name: K,
): NonNullable<MallGltfMaterial['extensions']>[K] {
  return source.extensions?.[name] as NonNullable<MallGltfMaterial['extensions']>[K];
}

function buildMaterial(source: MallGltfMaterial): Material {
  const pbr = source.pbrMetallicRoughness;
  const transmission = getExtension(source, 'KHR_materials_transmission')?.transmissionFactor ?? 0;
  const hasPhysicalExtension =
    transmission > 0 ||
    getExtension(source, 'KHR_materials_clearcoat') !== undefined ||
    getExtension(source, 'KHR_materials_ior') !== undefined ||
    getExtension(source, 'KHR_materials_sheen') !== undefined;
  const MaterialType = hasPhysicalExtension ? MeshPhysicalMaterial : MeshStandardMaterial;
  const material = new MaterialType({
    name: source.name ?? '',
    metalness: pbr?.metallicFactor ?? 1,
    roughness: pbr?.roughnessFactor ?? 1,
    opacity: pbr?.baseColorFactor?.[3] ?? 1,
    transparent: source.alphaMode === 'BLEND',
    alphaTest: source.alphaMode === 'MASK' ? (source.alphaCutoff ?? 0.5) : 0,
    ...(source.doubleSided ? { side: DoubleSide } : {}),
  });
  const baseColor = pbr?.baseColorFactor;
  if (baseColor) {
    material.color.setRGB(baseColor[0], baseColor[1], baseColor[2], LinearSRGBColorSpace);
  }
  if (source.emissiveFactor) {
    material.emissive.setRGB(
      source.emissiveFactor[0],
      source.emissiveFactor[1],
      source.emissiveFactor[2],
      LinearSRGBColorSpace,
    );
  }
  const emissiveStrength = getExtension(source, 'KHR_materials_emissive_strength');
  if (emissiveStrength) {
    material.emissiveIntensity = emissiveStrength.emissiveStrength ?? 1;
  }
  if (hasPhysicalExtension && material instanceof MeshPhysicalMaterial) {
    const clearcoat = getExtension(source, 'KHR_materials_clearcoat');
    const sheen = getExtension(source, 'KHR_materials_sheen');
    material.transmission = transmission;
    material.ior = getExtension(source, 'KHR_materials_ior')?.ior ?? 1.5;
    material.clearcoat = clearcoat?.clearcoatFactor ?? 0;
    material.clearcoatRoughness = clearcoat?.clearcoatRoughnessFactor ?? 0;
    if (sheen) {
      material.sheen = sheen.sheenColorFactor ? 1 : 0;
      if (sheen.sheenColorFactor) {
        material.sheenColor.setRGB(...sheen.sheenColorFactor, LinearSRGBColorSpace);
      }
      material.sheenRoughness = sheen.sheenRoughnessFactor ?? 1;
    }
  }
  // GLTFLoader keeps alpha blending's depth writes enabled by default.
  material.needsUpdate = true;
  return material;
}

function createGeometry(recipe: MallGeometryRecipe): BufferGeometry {
  if (recipe.kind === 'box') {
    if (!recipe.size) {
      throw new Error(`Box recipe "${recipe.id}" is missing its dimensions.`);
    }
    const geometry = new BoxGeometry(...recipe.size);
    if (recipe.groups) {
      geometry.clearGroups();
      for (const group of recipe.groups) {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      }
    }
    if (geometry.groups.every((group) => (group.materialIndex ?? 0) === 0)) {
      geometry.clearGroups();
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  if (!recipe.positions) {
    throw new Error(`Buffer recipe "${recipe.id}" has an invalid position array.`);
  }
  const positions = decodeFloat32Buffer(recipe.positions);
  if (positions.length % 3 !== 0) {
    throw new Error(`Buffer recipe "${recipe.id}" has an invalid position array.`);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  if (recipe.normals) {
    geometry.setAttribute('normal', new BufferAttribute(decodeFloat32Buffer(recipe.normals), 3));
  } else {
    geometry.computeVertexNormals();
  }
  if (recipe.uvs) {
    geometry.setAttribute('uv', new BufferAttribute(decodeFloat32Buffer(recipe.uvs), 2));
  }
  if (recipe.indices) {
    const indices = decodeIndexBuffer(recipe.indices);
    geometry.setIndex(new BufferAttribute(indices, 1));
  }
  for (const group of recipe.groups ?? []) {
    geometry.addGroup(group.start, group.count, group.materialIndex ?? 0);
  }
  if (
    geometry.groups.length &&
    geometry.groups.every((group) => (group.materialIndex ?? 0) === 0)
  ) {
    geometry.clearGroups();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function rangesFor(geometry: BufferGeometry): GroupRange[] {
  if (geometry.groups.length) {
    return geometry.groups.map((group) => ({
      start: group.start,
      count: group.count,
      materialIndex: group.materialIndex ?? 0,
    }));
  }
  const indexCount = geometry.index?.count ?? geometry.getAttribute('position').count;
  return [{ start: 0, count: indexCount, materialIndex: 0 }];
}

function uniqueVertexCount(geometry: BufferGeometry, range: GroupRange): number {
  if (!geometry.index) {
    return range.count;
  }
  const unique = new Set<number>();
  for (let offset = range.start, end = range.start + range.count; offset < end; offset += 1) {
    unique.add(geometry.index.getX(offset));
  }
  return unique.size;
}

function geometryBufferBytes(geometry: BufferGeometry): number {
  let bytes = 0;
  for (const attribute of Object.values(geometry.attributes)) {
    if (attribute instanceof BufferAttribute) {
      bytes += attribute.array.byteLength;
    }
  }
  if (geometry.index) {
    bytes += geometry.index.array.byteLength;
  }
  return bytes;
}

function shouldInstance(instances: ObjectPlan[]): boolean {
  if (instances.length < 8) {
    return false;
  }
  return geometryBufferBytes(instances[0]!.geometry) * instances.length >= 128 * 1024;
}

function getElementIndex(geometry: BufferGeometry, offset: number): number {
  return geometry.index ? geometry.index.getX(offset) : offset;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function buildMeshRoot(
  data: MallSceneData,
): Promise<{ root: Group; geometries: BufferGeometry[]; materials: Material[] }> {
  const root = new Group();
  const categoryRoots: Record<MallCategory, Group> = {
    exterior: new Group(),
    interior: new Group(),
    garage: new Group(),
  };
  for (const category of Object.keys(categoryRoots) as MallCategory[]) {
    categoryRoots[category].name = `Mall_${category}`;
    root.add(categoryRoots[category]);
  }

  const materialIds = new Set(Object.keys(data.materials));
  const recipeIds = new Set(data.geometries.map((recipe) => recipe.id));
  if (recipeIds.size !== data.geometries.length) {
    throw new Error('Procedural mall geometry recipe identifiers are not unique.');
  }
  for (const source of data.objects) {
    if (!recipeIds.has(source.geometryId)) {
      throw new Error(`Mall object "${source.id}" refers to missing geometry.`);
    }
    if (source.matrix.length !== 16) {
      throw new Error(`Mall object "${source.id}" has an invalid matrix.`);
    }
    for (const materialId of source.materials) {
      if (!materialIds.has(materialId)) {
        throw new Error(`Mall object "${source.id}" refers to missing material "${materialId}".`);
      }
    }
  }
  const geometriesById = new Map<string, BufferGeometry>();
  try {
    for (const [recipeIndex, recipe] of data.geometries.entries()) {
      geometriesById.set(recipe.id, createGeometry(recipe));
      if ((recipeIndex + 1) % 64 === 0) {
        await yieldToBrowser();
      }
    }
  } catch (error) {
    for (const geometry of geometriesById.values()) {
      geometry.dispose();
    }
    throw error;
  }

  const plans: ObjectPlan[] = [];
  let sourceTriangleCount = 0;
  for (const [objectIndex, source] of data.objects.entries()) {
    const geometry = geometriesById.get(source.geometryId);
    if (!geometry) {
      throw new Error(`Mall object "${source.id}" refers to missing geometry.`);
    }
    if (source.matrix.length !== 16) {
      throw new Error(`Mall object "${source.id}" has an invalid matrix.`);
    }
    for (const materialId of source.materials) {
      if (!materialIds.has(materialId)) {
        throw new Error(`Mall object "${source.id}" refers to missing material "${materialId}".`);
      }
    }
    plans.push({
      source,
      geometry,
      matrix: new Matrix4().fromArray(source.matrix),
      ranges: rangesFor(geometry),
      instanceKey:
        source.materials.length === 1
          ? `${source.category}|${source.cell.join(',')}|${source.geometryId}|${source.materials[0]}`
          : `unique|${source.id}`,
    });
    sourceTriangleCount += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
    if ((objectIndex + 1) % 512 === 0) {
      await yieldToBrowser();
    }
  }

  const materialsById = new Map<string, Material>();
  try {
    for (const [id, definition] of Object.entries(data.materials)) {
      materialsById.set(id, buildMaterial(definition));
    }
  } catch (error) {
    for (const geometry of geometriesById.values()) {
      geometry.dispose();
    }
    for (const material of materialsById.values()) {
      material.dispose();
    }
    throw error;
  }

  const instanceGroups = new Map<string, ObjectPlan[]>();
  for (const [index, plan] of plans.entries()) {
    const group = instanceGroups.get(plan.instanceKey);
    if (group) {
      group.push(plan);
    } else {
      instanceGroups.set(plan.instanceKey, [plan]);
    }
    if ((index + 1) % 1024 === 0) {
      await yieldToBrowser();
    }
  }
  const bucketContributors = new Map<string, Set<string>>();
  for (const plan of plans) {
    for (const range of plan.ranges) {
      const materialId = plan.source.materials[range.materialIndex] ?? plan.source.materials[0];
      if (!materialId) {
        continue;
      }
      const bucketKey = `${plan.source.category}|${plan.source.cell.join(',')}|${materialId}`;
      const contributors = bucketContributors.get(bucketKey) ?? new Set<string>();
      contributors.add(plan.instanceKey);
      bucketContributors.set(bucketKey, contributors);
    }
  }
  const instancedKeys = new Set<string>();
  for (const [key, instances] of instanceGroups) {
    if (!shouldInstance(instances)) {
      continue;
    }
    const first = instances[0]!;
    const exclusiveBuckets = first.ranges.every((range) => {
      const materialId = first.source.materials[range.materialIndex] ?? first.source.materials[0];
      if (!materialId) {
        return false;
      }
      const bucketKey = `${first.source.category}|${first.source.cell.join(',')}|${materialId}`;
      const contributors = bucketContributors.get(bucketKey);
      return contributors?.size === 1 && contributors.has(key);
    });
    if (exclusiveBuckets) {
      instancedKeys.add(key);
    }
  }

  const mergeBuckets = new Map<string, MergeBucket>();
  const uniqueVertexCounts = new Map<string, number>();
  for (const [index, plan] of plans.entries()) {
    if (instancedKeys.has(plan.instanceKey)) {
      continue;
    }
    for (const range of plan.ranges) {
      const materialId = plan.source.materials[range.materialIndex] ?? plan.source.materials[0];
      if (!materialId) {
        continue;
      }
      const cellKey = plan.source.cell.join(',');
      const key = `${plan.source.category}|${cellKey}|${materialId}`;
      const bucket = mergeBuckets.get(key) ?? {
        category: plan.source.category,
        cellKey,
        materialId,
        castsShadow: false,
        vertexCount: 0,
        indexCount: 0,
        hasUvs: false,
        cursor: 0,
        indexCursor: 0,
      };
      const rangeKey = `${plan.source.geometryId}|${range.start}|${range.count}`;
      let uniqueCount = uniqueVertexCounts.get(rangeKey);
      if (uniqueCount === undefined) {
        uniqueCount = uniqueVertexCount(plan.geometry, range);
        uniqueVertexCounts.set(rangeKey, uniqueCount);
      }
      bucket.vertexCount += uniqueCount;
      bucket.indexCount += range.count;
      bucket.hasUvs ||= plan.geometry.getAttribute('uv') !== undefined;
      // The 14 mm ramp finish receives shadows; the underlying concrete casts them.
      // Its own caster pass causes curved self-shadow acne absent from the reference.
      if (plan.source.id !== 'Ramp satin traction coating') {
        bucket.castsShadow = true;
      }
      mergeBuckets.set(key, bucket);
    }
    if ((index + 1) % 512 === 0) {
      await yieldToBrowser();
    }
  }

  for (const [key, bucket] of mergeBuckets) {
    bucket.positions = new Float32Array(bucket.vertexCount * 3);
    bucket.normals = new Float32Array(bucket.vertexCount * 3);
    if (bucket.hasUvs) {
      bucket.uvs = new Float32Array(bucket.vertexCount * 2);
    }
    bucket.indices =
      bucket.vertexCount <= 65535
        ? new Uint16Array(bucket.indexCount)
        : new Uint32Array(bucket.indexCount);
    mergeBuckets.set(key, bucket);
  }

  let flattenedVertices = 0;
  for (const [planIndex, plan] of plans.entries()) {
    if (instancedKeys.has(plan.instanceKey)) {
      continue;
    }
    const positions = plan.geometry.getAttribute('position');
    const normals = plan.geometry.getAttribute('normal');
    const uvs = plan.geometry.getAttribute('uv');
    normalMatrix.getNormalMatrix(plan.matrix);
    for (const range of plan.ranges) {
      const materialId = plan.source.materials[range.materialIndex] ?? plan.source.materials[0];
      if (!materialId) {
        continue;
      }
      const key = `${plan.source.category}|${plan.source.cell.join(',')}|${materialId}`;
      const bucket = mergeBuckets.get(key)!;
      const vertexRemap = new Map<number, number>();
      const end = range.start + range.count;
      const outputIndices = bucket.indices!;
      const reverseWinding = plan.matrix.determinant() < 0;
      const triangle = [0, 0, 0];
      for (let offset = range.start; offset < end; offset += 3) {
        triangle[0] = getElementIndex(plan.geometry, offset);
        triangle[1] = getElementIndex(plan.geometry, offset + 1);
        triangle[2] = getElementIndex(plan.geometry, offset + 2);
        if (reverseWinding) {
          [triangle[1], triangle[2]] = [triangle[2]!, triangle[1]!];
        }
        for (const sourceIndex of triangle) {
          let targetIndex = vertexRemap.get(sourceIndex);
          if (targetIndex === undefined) {
            targetIndex = bucket.cursor++;
            vertexRemap.set(sourceIndex, targetIndex);
            vectorA.fromBufferAttribute(positions, sourceIndex).applyMatrix4(plan.matrix);
            const vertexOffset = targetIndex * 3;
            bucket.positions![vertexOffset] = vectorA.x;
            bucket.positions![vertexOffset + 1] = vectorA.y;
            bucket.positions![vertexOffset + 2] = vectorA.z;
            if (normals) {
              normalA
                .fromBufferAttribute(normals, sourceIndex)
                .applyMatrix3(normalMatrix)
                .normalize();
            } else {
              normalA.set(0, 1, 0);
            }
            bucket.normals![vertexOffset] = normalA.x;
            bucket.normals![vertexOffset + 1] = normalA.y;
            bucket.normals![vertexOffset + 2] = normalA.z;
            if (bucket.uvs) {
              const uvOffset = targetIndex * 2;
              bucket.uvs[uvOffset] = uvs?.getX(sourceIndex) ?? 0;
              bucket.uvs[uvOffset + 1] = uvs?.getY(sourceIndex) ?? 0;
            }
          }
          outputIndices[bucket.indexCursor++] = targetIndex;
        }
        flattenedVertices += 3;
        if (flattenedVertices % 24576 === 0) {
          await yieldToBrowser();
        }
      }
    }
    if ((planIndex + 1) % 256 === 0) {
      await yieldToBrowser();
    }
  }

  const ownedGeometries: BufferGeometry[] = [];
  const instancedGeometries = new Set<BufferGeometry>();
  let batchIndex = 0;
  for (const [key, instances] of instanceGroups) {
    if (!instancedKeys.has(key)) {
      continue;
    }
    const first = instances[0]!;
    const material = materialsById.get(first.source.materials[0]!);
    if (!material) {
      throw new Error(`Mall object "${first.source.id}" has no render material.`);
    }
    const mesh = new InstancedMesh(first.geometry, material, instances.length);
    mesh.name = `MallInstances_${key}`;
    mesh.castShadow = !castsNoShadow(material);
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    instances.forEach((plan, index) => mesh.setMatrixAt(index, plan.matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    categoryRoots[first.source.category].add(mesh);
    instancedGeometries.add(first.geometry);
    if (++batchIndex % 128 === 0) {
      await yieldToBrowser();
    }
  }

  for (const bucket of mergeBuckets.values()) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(bucket.positions!, 3));
    geometry.setAttribute('normal', new BufferAttribute(bucket.normals!, 3));
    if (bucket.uvs) {
      geometry.setAttribute('uv', new BufferAttribute(bucket.uvs, 2));
    }
    geometry.setIndex(new BufferAttribute(bucket.indices!, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const material = materialsById.get(bucket.materialId);
    if (!material) {
      continue;
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = `MallBatch_${bucket.category}_${bucket.cellKey}_${bucket.materialId}`;
    mesh.castShadow = bucket.castsShadow && !castsNoShadow(material);
    mesh.receiveShadow = true;
    categoryRoots[bucket.category].add(mesh);
    ownedGeometries.push(geometry);
    if (++batchIndex % 128 === 0) {
      await yieldToBrowser();
    }
  }

  for (const geometry of geometriesById.values()) {
    if (instancedGeometries.has(geometry)) {
      ownedGeometries.push(geometry);
    } else {
      geometry.dispose();
    }
  }

  let ownedGeometryBytes = 0;
  for (const geometry of ownedGeometries) {
    for (const attribute of Object.values(geometry.attributes)) {
      if (attribute instanceof BufferAttribute) {
        ownedGeometryBytes += attribute.array.byteLength;
      }
    }
    if (geometry.index) {
      ownedGeometryBytes += geometry.index.array.byteLength;
    }
  }
  const instanceDrawCalls = instancedKeys.size;
  root.userData.sceneStats = {
    sourceObjects: data.sourceGeometryObjects,
    uniqueGeometryRecipes: data.geometries.length,
    materials: Object.keys(data.materials).length,
    sourceTriangles: sourceTriangleCount,
    instancedObjects: [...instancedKeys].reduce(
      (sum, key) => sum + instanceGroups.get(key)!.length,
      0,
    ),
    instanceDrawCalls,
    mergedDrawCalls: mergeBuckets.size,
    totalDrawCalls: instanceDrawCalls + mergeBuckets.size,
    ownedGeometryBytes,
  };

  return { root, geometries: ownedGeometries, materials: [...materialsById.values()] };
}

function castsNoShadow(material: Material): boolean {
  return (
    material.transparent || (material instanceof MeshPhysicalMaterial && material.transmission > 0)
  );
}

export interface MallSceneResources {
  root: Group;
  dispose: () => void;
}

/** Build a cell-culled scene, using instancing for repeated recipes and static merges for the rest. */
export async function createMallScene(data: MallSceneData): Promise<MallSceneResources> {
  if (data.schemaVersion !== 1) {
    throw new Error(`Unsupported procedural mall schema version: ${data.schemaVersion}.`);
  }
  const built = await buildMeshRoot(data);
  let disposed = false;
  return {
    root: built.root,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      built.root.traverse((object) => {
        if (object instanceof InstancedMesh) {
          object.dispose();
        }
      });
      for (const geometry of built.geometries) {
        geometry.dispose();
      }
      for (const material of built.materials) {
        material.dispose();
      }
    },
  };
}
