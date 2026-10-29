import type { PlanObject } from './types.ts';

export const showOfficeVariants = ['cabin', 'room', 'pop-up'] as const;
export type ShowOfficeVariant = (typeof showOfficeVariants)[number];

export const showOfficeProfiles: Record<ShowOfficeVariant, {
  label: string;
  dimensions: [number, number, number];
  floorHeight: number;
}> = {
  cabin: { label: 'Show Office Cabin', dimensions: [6.4, 3.6, 4.2], floorHeight: 0.45 },
  room: { label: 'Show Office Room', dimensions: [6, 3, 3], floorHeight: 0 },
  'pop-up': { label: 'Pop-up Show Office', dimensions: [4, 2.6, 3], floorHeight: 0 },
};

export const showOfficeDefaultVariant: ShowOfficeVariant = 'cabin';

export function showOfficeDefaults(variant: ShowOfficeVariant = showOfficeDefaultVariant) {
  return {
    showOfficeVariant: variant,
    officeStatus: 'open' as const,
    officeWindowOpen: false,
    officeDoorOpen: false,
    officeBlindsOpen: true,
    officeCutaway: 0,
    officeInteriorDetail: false,
    officeHasFreightDesk: false,
    officeStaff: 2,
    officeVisitors: 3,
    officeBays: 2,
  };
}

export function showOfficeSpatialLayout(object: PlanObject) {
  const variant = object.showOfficeVariant ?? showOfficeDefaultVariant;
  const profile = showOfficeProfiles[variant];
  // Canonical local Z origin is the public facade; the editor polygon remains center anchored.
  const rampRun = variant === 'cabin' ? 5.4 : 0;
  const landingDepth = variant === 'cabin' ? 1.5 : 0;
  const deckDepth = variant === 'cabin' ? 1.2 : 0;
  const frontExtent = rampRun + landingDepth + deckDepth;
  const depth = object.dimensions[2];
  return {
    variant,
    profile,
    rampRun,
    landingDepth,
    deckDepth,
    frontExtent,
    footprints: {
      shell: [[-object.dimensions[0] / 2, 0], [object.dimensions[0] / 2, 0], [object.dimensions[0] / 2, depth], [-object.dimensions[0] / 2, depth]] as [number, number][],
      ramp: variant === 'cabin' ? [[-0.6, -(deckDepth + rampRun)], [0.6, -(deckDepth + rampRun)], [0.6, -deckDepth], [-0.6, -deckDepth]] as [number, number][] : [],
      landing: variant === 'cabin' ? [[-0.75, -frontExtent], [0.75, -frontExtent], [0.75, -(deckDepth + rampRun)], [-0.75, -(deckDepth + rampRun)]] as [number, number][] : [],
    },
    targets: {
      queue: [0, -3.5] as [number, number],
      service: [-1, -0.5] as [number, number],
      accessibleService: [1.8, -0.5] as [number, number],
      staffEntrance: [-2.8, depth + 0.4] as [number, number],
    },
    nav: {
      publicQueue: [[-object.dimensions[0] / 2, -4.2], [object.dimensions[0] / 2, -4.2], [object.dimensions[0] / 2, -1.2], [-object.dimensions[0] / 2, -1.2]] as [number, number][],
      staffRestricted: [[-object.dimensions[0] / 2, 0.5], [object.dimensions[0] / 2, 0.5], [object.dimensions[0] / 2, depth], [-object.dimensions[0] / 2, depth]] as [number, number][],
      rampPath: variant === 'cabin' ? [[-0.6, -(deckDepth + rampRun)], [0.6, -(deckDepth + rampRun)], [0.6, -deckDepth], [-0.6, -deckDepth]] as [number, number][] : [],
    },
  };
}
