import { decodeLayout } from '../../../model/adapter.ts';
import type { PlanDocument } from '../../../model/types.ts';
import { buildingLayoutSchema } from '../../../../features/building/model/building-schema.ts';
import type { RoleAreaPolicy } from '../../../wayfinding/walkthrough/collision/capsule-clearance.ts';
import type { Role } from '../../../wayfinding/walkthrough/contracts.ts';
import type { WalkableZone } from '../../../wayfinding/model/zone-schema.ts';

/**
 * A development fixture made exclusively from fields in BuildingLayout v2.
 * Its geometry is illustrative test-scene data, not a measured real venue.
 */
export const MOTION_LAB_LAYOUT = buildingLayoutSchema.parse({
  schemaVersion: 2,
  buildingId: 'motion-lab-b3-schema-fixture',
  floors: [
    {
      id: 'motion-lab-ground',
      name: 'Ground floor',
      heightOffset: 0,
      image: '',
      coordinateSystem: { units: 'meters' },
      authoring: {
        boundary: [[-10, -6], [10, -6], [10, 6], [-10, 6]],
        obstacles: [],
        spawn: [-8, 0],
        walls: [
          {
            id: 'ground-partition-with-opening',
            start: [0, -5],
            end: [0, 5],
            thickness: 0.18,
            height: 2.4,
            openings: [{ id: 'ground-door-opening', offset: 5, width: 1.5, height: 2.05 }],
          },
        ],
        zones: [{ id: 'ground-walkable-hall', label: 'Walkable hall', type: 'walkable', polygon: [[-9.5, -5.5], [9.5, -5.5], [9.5, 5.5], [-9.5, 5.5]] }],
        pois: [],
        instances: [],
      },
    },
    {
      id: 'motion-lab-mezzanine',
      name: 'Mezzanine',
      heightOffset: 4.4,
      image: '',
      coordinateSystem: { units: 'meters' },
      authoring: {
        boundary: [[-10, -6], [10, -6], [10, 6], [-10, 6]],
        obstacles: [],
        spawn: [-8, 0],
        walls: [
          {
            id: 'mezzanine-partition-with-opening',
            start: [0, -5],
            end: [0, 5],
            thickness: 0.18,
            height: 2.4,
            openings: [{ id: 'mezzanine-door-opening', offset: 5, width: 1.5, height: 2.05 }],
          },
        ],
        zones: [{ id: 'mezzanine-walkable-hall', label: 'Walkable hall', type: 'walkable', polygon: [[-9.5, -5.5], [9.5, -5.5], [9.5, 5.5], [-9.5, 5.5]] }],
        pois: [],
        instances: [],
      },
    },
  ],
  rooms: [
    { id: 'ground-booth-west', floorId: 'motion-lab-ground', label: 'West booth', polygon: [[-8, -5], [-5, -5], [-5, -2.5], [-8, -2.5]], type: 'booth' },
    { id: 'ground-booth-east', floorId: 'motion-lab-ground', label: 'East booth', polygon: [[5, -5], [8, -5], [8, -2.5], [5, -2.5]], type: 'booth' },
    { id: 'mezzanine-booth-west', floorId: 'motion-lab-mezzanine', label: 'Mezzanine west booth', polygon: [[-8, -5], [-5, -5], [-5, -2.5], [-8, -2.5]], type: 'booth' },
    { id: 'mezzanine-booth-east', floorId: 'motion-lab-mezzanine', label: 'Mezzanine east booth', polygon: [[5, -5], [8, -5], [8, -2.5], [5, -2.5]], type: 'booth' },
  ],
  portals: [
    { id: 'fixture-stairs', type: 'stairs', connects: ['motion-lab-ground', 'motion-lab-mezzanine'], entries: [{ floorId: 'motion-lab-ground', position: [-7, 4], yawRadians: 0 }, { floorId: 'motion-lab-mezzanine', position: [-7, 4], yawRadians: 0 }] },
    { id: 'fixture-escalator', type: 'escalator', connects: ['motion-lab-ground', 'motion-lab-mezzanine'], entries: [{ floorId: 'motion-lab-ground', position: [0, 4], yawRadians: 0 }, { floorId: 'motion-lab-mezzanine', position: [0, 4], yawRadians: 0 }] },
    { id: 'fixture-elevator', type: 'elevator', connects: ['motion-lab-ground', 'motion-lab-mezzanine'], entries: [{ floorId: 'motion-lab-ground', position: [7, 4], yawRadians: 0 }, { floorId: 'motion-lab-mezzanine', position: [7, 4], yawRadians: 0 }] },
  ],
});

export const MOTION_LAB_FLOORS = MOTION_LAB_LAYOUT.floors.map(({ id, name }) => ({ id, label: name }));
export const MOTION_LAB_CONNECTOR_STATUS = [
  { kind: 'stairs', status: 'portal schema present; physical trajectory and landing collider absent' },
  { kind: 'escalator', status: 'portal schema present; physical trajectory and landing collider absent' },
  { kind: 'elevator', status: 'portal schema present; shaft, cabin, doors, and passenger trajectory absent' },
  { kind: 'ramp', status: 'unsupported: BuildingLayout Portal.type has no ramp value' },
] as const;

export const MOTION_LAB_ROLE_AREAS: RoleAreaPolicy[] = [
  { id: 'staff-service-zone-lab-policy', polygon: [[5, 2], [9, 2], [9, 5], [5, 5]], allowedRoles: ['staff'] },
];

export type MotionLabStop = { id: string; label: string; floorId: string; point: [number, number] };
export const MOTION_LAB_STOPS: MotionLabStop[] = MOTION_LAB_FLOORS.flatMap((floor) => [
  { id: `${floor.id}-west-entry`, label: `${floor.label} west entry`, floorId: floor.id, point: [-8, 0] },
  { id: `${floor.id}-east-exit`, label: `${floor.label} east exit`, floorId: floor.id, point: [8, 0] },
  { id: `${floor.id}-staff-service`, label: `${floor.label} staff service`, floorId: floor.id, point: [7, 3.5] },
]);

export function createMotionLabDocument(): PlanDocument {
  return decodeLayout(MOTION_LAB_LAYOUT);
}

export function createMotionLabZones(document: PlanDocument): WalkableZone[] {
  return document.floors.flatMap((floor) => {
    const floorId = floor.source.id;
    const authoredWalkable = (floor.source.authoring?.zones ?? []).filter((zone) => zone.type === 'walkable');
    return [
      ...authoredWalkable.map((zone) => ({ id: zone.id, floorId, name: zone.label, type: 'general' as const, polygon: zone.polygon, holes: [], revision: 0 })),
      { id: `${floorId}-staff-service-route-policy`, floorId, name: 'Staff service zone (lab-local policy)', type: 'restricted' as const, polygon: [[5, 2], [9, 2], [9, 5], [5, 5]], holes: [], revision: 0 },
    ];
  });
}

export function routeAllowsRestricted(role: Role) {
  return role === 'staff';
}
