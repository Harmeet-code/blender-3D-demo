import type { PlanDocument } from '../../../model/types.ts';
import type { Role } from '../contracts.ts';
import type { WalkableZone } from '../../model/zone-schema.ts';

/**
 * Explicit adapter data for role restrictions not represented in current persisted schemas.
 * Do not derive these IDs from object labels, asset sockets, or free-form tags.
 */
export interface RouteNavigationPolicySource {
  staffOnlyZoneIds?: readonly string[];
  staffOnlyDoorObjectIds?: readonly string[];
}

export const EMPTY_ROUTE_NAVIGATION_POLICY: RouteNavigationPolicySource = Object.freeze({});

export function routeNavigationPolicyKey(policy: RouteNavigationPolicySource): string {
  return JSON.stringify({
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
  if (role !== 'visitor' || (!policy.staffOnlyZoneIds?.length && !policy.staffOnlyDoorObjectIds?.length)) {
    return { document, zones: authoredZones };
  }

  const staffZoneIds = new Set(policy.staffOnlyZoneIds ?? []);
  const staffDoorIds = new Set(policy.staffOnlyDoorObjectIds ?? []);
  const missingZones = [...staffZoneIds].filter((id) => !authoredZones.some((zone) => zone.id === id));
  const doors = [...staffDoorIds].map((id) => {
    const matches = document.floors.flatMap((floor) =>
      floor.objects.filter((object) => object.id === id).map((object) => ({ floor, object })),
    );
    return { id, matches };
  });
  const missingDoors = doors.filter(({ matches }) => matches.length !== 1).map(({ id }) => id);
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
      error: `Visitor navigation policy could not be resolved (${details.join('; ')}).`,
    };
  }

  const zones = authoredZones.map((zone) =>
    staffZoneIds.has(zone.id) ? { ...zone, type: 'restricted' as const } : zone,
  );
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
