import { Box3 } from 'three';
import { ASSET_IDS } from '@/features/assets/model/asset-schema.ts';
import { getAssetCatalog } from '@/features/assets/model/catalog.ts';
import baseCatalog from '@/assets/metadata/catalog.v1.json';
import boothCatalog from '@/assets/metadata/booth-sizes.v1.json';
import { expansionAssetMetadata } from '@/features/assets/model/expansion-metadata.ts';
import { createProceduralAsset, getProceduralAssetIds } from '@/features/assets/catalog/procedural-assets.ts';
import { authoredInstancePhysical } from '@/features/building/model/authored-instance-physical.ts';
import type { PlanDocument } from '../../../model/types.ts';
import type { Role } from '../../../wayfinding/walkthrough/contracts.ts';
import { buildCollisionMap } from '../../../wayfinding/walkthrough/collision/capsule-clearance.ts';
import { createWalkInteractionTargets } from '../../../wayfinding/walkthrough/interaction/target-adapter.ts';

const root = 'src/floor-plan-builder/';
const evidence = {
  catalog: 'src/features/assets/catalog/procedural-assets.ts#createProceduralAsset/getProceduralAssetIds',
  physical: 'src/features/building/model/authored-instance-physical.ts#authoredInstancePhysical',
  collision: `${root}wayfinding/walkthrough/collision/capsule-clearance.ts#buildCollisionMap`,
  targets: `${root}wayfinding/walkthrough/interaction/target-adapter.ts#createWalkInteractionTargets`,
  actions: `${root}wayfinding/walkthrough/interaction/local-actions.ts#WalkLocalActions`,
  runtime: `${root}wayfinding/walkthrough/WalkthroughLayer.tsx#Runtime`,
  connector: `${root}wayfinding/walkthrough/connectors/connector-runtime.ts#connectorRecordForLeg`,
  schema: 'src/features/building/model/building-schema.ts#portalSchema/floorAuthoringSchema',
};
export interface CoverageRow {
  key: string; kind: string; id: string; source: string; geometry: string;
  inspect: string; use: string; navigation: string; collision: string; multifloor: string; evidence: string[];
}
const json = (value: unknown) => JSON.stringify(value);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Explicit source memberships, including overlaps; never manufacture identities to meet a target. */
export function inventoryEvidence() {
  const families = [
    { source: 'src/assets/metadata/catalog.v1.json', ids: baseCatalog.map((item) => item.id) },
    { source: 'src/assets/metadata/booth-sizes.v1.json', ids: boothCatalog.map((item) => item.id) },
    { source: 'src/features/assets/model/expansion-metadata.ts', ids: expansionAssetMetadata.map((item) => item.id) },
  ];
  const records = families.flatMap((family) => family.ids);
  const ids = [...new Set([...records, ...ASSET_IDS, ...getProceduralAssetIds(), ...getAssetCatalog().map((item) => item.id)])];
  const duplicates = records.filter((id, index) => records.indexOf(id) !== index);
  const comparisons = [
    { name: 'metadata families', ids: records },
    { name: 'ASSET_IDS', ids: [...ASSET_IDS] as string[] },
    { name: 'procedural union', ids: [...getProceduralAssetIds()] },
    { name: 'resolved catalog', ids: getAssetCatalog().map((item) => item.id) },
  ].map((source) => ({ name: source.name, ids: source.ids, missing: ids.filter((id) => !source.ids.includes(id)) }));
  return { families, ids, duplicates, comparisons,
    reconciliation: `Existing inventory: ${ids.length} distinct IDs (${families.map((family) => family.ids.length).join(' + ')}). Historical 49 = 14 + 8 + 27 is unsupported: recon-4 lists only 25 expansion IDs. No two additional IDs are named in the examined sources; missing historical identities UNKNOWN.` };
}

/** Fresh, exclusively owned recipe scenes; measure identity mesh bounds and release resources.
 * These are computed baseline extents, never mounted-scene observations. */
export function measureCatalog(): CoverageRow[] {
  const inventory = inventoryEvidence();
  return inventory.ids.map((id, index) => {
    const row: CoverageRow = {
      key: `catalog:${index}:${id}`, kind: 'Canonical procedural asset', id,
      source: `${inventory.families.flatMap((family) => family.ids.flatMap((member, i) => member === id ? [`${family.source}[${i}]`] : [])).join('; ') || 'schema/catalog only'}; unplaced`, geometry: 'UNKNOWN: recipe generation failed',
      inspect: 'UNKNOWN: unplaced asset; no current-floor proximity target supplied',
      use: 'UNKNOWN: unplaced asset; metadata does not register a handler',
      navigation: 'N/A: unplaced asset contributes no document obstacle or route node',
      collision: 'UNKNOWN: no placed instance or executed collision query',
      multifloor: 'UNKNOWN: no authored portal linkage', evidence: [evidence.catalog, ...inventory.families.filter((family) => family.ids.includes(id)).map((family) => `${family.source}#${id}`), 'src/features/assets/model/asset-schema.ts#ASSET_IDS', 'src/features/assets/model/catalog.ts#getAssetCatalog'],
    };
    let asset: ReturnType<typeof createProceduralAsset> = null;
    try {
      asset = createProceduralAsset(id);
      if (!asset) { row.geometry = 'UNAVAILABLE: canonical ID has no recipe'; return row; }
      const bounds = new Box3().setFromObject(asset.scene);
      row.source += `; ${asset.metadata.label}; recipe ${asset.metadata.source.recipe}`;
      row.collision = `SOURCE DECLARED: ${asset.metadata.colliders.length} collider boxes ${json(asset.metadata.colliders)}. Placement enablement / live contact UNKNOWN.`;
      row.multifloor = `Sockets ${json(asset.metadata.sockets)}. Linkage / traversal UNKNOWN: sockets alone do not establish a connector.`;
      row.geometry = `Declared dimensions ${json(asset.metadata.dimensions)}\nComputed baseline mesh AABB ${bounds.isEmpty() ? 'UNAVAILABLE: empty geometry' : json({ min: bounds.min.toArray(), max: bounds.max.toArray() })}\nCollider declarations ${json(asset.metadata.colliders)}\nWorld rendered extents / collision execution: N/A (unplaced).`;
    } catch (error) { row.geometry = `UNAVAILABLE: ${errorMessage(error)}`; }
    finally { asset?.dispose(); }
    return row;
  });
}

export function buildCoverage(document: PlanDocument, role: Role, catalog: CoverageRow[]) {
  const rows = [...catalog];
  const issues: string[] = [];
  for (const row of catalog) {
    if (row.geometry.startsWith('UNAVAILABLE:')) { issues.push(`Catalog ${row.id}: ${row.geometry}`); }
  }
  const inventory = inventoryEvidence();
  for (const source of inventory.comparisons) {
    if (source.missing.length) { issues.push(`${source.name} missing IDs: ${source.missing.join(', ')}`); }
  }
  if (inventory.duplicates.length) { issues.push(`Duplicate source memberships: ${inventory.duplicates.join(', ')}`); }
  const omitted = inventory.ids.filter((id) => !catalog.some((row) => row.id === id));
  if (omitted.length) { issues.push(`Missing matrix asset rows: ${omitted.join(', ')}`); }
  const checkDuplicates = (values: readonly string[], label: string) => {
    const seen = new Set<string>();
    for (const id of values) { if (seen.has(id)) { issues.push(`Duplicate ${label}: ${id}`); } seen.add(id); }
  };
  checkDuplicates(catalog.map((row) => row.id), 'matrix asset ID');
  checkDuplicates(document.floors.map((floor) => floor.source.id), 'floor');
  checkDuplicates(document.baseline.portals.map((portal) => portal.id), 'portal');
  let placed = 0, persisted = 0, merged = 0;
  document.floors.forEach((floor, floorIndex) => {
    const floorId = floor.source.id;
    const instances = floor.source.authoring?.instances ?? [];
    placed += floor.objects.length; persisted += instances.length;
    checkDuplicates(floor.objects.map((object) => object.id), `placed ID on ${floorId}`);
    checkDuplicates(instances.map((instance) => instance.id), `persisted ID on ${floorId}`);
    for (const instance of instances) {
      if (instance.assetId && !inventory.ids.includes(instance.assetId)) { issues.push(`Instance ${floorId}/${instance.id} references asset outside canonical inventory: ${instance.assetId}; external/fallback geometry is not canonical asset proof.`); }
    }
    const map = buildCollisionMap(floor);
    const targets = createWalkInteractionTargets(document, floorId, 0, role);
    const collisionFor = (id: string) => {
      const shapes = map.obstacles.filter((shape) => shape.id.startsWith(`${id}:`) && /^\d+$/.test(shape.id.slice(id.length + 1)));
      const unsupported = map.unsupported.filter((issue) => issue.id === id);
      return `Computed document prisms (default door state; active session not supplied) (${shapes.length}): ${json(shapes.map(({ polygon, minY, maxY, source }) => ({ polygon, minY, maxY, source })))}${unsupported.length ? `\nUNAVAILABLE: ${unsupported.map((issue) => issue.reason).join('; ')}` : ''}\nLive capsule contact/clearance: UNKNOWN.`;
    };
    floor.objects.forEach((object, objectIndex) => {
      const matches = instances.filter((instance) => instance.id === object.id);
      merged += matches.length;
      const target = targets.find((item) => item.targetId === object.id);
      const portal = document.baseline.portals.find((item) => item.id === object.portalId);
      const connector = ['stairs', 'ramp', 'escalator', 'elevator'].includes(object.recipe);
      if (object.portalId && !portal) { issues.push(`Instance ${floorId}/${object.id} references missing portal ${object.portalId}.`); }
      const use = target?.actions.filter((action) => action.kind === 'use').map((action) => {
        return `${action.label} [${action.capability}]: SOURCE DECLARED; current handler availability / state UNKNOWN (session inputs not supplied)${action.requiresConfirmation ? '; confirmation required' : ''}`;
      }) ?? [];
      rows.push({
        key: `object:${floorIndex}:${objectIndex}`, kind: 'Document instance', id: object.id,
        source: `floors[${floorIndex}].objects[${objectIndex}]; floor ${floorId}; recipe ${object.recipe}; schema ${object.documentType ?? 'unspecified'}; ${object.name}; persisted matches ${matches.length}; asset IDs ${json(matches.map((instance) => instance.assetId))}; portal ${object.portalId || 'none'}`,
        geometry: `Declared recipe dimensions ${json(object.dimensions)}; scale ${json(object.scale)}; position XZ ${json(object.position)}; floor Y ${floor.source.heightOffset}; yaw ${object.yawRadians}; planar matrix ${json(object.planarMatrix ?? null)}\nPersisted counterparts (independent declarations, not assumed identical): ${json(matches.map(({ id, assetId, dimensions, scale, position, yawRadians, collidable }) => ({ id, assetId, dimensions, scale, position, yawRadians, collidable })))}\nRendered world mesh extents UNKNOWN: mounted Object3D is not supplied.`,
        inspect: target ? `SOURCE SUPPORTED: proximity ${target.radiusM} m; dwell ${target.infoDwellMs} ms. Projected field labels for ${role}: ${target.details.map((detail) => detail.label).join(', ')}. Live dwell UNKNOWN; client projection, no ACL.` : 'UNAVAILABLE: avatar excluded by target adapter',
        use: use.join('\n') || 'UNAVAILABLE: adapter declares no local use action',
        navigation: `collidable=${object.collidable}; floor obstacle input, not a destination node by itself. Role route enforcement UNKNOWN: resolved policy not supplied.\n${map.unsupported.length ? `Floor unsupported geometry: ${json(map.unsupported)}` : ''}`,
        collision: collisionFor(object.id),
        multifloor: connector || portal ? `Portal ${portal ? `${portal.id} (${portal.type}); endpoints ${json(portal.connects)}; entries ${json(portal.entries ?? [])}` : 'UNAVAILABLE: no matching portal'}. Physical traversal UNKNOWN: requires compiled route leg, path binding, sweep and landing validation in Runtime. ${object.recipe === 'ramp' ? 'Portal schema has no ramp type; geometry alone is not portal proof.' : ''}` : 'UNKNOWN: no linked portal; non-connector recipe',
        evidence: [evidence.targets, evidence.actions, evidence.runtime, evidence.collision, ...(connector || portal ? [evidence.connector, evidence.schema] : [])],
      });
    });
    instances.forEach((instance, index) => {
      if (floor.objects.some((object) => object.id === instance.id)) { return; }
      let geometry: string;
      try {
        const physical = authoredInstancePhysical(instance);
        geometry = `Computed physical adapter provider ${physical.provider}; scale ${json(physical.scale)}; boxes ${json(physical.boxes)}. Collision solids, not rendered mesh bounds.`;
      } catch (error) { geometry = `UNAVAILABLE physical adapter: ${errorMessage(error)}`; }
      rows.push({
        key: `instance:${floorIndex}:${index}`, kind: 'Persisted authored instance', id: instance.id,
        source: `floors[${floorIndex}].source.authoring.instances[${index}]; floor ${floorId}; asset ${instance.assetId ?? 'external URL'}; no placed object match`,
        geometry: `Declared dimensions ${json(instance.dimensions)}; scale ${json(instance.scale)}; position XZ ${json(instance.position)}; yaw ${instance.yawRadians}; floor Y ${floor.source.heightOffset}\n${geometry}\nRendered world extents UNKNOWN: no mounted mesh input.`,
        inspect: 'UNAVAILABLE: interaction adapter enumerates floor.objects only',
        use: 'UNAVAILABLE: no target for persisted-only record',
        navigation: `collidable=${instance.collidable}; ${instance.collidable ? 'physical obstacle adapter input' : 'excluded from collision map'}. Route role projection UNKNOWN (policy not supplied).\n${map.unsupported.length ? `Floor unsupported geometry: ${json(map.unsupported)}` : ''}`,
        collision: collisionFor(instance.id),
        multifloor: 'UNAVAILABLE: persisted instance schema has no portal linkage; asset name is not linkage evidence',
        evidence: [evidence.physical, evidence.collision, evidence.targets, evidence.schema],
      });
    });
  });
  document.baseline.portals.forEach((portal, index) => {
    const linked = document.floors.flatMap((floor) => floor.objects.filter((object) => object.portalId === portal.id).map((object) => `${floor.source.id}/${object.id}:${object.recipe}`));
    const missing = portal.connects.filter((id) => !document.floors.some((floor) => floor.source.id === id));
    if (missing.length) { issues.push(`Portal ${portal.id} references missing document floors ${missing.join(', ')}.`); }
    rows.push({ key: `portal:${index}`, kind: 'Document connector / portal', id: portal.id,
      source: `baseline.portals[${index}]; schema ${portal.type}; owned=${document.ownedPortalIds?.includes(portal.id) ?? false}; linked instances ${json(linked)}`,
      geometry: `Entries ${json(portal.entries ?? [])}; position XZ ${json(portal.position ?? null)}. UNAVAILABLE dimensions/collider: portal schema supplies topology, not physical geometry.`,
      inspect: 'UNAVAILABLE: portal is not an object proximity target', use: 'UNAVAILABLE: no local use target; inspect linked instance actions',
      collision: 'UNKNOWN: topology record has no physical solids; see linked instance rows.',
      navigation: `Topology candidate connects ${json(portal.connects)}. Route eligibility UNKNOWN: resolved policy / route leg not supplied. Metadata is not traversability proof.`,
      multifloor: linked.length ? 'Linked instances found. Traversal UNKNOWN until runtime path, proxy, endpoint and sweep gates accept a compiled leg.' : 'UNAVAILABLE physical traversal: no linked PlanObject connector',
      evidence: [evidence.schema, evidence.connector, evidence.runtime],
    });
  });
  (document.ownedPortalIds ?? []).forEach((id, index) => {
    if (document.baseline.portals.some((portal) => portal.id === id)) { return; }
    issues.push(`Owned portal ${id} has no baseline record.`);
    rows.push({ key: `orphan:${index}`, kind: 'Unresolved owned portal reference', id, source: `ownedPortalIds[${index}]`, geometry: 'UNAVAILABLE: missing portal record', inspect: 'UNAVAILABLE', use: 'UNAVAILABLE', collision: 'UNKNOWN: missing record', navigation: 'UNAVAILABLE: unresolved reference', multifloor: 'UNAVAILABLE: no endpoints', evidence: [evidence.schema] });
  });
  checkDuplicates(document.ownedPortalIds ?? [], 'owned portal reference');
  return { rows, issues, inventory, summary: `${catalog.length}/${inventory.ids.length} existing asset IDs · ${placed} placed + ${persisted} persisted records (${merged} joined by floor/ID) · ${document.baseline.portals.length} portals · ${rows.length} total rows · ${omitted.length} omitted asset IDs` };
}
