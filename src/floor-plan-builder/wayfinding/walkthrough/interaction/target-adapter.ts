import { localActionsFor } from './local-actions.ts';
import type { PlanDocument, PlanObject } from '../../../model/types.ts';
import type { InteractionTarget } from './proximity.ts';
import type { BoothMeta, Role } from '../contracts.ts';
import { projectBoothMetaView } from './booth-meta-view.ts';

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
      ...(object.company ? { company: object.company } : {}),
      ...(object.boothType ? { category: object.boothType } : {}),
      ...(object.name ? { boothName: object.name } : {}),
      ...(object.boothNumber ? { boothNumber: object.boothNumber } : {}),
      ...(object.contactName || object.contactEmail || object.contactPhone
        ? { contactDetails: [object.contactName, object.contactEmail, object.contactPhone].filter(Boolean).join(' · ') }
        : {}),
    } satisfies BoothMeta['fields'];
    const projected = projectBoothMetaView({
      id: object.id,
      label: object.name,
      floorId,
      boundsM: { width: object.dimensions[0], height: object.dimensions[1], depth: object.dimensions[2] },
      fields,
      fieldVisibility: { staff: Object.keys(fields), visitor: ['company', 'category', 'boothName', 'boothNumber', 'publicDescription'] },
    }, role);
    const labels: Record<string, string> = {
      company: 'Company', category: 'Booth type', boothName: 'Booth name',
      boothNumber: 'Booth number', contactDetails: 'Contact',
    };
    common.push(...Object.entries(projected).flatMap(([key, raw]) => {
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
  if (!floor) {return [];}
  const floorY = floor.source.heightOffset + originY;
  return floor.objects
    .filter((object) => object.recipe !== 'avatar')
    .map((object) => {
      const target: AdaptedWalkTarget = {
        id: `instance:${floorId}:${object.id}`,
        targetId: object.id,
        targetKind: 'authored-instance',
        actions: [
          { kind: 'inspect', label: 'Inspect' },
          ...localActionsFor(object.recipe),
        ],
        radiusM: 2.25,
        infoDwellMs: 350,
        position: [
          object.position[0],
          floorY + (object.recipe === 'elevator'
            ? (object.circulationDesign?.cabinLevel === 'upper' ? object.dimensions[1] : 0) + 1
            : Math.min(1.2, Math.max(0.5, object.dimensions[1] / 2))),
          object.position[1],
        ],
        details: detailsForObject(object, floorId, role),
      };
      // Entrance authoring has no role ACL. Do not infer one from the selected walkthrough role.
      if (object.recipe === 'entrance' && object.entranceGate === 'arch-sliding-doors') {
        target.proximityEffect = { kind: 'reversible-door', openOnEnter: true, closeOnExit: true };
      }
      return target;
    });
}

