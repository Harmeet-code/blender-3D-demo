import type { PlanDocument, PlanObject } from '../../../model/types.ts';
import type { InteractionTarget } from './proximity.ts';
import type { BoothMeta, Role } from '../contracts.ts';
import { projectBoothForRole } from '../foundation/role-policy.ts';

export interface WalkTargetDetails {
  label: string;
  value: string;
}

export interface AdaptedWalkTarget extends InteractionTarget {
  details: readonly WalkTargetDetails[];
}

const describeValue = (value: string | number | boolean | undefined) =>
  value === undefined || value === '' ? null : String(value);

function detailsForObject(object: PlanObject, floorId: string, role: Role): WalkTargetDetails[] {
  const common: WalkTargetDetails[] = [
    { label: 'Type', value: object.recipe },
    { label: 'Name', value: object.name },
  ];
  if (object.recipe === 'booth' || object.recipe === 'polygon-booth') {
    const fields = {
      exhibitor: object.company || null,
      boothType: object.boothType || null,
      boothNumber: object.boothNumber || null,
      status: object.status.toLowerCase(),
      price: object.price ?? null,
      tags: object.tags || null,
      contactName: object.contactName || null,
      contactEmail: object.contactEmail || null,
      contactPhone: object.contactPhone || null,
    } satisfies BoothMeta['fields'];
    // PlanObject does not yet carry per-field ACLs. Preserve its established public/staff
    // split while routing presentation through the foundation projection used by BoothMeta.
    const fieldVisibility = {
      visitor: ['exhibitor', 'boothType', 'boothNumber', 'status', 'price', 'tags'],
      staff: Object.keys(fields),
    };
    const projected = projectBoothForRole({
      id: object.id,
      label: object.name,
      floorId,
      boundsM: { width: object.dimensions[0], height: object.dimensions[1], depth: object.dimensions[2] },
      fields,
      fieldVisibility,
    }, role);
    const labels: Record<string, string> = {
      exhibitor: 'Exhibitor', boothType: 'Booth type', boothNumber: 'Booth number',
      status: 'Status', price: 'Price', tags: 'Tags', contactName: 'Contact',
      contactEmail: 'Email', contactPhone: 'Phone',
    };
    common.push(...Object.entries(projected.fields).flatMap(([key, raw]) => {
      const value = describeValue(raw === null ? undefined : raw);
      return value === null ? [] : [{ label: labels[key] ?? key, value }];
    }));
  } else {
    common.push({ label: 'Dimensions', value: object.dimensions.map((value) => `${value} m`).join(' × ') });
  }
  return common;
}

/** Adapt only real objects in the pinned, current-floor walkthrough document. */
export function createWalkInteractionTargets(
  document: PlanDocument,
  floorId: string,
  originY: number,
  role: Role,
): AdaptedWalkTarget[] {
  const floor = document.floors.find((candidate) => candidate.source.id === floorId);
  if (!floor) return [];
  const floorY = floor.source.heightOffset + originY;
  return floor.objects
    .filter((object) => object.recipe !== 'avatar')
    .map((object) => ({
      id: `instance:${floorId}:${object.id}`,
      targetId: object.id,
      targetKind: 'authored-instance' as const,
      actions: [{ kind: 'inspect' as const, label: 'Inspect' }],
      radiusM: 2.25,
      infoDwellMs: 450,
      position: [object.position[0], floorY + Math.max(0.5, object.dimensions[1] / 2), object.position[1]] as const,
      details: detailsForObject(object, floorId, role),
    }));
}
