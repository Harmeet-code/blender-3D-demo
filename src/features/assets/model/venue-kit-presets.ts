import type { AssetId } from './asset-schema.ts';

/**
 * Venue kit pick-lists: pure data for starter-draft composition.
 * Three-free and server-importable. Each kit lists catalog asset IDs with
 * requested counts; an admin UI can render these as quantity controls,
 * then place/stack instances through the existing layout-editor + catalog
 * contracts. No geometry or store logic lives here.
 */
export interface KitItem {
  assetId: AssetId;
  count: number;
  note?: string;
}
export interface VenueKit {
  id: string;
  label: string;
  description: string;
  items: KitItem[];
}

const booth = (assetId: AssetId, count: number, note?: string): KitItem => ({
  assetId,
  count,
  note,
});

export const VENUE_KITS: readonly VenueKit[] = [
  {
    id: 'convention-base',
    label: 'Convention base',
    description: 'Existing 2-floor expo map plus V2 service furniture and signage.',
    items: [
      booth('booth-10x10', 8),
      booth('booth-20x20', 2),
      booth('wall-panel', 24),
      booth('floor-tile', 12),
      booth('info-desk', 2),
      booth('podium', 1),
      booth('queue-rail', 6),
      booth('bench', 4),
      booth('trash-bin', 6),
      booth('banner-stand', 6),
      booth('display-case', 2),
      booth('chair', 12),
      booth('table', 6),
      booth('door-single', 2),
      booth('door-double', 2),
      booth('exit-sign', 4),
      booth('washroom-sign', 2),
      booth('food-kiosk', 1),
      booth('elevator-entrance', 1, 'step-free portal; entries required on both floors'),
      booth('stairs', 1),
    ],
  },
  {
    id: 'mall',
    label: 'Mall galleria',
    description: 'Atrium shell, shopfront glass, food court markers, parking and roads.',
    items: [
      booth('shell-slab', 4),
      booth('shell-column', 8),
      booth('shell-beam', 4),
      booth('shell-facade-panel', 8),
      booth('shell-curtain-wall', 8),
      booth('shell-roof-flat', 1),
      booth('shell-canopy', 2, 'entrance; passage stays open underneath'),
      booth('door-double', 4),
      booth('food-kiosk', 4),
      booth('info-desk', 2),
      booth('atm-sign', 2),
      booth('exit-sign', 6),
      booth('washroom-sign', 4),
      booth('planter', 8),
      booth('bench', 8),
      booth('trash-bin', 8),
      booth('queue-rail', 4),
      booth('parking-bay', 12),
      booth('parking-accessible', 2),
      booth('road-segment', 2),
      booth('crosswalk', 2),
      booth('ev-charger', 2),
    ],
  },
  {
    id: 'hospital',
    label: 'Hospital block',
    description:
      'General two-floor starter shell with visual ramps; clinical rooms and equipment still need authoring.',
    items: [
      booth('shell-slab', 4),
      booth('shell-column', 8),
      booth('shell-beam', 2),
      booth('shell-facade-panel', 8),
      booth('shell-curtain-wall', 4),
      booth('shell-roof-flat', 1),
      booth('shell-canopy', 2, 'drop-off + ambulance bay cover'),
      booth('door-double', 6, 'wide doorway visual; validate bed and wheelchair routes'),
      booth('door-single', 4),
      booth('ramp', 2, 'visual only; slope traversal not implemented'),
      booth('info-desk', 3, 'registration + triage markers'),
      booth('queue-rail', 8),
      booth('bench', 8),
      booth('trash-bin', 8),
      booth('washroom-sign', 6),
      booth('exit-sign', 6),
      booth('podium', 1),
      booth('parking-accessible', 4),
      booth('parking-bay', 8),
      booth('road-segment', 2),
      booth('crosswalk', 2),
      booth('elevator-entrance', 2, 'bed-lift markers; entries required on both floors'),
    ],
  },
  {
    id: 'sports',
    label: 'Sports complex',
    description:
      'General multi-use hall shell with crowd rails and parking; sport-specific courts and seating are not included.',
    items: [
      booth('shell-slab', 6),
      booth('shell-column', 12),
      booth('shell-beam', 6),
      booth('shell-roof-flat', 2),
      booth('shell-canopy', 2),
      booth('door-double', 6),
      booth('queue-rail', 12),
      booth('podium', 1, 'podium-123 marker'),
      booth('bench', 10),
      booth('trash-bin', 10),
      booth('info-desk', 2),
      booth('exit-sign', 8),
      booth('washroom-sign', 4),
      booth('food-kiosk', 2),
      booth('planter', 4),
      booth('parking-bay', 16),
      booth('parking-accessible', 2),
      booth('road-segment', 4),
      booth('crosswalk', 4),
    ],
  },
  {
    id: 'airport',
    label: 'Airport terminal',
    description: 'Concourse shell, check-in queue rails, signage spine, kerb roads.',
    items: [
      booth('shell-slab', 4),
      booth('shell-column', 8),
      booth('shell-curtain-wall', 8),
      booth('shell-roof-flat', 1),
      booth('shell-canopy', 2, 'kerb cover'),
      booth('door-double', 4),
      booth('queue-rail', 12),
      booth('info-desk', 4, 'check-in + help markers'),
      booth('food-kiosk', 2),
      booth('atm-sign', 2),
      booth('exit-sign', 6),
      booth('washroom-sign', 4),
      booth('bench', 8),
      booth('trash-bin', 8),
      booth('road-segment', 3),
      booth('crosswalk', 3),
      booth('parking-bay', 8),
      booth('parking-accessible', 2),
      booth('ev-charger', 2),
    ],
  },
  {
    id: 'office',
    label: 'Office tower',
    description: 'Facade shell, reception desk, meeting markers, cycle + car parking.',
    items: [
      booth('shell-slab', 2),
      booth('shell-column', 4),
      booth('shell-facade-panel', 8),
      booth('shell-curtain-wall', 8),
      booth('shell-canopy', 1),
      booth('wall-panel', 16),
      booth('floor-tile', 12),
      booth('door-single', 6),
      booth('door-double', 2),
      booth('info-desk', 1, 'reception marker'),
      booth('podium', 1),
      booth('planter', 6),
      booth('bench', 4),
      booth('trash-bin', 4),
      booth('table', 6),
      booth('chair', 12),
      booth('exit-sign', 4),
      booth('washroom-sign', 2),
      booth('parking-bay', 8),
      booth('parking-accessible', 1),
      booth('ev-charger', 2),
    ],
  },
];

export const VENUE_KIT_IDS: readonly string[] = VENUE_KITS.map((kit) => kit.id);
