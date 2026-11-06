import { objectPoints } from '../../../model/geometry.ts';
import type { PlanDocument } from '../../../model/types.ts';
import type { Role } from '../contracts.ts';
import type { WalkableZone } from '../../model/zone-schema.ts';

/**
 * Explicit adapter data for role restrictions not represented in current persisted schemas.
 * Do not derive these IDs from object labels, asset sockets, or free-form tags.
 */
export interface RouteNavigationPolicySource {
  status?: 'resolved' | 'unavailable';
  staffOnlyZoneIds?: readonly string[];
  staffOnlyDoorObjectIds?: readonly string[];
}

/**
 * The authorized local adapter asserts completeness, never a preview checkbox.
 * Bump revision when ACLs change. This contract does not authenticate staff.
 */
export interface PreviewRolePolicyInput extends RouteNavigationPolicySource {
  status: 'resolved';
  source: string;
  revision: string;
  buildingId: string;
  complete: true;
  staffOnlyZoneIds: readonly string[];
  staffOnlyDoorObjectIds: readonly string[];
}

export const PREVIEW_POLICY_SOURCE_BLOCKER =
  'Navigation and walkthrough details blocked: no authorized complete zone/door ACL source is connected. ' +
  'PlanZone only stores walkable/blocked/display geometry; PlanObject has no door ACL. ' +
  'Walkable areas do not establish visitor access.';

export function resolvePreviewRolePolicy(
  input: PreviewRolePolicyInput | undefined,
  document: PlanDocument,
  zones: WalkableZone[],
): { policy: RouteNavigationPolicySource; error?: string } {
  if (!input) {
    return { policy: EMPTY_ROUTE_NAVIGATION_POLICY, error: PREVIEW_POLICY_SOURCE_BLOCKER };
  }
  if (input.status !== 'resolved' || input.complete !== true ||
      typeof input.source !== 'string' || !input.source.trim() ||
      typeof input.revision !== 'string' || !input.revision.trim() ||
      input.buildingId !== document.baseline.buildingId) {
    return { policy: EMPTY_ROUTE_NAVIGATION_POLICY,
      error: 'Navigation blocked: policy needs a source, revision, complete ACL assertion and matching building ID.' };
  }
  const result = createRoleNavigationZones(document, zones, 'visitor', input);
  return result.error
    ? { policy: EMPTY_ROUTE_NAVIGATION_POLICY, error: result.error }
    : { policy: input };
}

export const EMPTY_ROUTE_NAVIGATION_POLICY: RouteNavigationPolicySource = Object.freeze({ status: 'unavailable' });

export function routeNavigationPolicyKey(policy: RouteNavigationPolicySource): string {
  return JSON.stringify({
    ...policy,
    status: policy.status ?? 'unavailable',
    staffOnlyZoneIds: [...(policy.staffOnlyZoneIds ?? [])].sort(),
    staffOnlyDoorObjectIds: [...(policy.staffOnlyDoorObjectIds ?? [])].sort(),
  });
}

export interface RoleNavigationContext {
  document: PlanDocument;
  zones: WalkableZone[];
  error?: string;
}

/**
 * `restricted` authored zones are staff-only: visitors cannot opt in with the independent
 * route-request bit, while staff are permitted by role. The result remains client-local.
 */
export function roleMayUseRestrictedZones(role: Role): boolean {
  return role === 'staff';
}

/**
 * Convert explicitly supplied staff-only zones and door objects into route barriers for
 * visitors. Current PlanObject and WalkableZone schemas have no staff-only ACL field, so an
 * empty input adds no inferred restrictions.
 */
export function createRoleNavigationZones(
  document: PlanDocument,
  authoredZones: WalkableZone[],
  role: Role,
  policy: RouteNavigationPolicySource = EMPTY_ROUTE_NAVIGATION_POLICY,
): RoleNavigationContext {
  if (role !== 'visitor' && role !== 'staff') {
    return { document, zones: [], error: 'Walk role is invalid; route planning is denied.' };
  }
  if (policy.status !== 'resolved') {
    return { document, zones: [], error: 'Runtime navigation policy is unavailable; route planning is denied.' };
  }
  const validIds = (ids: unknown): ids is readonly string[] =>
    Array.isArray(ids) && ids.every((id) => typeof id === 'string' && !!id.trim()) &&
    new Set(ids).size === ids.length;
  if (!validIds(policy.staffOnlyZoneIds) || !validIds(policy.staffOnlyDoorObjectIds)) {
    return { document, zones: [], error: 'Navigation policy requires explicit complete zone and door ID lists with unique nonblank IDs.' };
  }
  if (!policy.staffOnlyZoneIds?.length && !policy.staffOnlyDoorObjectIds?.length) {
    return { document, zones: authoredZones };
  }

  const staffZoneIds = new Set(policy.staffOnlyZoneIds ?? []);
  const staffDoorIds = new Set(policy.staffOnlyDoorObjectIds ?? []);
  const missingZones = [...staffZoneIds].filter((id) => authoredZones.filter((zone) => zone.id === id).length !== 1);
  const doors = [...staffDoorIds].map((id) => {
    const matches = document.floors.flatMap((floor) =>
      floor.objects.filter((object) => object.id === id).map((object) => ({ floor, object })),
    );
    return { id, matches };
  });
  const missingDoors = doors.filter(({ matches }) => matches.length !== 1 || matches[0]?.object.recipe !== 'entrance').map(({ id }) => id);
  const invalidIds = [...staffZoneIds, ...staffDoorIds].filter((id) => !id.trim());
  if (missingZones.length || missingDoors.length || invalidIds.length) {
    const details = [
      ...(missingZones.length ? [`zone IDs not found: ${missingZones.join(', ')}`] : []),
      ...(missingDoors.length ? [`door object IDs missing or ambiguous: ${missingDoors.join(', ')}`] : []),
      ...(invalidIds.length ? ['blank IDs are not allowed'] : []),
    ];
    return {
      document,
      zones: [],
      error: `Navigation policy could not be resolved (${details.join('; ')}).`,
    };
  }

  if (role === 'staff') {return { document, zones: authoredZones };}

  const zones = authoredZones.map((zone) =>
    staffZoneIds.has(zone.id) ? { ...zone, type: 'restricted' as const } : zone,
  );
  for (const { id, matches } of doors) {
    const match = matches[0]!;
    zones.push({ id: `staff-door:${id}`, floorId: match.floor.source.id, name: 'Staff door barrier', type: 'restricted',
      polygon: objectPoints(match.object, match.object.polygon), holes: [], revision: 0 });
  }
  const documentWithStaffDoorBarriers: PlanDocument = staffDoorIds.size
    ? {
        ...document,
        floors: document.floors.map((floor) => ({
          ...floor,
          objects: floor.objects.map((object) =>
            staffDoorIds.has(object.id) ? { ...object, collidable: true } : object,
          ),
        })),
      }
    : document;
  return { document: documentWithStaffDoorBarriers, zones };
}

/** Caller contract for existing schemas: provide explicit staff-only IDs from a trusted authoring adapter. */
export const ROUTE_ROLE_POLICY_INPUTS = {
  existing: ['walkable-zone.type=restricted'],
  missing: ['staff-only zone IDs', 'staff-only door object IDs'],
  clientScope: 'local-runtime-only',
} as const;
