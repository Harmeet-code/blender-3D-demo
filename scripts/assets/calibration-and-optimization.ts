import { NodeIO, getBounds } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import catalogJson from '../../src/frontend/assets/metadata/catalog.v1.json';
import { assetCatalogSchema } from '../../src/frontend/entities/asset/model/asset-schema.ts';
import { ResultAsync } from 'neverthrow';
async function inspect() {
  const catalog = assetCatalogSchema.parse(catalogJson);
  const io = new NodeIO();
  const calibration = await io.read('assets-source/blender/calibration.glb');
  const nodes = calibration.getRoot().listNodes();
  const named = (name: string) => {
    const node = nodes.find((candidateNode) => candidateNode.getName() === name);
    if (!node) {
      throw new Error(`Missing calibration node ${name}`);
    }
    return node;
  };
  const assertNear = (a: readonly number[], b: readonly number[]) => {
    if (a.some((value, i) => Math.abs(value - (b[i] ?? Infinity)) > 0.005)) {
      throw new Error(`Calibration mismatch ${a} vs ${b}`);
    }
  };
  const root = named('root');
  assertNear(root.getScale(), [1, 1, 1]);
  assertNear(root.getTranslation(), [0, 0, 0]);
  assertNear(root.getRotation(), [0, 0, 0, 1]);
  const bounds = getBounds(named('meter_cube'));
  assertNear(bounds.min, [-0.5, 0, -0.5]);
  assertNear(bounds.max, [0.5, 1, 0.5]);
  assertNear(named('front_positive_z').getWorldTranslation(), [0, 0, 1]);
  assertNear(named('floor_F1').getWorldTranslation(), [0, 0, 0]);
  assertNear(named('floor_B1').getWorldTranslation(), [0, -4, 0]);
  await Bun.write(
    'reports/assets/calibration-validation.json',
    `${JSON.stringify({ passed: true, bounds, front: named('front_positive_z').getWorldTranslation(), floors: { F1: named('floor_F1').getWorldTranslation(), B1: named('floor_B1').getWorldTranslation() }, rootScale: root.getScale() }, null, 2)}\n`,
  );
  const reports: Array<{
    id: string;
    quality: string;
    sameMaterials: boolean;
    plainBytes: number;
    reserializedBytes: number;
    plainNodeIOMedianMs: number;
    candidateNodeIOMedianMs: number;
    sameInterface: boolean;
    sameGeometry: boolean;
    acceptedCandidate: boolean;
  }> = [];
  for (const asset of catalog) {
    for (const [quality, file] of [
      ['baseline', `${asset.id}.v1.glb`],
      ...Object.entries(asset.variants ?? {}).map(([name, variant]) => [name, variant.file]),
    ] as Array<[string, string]>) {
      const bytes = new Uint8Array(
        await Bun.file(`src/frontend/assets/models/${file}`).arrayBuffer(),
      );
      const doc = await io.readBinary(bytes);
      const candidate = await io.writeBinary(doc);
      const validated = await validateBytes(candidate);
      if (validated.issues.numErrors) {
        throw new Error(`Invalid candidate ${asset.id}`);
      }
      const second = await io.readBinary(candidate);
      const interfaceOf = (document: typeof doc) =>
        document
          .getRoot()
          .listNodes()
          .map((node) => ({ name: node.getName(), matrix: node.getWorldMatrix() }))
          .sort((a, b) => a.name.localeCompare(b.name));
      const sameInterface =
        JSON.stringify(interfaceOf(doc)) === JSON.stringify(interfaceOf(second));
      const geometryOf = (document: typeof doc) =>
        document
          .getRoot()
          .listAccessors()
          .map((a) =>
            JSON.stringify({
              type: a.getType(),
              component: a.getComponentType(),
              data: Array.from(a.getArray() ?? []),
            }),
          )
          .sort();
      const sameGeometry = JSON.stringify(geometryOf(doc)) === JSON.stringify(geometryOf(second));

      const materialsOf = (document: typeof doc) =>
        document
          .getRoot()
          .listMaterials()
          .map((material) =>
            JSON.stringify({
              name: material.getName(),
              color: material.getBaseColorFactor(),
              metallic: material.getMetallicFactor(),
              roughness: material.getRoughnessFactor(),
              emissive: material.getEmissiveFactor(),
              alpha: material.getAlphaMode(),
              cutoff: material.getAlphaCutoff(),
              doubleSided: material.getDoubleSided(),
            }),
          )
          .sort();
      const sameMaterials =
        JSON.stringify(materialsOf(doc)) === JSON.stringify(materialsOf(second));
      const medianDecode = async (input: Uint8Array) => {
        const samples: number[] = [];
        for (let i = 0; i < 7; i++) {
          const start = performance.now();
          await io.readBinary(input);
          samples.push(performance.now() - start);
        }
        samples.sort((a, b) => a - b);
        return samples[3] ?? Infinity;
      };
      reports.push({
        id: asset.id,
        quality,
        sameMaterials,
        plainBytes: bytes.length,
        reserializedBytes: candidate.length,
        plainNodeIOMedianMs: await medianDecode(bytes),
        candidateNodeIOMedianMs: await medianDecode(candidate),
        sameInterface,
        sameGeometry,
        acceptedCandidate: sameInterface && sameGeometry && sameMaterials,
      });
    }
  }
  await Bun.write(
    'reports/assets/optimization-comparison.json',
    `${JSON.stringify({ selected: 'plain Blender GLB', reason: 'All assets are small, texture-free scalar PBR. Lossless reserialization is inspected but not published; no compressed buffers or external decoder dependency.', timingScope: 'Seven in-process NodeIO reads, median. These are tooling measurements, not browser decode time.', assets: reports }, null, 2)}\n`,
  );
  process.stdout.write(`Calibration passed; lossless candidates compared: ${reports.length}\n`);
}
const inspected = await ResultAsync.fromPromise(inspect(), (error) => ({
  code: 'ASSET_INSPECTION_FAILED',
  message: error instanceof Error ? error.message : String(error),
}));
if (inspected.isErr()) {
  process.stderr.write(`${inspected.error.code}: ${inspected.error.message}\n`);
  process.exitCode = 1;
}
