import { blankDocument } from '../../../model/adapter.ts';
import { createObject } from '../../../model/inventory.ts';
import type { PlanDocument } from '../../../model/types.ts';
import type { RoleAreaPolicy } from '../../../wayfinding/walkthrough/collision/capsule-clearance.ts';
import type { Role } from '../../../wayfinding/walkthrough/contracts.ts';
import type { WalkableZone } from '../../../wayfinding/model/zone-schema.ts';
import { MOTION_LAB_FLOOR_ID } from './diagnostics.ts';

export const MOTION_LAB_ROLE_AREAS: RoleAreaPolicy[] = [
  {
    id: 'staff-service-zone',
    polygon: [[5, 2], [9, 2], [9, 5], [5, 5]],
    allowedRoles: ['staff'],
  },
];

export const MOTION_LAB_STOPS = [
  { id: 'west-entry', label: 'West entry', point: [-8, 0] as [number, number] },
  { id: 'north-entry', label: 'North entry', point: [0, 4] as [number, number] },
  { id: 'east-exit', label: 'East exit', point: [8, 0] as [number, number] },
  { id: 'staff-service', label: 'Staff service zone', point: [7, 3.5] as [number, number] },
];

export function createMotionLabDocument(): PlanDocument {
  const document = blankDocument('floor-plan-motion-lab');
  const floor = document.floors[0]!;
  floor.source.id = MOTION_LAB_FLOOR_ID;
  floor.source.name = 'Motion Lab ground floor';
  floor.source.heightOffset = 0;
  floor.boundary = [[-10, -6], [10, -6], [10, 6], [-10, 6]];
  floor.spawn = [-8, 0];
  const booth = (x: number, z: number) => {
    const object = createObject('booth', [x, z]);
    object.position = [x, z];
    object.boothDesign = { ...object.boothDesign!, roof: 'solid' };
    return object;
  };
  floor.objects = [
    booth(-4, -3),
    booth(0, -3),
    booth(4, -3),
    { ...createObject('bench', [-2, 2]), position: [-2, 2] },
    { ...createObject('planter', [3, 2]), position: [3, 2] },
  ];
  return document;
}

export function createMotionLabZones(floorId: string): WalkableZone[] {
  return [
    {
      id: 'motion-lab-general-area',
      floorId,
      name: 'Motion Lab walkable hall',
      type: 'general',
      polygon: [[-9.5, -5.5], [9.5, -5.5], [9.5, 5.5], [-9.5, 5.5]],
      holes: [],
      revision: 0,
    },
    {
      id: 'staff-service-zone',
      floorId,
      name: 'Staff service zone',
      type: 'restricted',
      polygon: [[5, 2], [9, 2], [9, 5], [5, 5]],
      holes: [],
      revision: 0,
    },
  ];
}

export function routeAllowsRestricted(role: Role) {
  return role === 'staff';
}
