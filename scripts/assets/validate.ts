import { NodeIO, getBounds } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import { ResultAsync, err, ok, type Result } from 'neverthrow';
import { resolve } from 'node:path';
import {
  assetCatalogSchema,
  type AssetMetadata,
} from '../../src/frontend/entities/asset/model/asset-schema.ts';

interface AssetError {
  code: 'ASSET_IO' | 'ASSET_INVALID';
  message: string;
}
type Quality = 'baseline' | 'low' | 'opaque';
interface AssetReport {
  id: string;
  version: number;
  quality: Quality;
  triangles: number;
  materials: number;
  bytes: number;
  textureBytes: number;
  errors: string[];
}
const root = resolve(import.meta.dir, '../..');
const close = (a: number, b: number) => Math.abs(a - b) <= 0.005;

export async function inspectAsset(
  asset: AssetMetadata,
  quality: Quality = 'baseline',
): Promise<AssetReport> {
  const variant = quality === 'baseline' ? undefined : asset.variants?.[quality];
  if (quality !== 'baseline' && !variant) {
    throw new Error(`Missing ${quality} manifest for ${asset.id}`);
  }
  const suffix = quality === 'baseline' ? '' : `.${quality}`;
  const file = variant?.file ?? `${asset.id}.v${asset.version}.glb`;
  const expectedMetrics = variant?.metrics ?? asset.metrics;
  const expectedRoles = variant?.materialRoles ?? asset.materialRoles;
  const source = variant?.source ?? asset.source;
  const path = resolve(root, `src/frontend/assets/models/${file}`);
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const validation = await validateBytes(bytes, { uri: path });
  const doc = await new NodeIO().readBinary(bytes);
  const errors: string[] = [];
  if (validation.issues.numErrors) {
    errors.push(`glTF validator: ${validation.issues.numErrors} errors`);
  }
  const [scene] = doc.getRoot().listScenes();
  if (!scene) {
    throw new Error('Export has no scene');
  }
  const bounds = getBounds(scene);
  for (const i of [0, 1, 2] as const) {
    if (!close(bounds.min[i], asset.bounds.min[i]) || !close(bounds.max[i], asset.bounds.max[i])) {
      errors.push(`Exported bounds disagree on axis ${i}`);
    }
  }
  const nodes = doc.getRoot().listNodes();
  const assetRoot = nodes.find((node) => node.getName() === 'root');
  if (
    !assetRoot ||
    assetRoot.getTranslation().some((n) => Math.abs(n) > 0.00001) ||
    assetRoot.getScale().some((n) => Math.abs(n - 1) > 0.00001) ||
    assetRoot.getRotation().some((n, i) => Math.abs(n - (i === 3 ? 1 : 0)) > 0.00001)
  ) {
    errors.push('Asset root must have a neutral transform');
  }
  for (const name of asset.requiredNodes) {
    if (!nodes.some((node) => node.getName() === name)) {
      errors.push(`Missing required node: ${name}`);
    }
  }
  for (const [name, socket] of Object.entries(asset.sockets)) {
    const node = nodes.find((n) => n.getName() === name);
    if (
      !node ||
      !node.getWorldTranslation().every((n, i) => close(n, socket.position[i] ?? Infinity))
    ) {
      errors.push(`Socket transform mismatch: ${name}`);
    }
    if (node && node.getWorldRotation().some((n, i) => Math.abs(n - (i === 3 ? 1 : 0)) > 0.00001)) {
      errors.push(`Socket rotation mismatch: ${name}`);
    }
  }
  if (assetRoot && source.generatorVersion === '1.1.0') {
    const extras = assetRoot.getExtras();
    if (
      extras.asset_id !== asset.id ||
      extras.asset_version !== asset.version ||
      extras.generator_version !== source.generatorVersion ||
      extras.quality_variant !== quality
    ) {
      errors.push('Source/export identity or generator version mismatch');
    }
  }
  for (const node of nodes) {
    if (node.getMesh() && node.getName().startsWith('collider_')) {
      errors.push('Collision-only geometry was exported');
    }
  }
  if (asset.branding) {
    const surface = nodes.find((node) => node.getName() === asset.branding?.node);
    if (
      !surface
        ?.getMesh()
        ?.listPrimitives()
        .every((primitive) => primitive.getAttribute('TEXCOORD_0'))
    ) {
      errors.push('Branding surface lacks exportable UVs');
    }
  }
  let triangles = 0;
  const materials = new Set<string>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        errors.push('Release primitives must be triangles');
      }
      triangles +=
        (primitive.getIndices()?.getCount() ??
          primitive.getAttribute('POSITION')?.getCount() ??
          0) / 3;
      const material = primitive.getMaterial();
      if (material) {
        materials.add(material.getName());
      }
    }
  }
  let textureBytes = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize();
    if (!size) {
      errors.push('Texture dimensions unavailable');
    } else {
      textureBytes += Math.ceil((size[0] * size[1] * 4 * 4) / 3);
      if (Math.max(...size) > asset.budget.textureSize) {
        errors.push('Texture exceeds release limit');
      }
    }
  }
  const actual = { triangles, materials: materials.size, bytes: bytes.byteLength, textureBytes };
  for (const metric of ['triangles', 'materials', 'bytes'] as const) {
    if (actual[metric] > asset.budget[metric]) {
      errors.push(`${metric} exceeds release budget`);
    }
    if (actual[metric] !== expectedMetrics[metric]) {
      errors.push(`${metric} manifest does not match GLB`);
    }
  }
  if (textureBytes !== expectedMetrics.textureBytes) {
    errors.push('Decoded texture estimate disagrees with manifest');
  }
  if (quality === 'low' && triangles > asset.metrics.triangles / 2) {
    errors.push('Low-detail triangles exceed half the baseline');
  }
  if (
    quality === 'opaque' &&
    doc
      .getRoot()
      .listMaterials()
      .some(
        (material) =>
          material.getAlphaMode() !== 'OPAQUE' || material.getBaseColorFactor()[3] !== 1,
      )
  ) {
    errors.push('Opaque variant contains transparent materials');
  }
  for (const material of materials) {
    if (!expectedRoles[material]) {
      errors.push(`Missing material role: ${material}`);
    }
  }
  for (const sourceFile of [source.blend, source.recipe]) {
    if (!(await Bun.file(resolve(root, sourceFile)).exists())) {
      errors.push(`Missing source: ${sourceFile}`);
    }
  }
  if (variant) {
    const raw = await Bun.file(
      resolve(root, `src/frontend/assets/metadata/${asset.id}.v${asset.version}${suffix}.json`),
    ).json();
    const manifest = assetCatalogSchema.safeParse([raw]);
    const metadata = manifest.success ? manifest.data[0] : undefined;
    if (!metadata) {
      errors.push('Invalid standalone variant metadata');
    } else {
      for (const key of [
        'sockets',
        'colliders',
        'footprint',
        'requiredNodes',
        'anchor',
        'facing',
        'branding',
        'portalRise',
      ] as const) {
        if (JSON.stringify(metadata[key]) !== JSON.stringify(asset[key])) {
          errors.push(`Variant changed the ${key} interface`);
        }
      }
    }
  }
  return { id: asset.id, version: asset.version, quality, ...actual, errors };
}

export async function validateCatalog(
  options: { publish?: boolean } = {},
): Promise<Result<AssetReport[], AssetError>> {
  const input = options.publish
    ? '.cache/assets/catalog.candidate.v1.json'
    : 'src/frontend/assets/metadata/catalog.v1.json';
  const read = await ResultAsync.fromPromise(Bun.file(resolve(root, input)).json(), (cause) => ({
    code: 'ASSET_IO' as const,
    message: String(cause),
  }));
  if (read.isErr()) {
    return err(read.error);
  }
  const parsed = assetCatalogSchema.safeParse(read.value);
  if (!parsed.success) {
    return err({ code: 'ASSET_INVALID', message: parsed.error.message });
  }
  const reports = await ResultAsync.fromPromise(
    Promise.all(
      parsed.data.flatMap((asset) => {
        const qualities: Quality[] = [
          'baseline',
          ...(asset.variants?.low ? ['low' as const] : []),
          ...(asset.variants?.opaque ? ['opaque' as const] : []),
        ];
        return qualities.map((quality) => inspectAsset(asset, quality));
      }),
    ),
    (cause) => ({ code: 'ASSET_IO' as const, message: String(cause) }),
  );
  if (reports.isErr()) {
    return err(reports.error);
  }
  await Bun.write(
    resolve(root, 'reports/assets/catalog-validation.json'),
    `${JSON.stringify({ validator: '2.0.0-dev.3.10', inspector: '4.5.1', assets: reports.value }, null, 2)}\n`,
  );
  const failures = reports.value.filter((report) => report.errors.length);
  if (failures.length) {
    return err({
      code: 'ASSET_INVALID',
      message: failures.map((r) => `${r.id}/${r.quality}: ${r.errors.join('; ')}`).join('\n'),
    });
  }
  if (options.publish) {
    const published = await ResultAsync.fromPromise(
      Bun.write(
        resolve(root, 'src/frontend/assets/metadata/catalog.v1.json'),
        `${JSON.stringify(parsed.data, null, 2)}\n`,
      ),
      (cause) => ({ code: 'ASSET_IO' as const, message: String(cause) }),
    );
    if (published.isErr()) {
      return err(published.error);
    }
  }
  return ok(reports.value);
}
if (import.meta.main) {
  const result = await validateCatalog({ publish: process.argv.includes('--publish') });
  if (result.isErr()) {
    process.stderr.write(`${result.error.code}: ${result.error.message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Validated ${result.value.length} baseline/quality exports against actual GLB data.\n`,
    );
  }
}
