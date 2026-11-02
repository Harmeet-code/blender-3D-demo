import type { PlanDocument, PlanObject } from '../../../model/types.ts';
import type { InteractionTarget } from './proximity.ts';
import type { Role } from '../contracts.ts';

export interface WalkTargetDetails {
  label: string;
  value: string;
}

export interface AdaptedWalkTarget extends InteractionTarget {
  details: readonly WalkTargetDetails[];
}

const describeValue = (value: string | number | boolean | undefined) =>
  value === undefined || value === '' ? null : String(value);

function detailsForObject(object: PlanObject, role: Role): WalkTargetDetails[] {
  const common: WalkTargetDetails[] = [
    { label: 'Type', value: object.recipe },
    { label: 'Name', value: object.name },
  ];
  if (object.recipe === 'booth' || object.recipe === 'polygon-booth') {
    const boothFields: [string, string | number | boolean | undefined][] = [
      ['Exhibitor', object.company],
      ['Booth type', object.boothType],
      ['Booth number', object.boothNumber],
      ['Status', object.status.toLowerCase()],
      ['Price', object.price],
      ['Tags', object.tags],
    ];
    if (role === 'staff') {
      boothFields.push(['Contact', object.contactName], ['Email', object.contactEmail], ['Phone', object.contactPhone]);
    }
    common.push(...boothFields.flatMap(([label, raw]) => {
      const value = describeValue(raw);
      return value === null ? [] : [{ label, value }];
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
      details: detailsForObject(object, role),
    }));
}
