import { NodeIO, getBounds } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import { ResultAsync, err, ok, type Result } from 'neverthrow';
import { resolve } from 'node:path';
import { assetCatalogSchema, type AssetMetadata } from '../../src/frontend/entities/asset/model/asset-schema.ts';

interface AssetError { code: 'ASSET_IO' | 'ASSET_INVALID'; message: string }
interface AssetReport { id: string; version: number; triangles: number; materials: number; bytes: number; textureBytes: number; errors: string[] }
const root = resolve(import.meta.dir, '../..');
const close = (a: number, b: number) => Math.abs(a - b) <= 0.005;

export async function inspectAsset(asset: AssetMetadata): Promise<AssetReport> {
  const path = resolve(root, `src/frontend/assets/models/${asset.id}.v${asset.version}.glb`);
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const validation = await validateBytes(bytes, { uri: path });
  const doc = await new NodeIO().readBinary(bytes);
  const errors: string[] = [];
  if (validation.issues.numErrors) {errors.push(`glTF validator: ${validation.issues.numErrors} errors`);}
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) {throw new Error('Export has no scene');}
  const bounds = getBounds(scene);
  for (const i of [0, 1, 2] as const) {
    if (!close(bounds.min[i], asset.bounds.min[i]) || !close(bounds.max[i], asset.bounds.max[i])) {errors.push(`Exported bounds disagree on axis ${i}`);}
  }
  const nodes = doc.getRoot().listNodes();
  const assetRoot = nodes.find((node) => node.getName() === 'root');
  if (!assetRoot || assetRoot.getTranslation().some((n) => Math.abs(n) > 0.00001) || assetRoot.getScale().some((n) => Math.abs(n - 1) > 0.00001) || assetRoot.getRotation().some((n, i) => Math.abs(n - (i === 3 ? 1 : 0)) > 0.00001)) {errors.push('Asset root must have a neutral transform');}
  for (const name of asset.requiredNodes) {if (!nodes.some((node) => node.getName() === name)) {errors.push(`Missing required node: ${name}`);}}
  for (const [name, socket] of Object.entries(asset.sockets)) {
    const node = nodes.find((n) => n.getName() === name);
    if (!node || !node.getWorldTranslation().every((n, i) => close(n, socket.position[i] ?? Infinity))) {errors.push(`Socket transform mismatch: ${name}`);}
  }
  let triangles = 0;
  const materials = new Set<string>();
  for (const mesh of doc.getRoot().listMeshes()) {for (const primitive of mesh.listPrimitives()) {
    if (primitive.getMode() !== 4) {errors.push('Release primitives must be triangles');}
    triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    const material = primitive.getMaterial();
    if (material) {materials.add(material.getName());}
  }}
  let textureBytes = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize();
    if (!size) {errors.push('Texture dimensions unavailable');}
    else { textureBytes += Math.ceil(size[0] * size[1] * 4 * 4 / 3); if (Math.max(...size) > asset.budget.textureSize) {errors.push('Texture exceeds release limit');} }
  }
  const actual = { triangles, materials: materials.size, bytes: bytes.byteLength, textureBytes };
  for (const metric of ['triangles', 'materials', 'bytes'] as const) {
    if (actual[metric] > asset.budget[metric]) {errors.push(`${metric} exceeds release budget`);}
    if (actual[metric] !== asset.metrics[metric]) {errors.push(`${metric} manifest does not match GLB`);}
  }
  for (const material of materials) {if (!asset.materialRoles[material]) {errors.push(`Missing material role: ${material}`);}}
  for (const source of [asset.source.blend, asset.source.recipe]) {if (!await Bun.file(resolve(root, source)).exists()) {errors.push(`Missing source: ${source}`);}}
  return { id: asset.id, version: asset.version, ...actual, errors };
}

export async function validateCatalog(): Promise<Result<AssetReport[], AssetError>> {
  const read = await ResultAsync.fromPromise(Bun.file(resolve(root, 'src/frontend/assets/metadata/catalog.v1.json')).json(), (cause) => ({ code: 'ASSET_IO' as const, message: String(cause) }));
  if (read.isErr()) {return err(read.error);}
  const parsed = assetCatalogSchema.safeParse(read.value);
  if (!parsed.success) {return err({ code: 'ASSET_INVALID', message: parsed.error.message });}
  const reports = await ResultAsync.fromPromise(Promise.all(parsed.data.map(inspectAsset)), (cause) => ({ code: 'ASSET_IO' as const, message: String(cause) }));
  if (reports.isErr()) {return err(reports.error);}
  await Bun.write(resolve(root, 'reports/assets/catalog-validation.json'), `${JSON.stringify({ validator: '2.0.0-dev.3.10', inspector: '4.5.1', assets: reports.value }, null, 2)  }\n`);
  const failures = reports.value.filter((report) => report.errors.length);
  return failures.length ? err({ code: 'ASSET_INVALID', message: failures.map((r) => `${r.id}: ${r.errors.join('; ')}`).join('\n') }) : ok(reports.value);
}
if (import.meta.main) {
  const result = await validateCatalog();
  if (result.isErr()) { process.stderr.write(`${result.error.code}: ${result.error.message}\n`); process.exitCode = 1; }
  else {process.stdout.write(`Validated ${result.value.length} assets against actual GLB data.\n`);}
}
