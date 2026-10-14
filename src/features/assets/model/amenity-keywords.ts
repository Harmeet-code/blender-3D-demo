/**
 * Amenity search keywords + asset-to-amenity links. Three-free: safe for
 * server import. Mirrors the canonical amenity enum in
 * `src/features/building/model/building-schema.ts` (`authoredPoiSchema`) and
 * `src/features/navigation/components/AmenityIcon.tsx` (`AMENITIES`) without
 * importing them, so neither navigation nor building code needs to change to
 * consume this module.
 *
 * Integration (for Codex, not done here): build the destination haystack with
 * `destinationHaystack()` and match with `matchesAmenity()` at the four
 * existing exact-match filter sites (RoomSearch, RoutePlanner
 * DestinationPicker, CommandPalette places, route-planner `nearest()`).
 */
export const AMENITY_VALUES = [
  'exit',
  'washroom',
  'elevator',
  'food',
  'coffee',
  'information',
  'atm',
] as const;
export type Amenity = (typeof AMENITY_VALUES)[number];

export const AMENITY_KEYWORDS: Record<Amenity, readonly string[]> = {
  exit: ['exit', 'emergency exit', 'fire exit', 'egress', 'emergency', 'way out'],
  washroom: [
    'washroom',
    'toilet',
    'restroom',
    'wc',
    'bathroom',
    'powder room',
    'accessible washroom',
  ],
  elevator: ['elevator', 'lift', 'step-free', 'step free', 'accessible route'],
  food: [
    'food',
    'restaurant',
    'cafe',
    'caf\u00e9',
    'kiosk',
    'food kiosk',
    'canteen',
    'snack',
    'dining',
    'food court',
  ],
  coffee: ['coffee', 'coffee shop', 'espresso', 'latte', 'tea'],
  information: [
    'information',
    'info',
    'help',
    'help desk',
    'reception',
    'information desk',
    'directory',
    'enquiries',
  ],
  atm: ['atm', 'cash', 'money', 'cash machine', 'bank'],
};

/** V2 placeable assets that act as physical amenity markers. */
export const ASSET_AMENITY: Record<string, Amenity> = {
  'washroom-sign': 'washroom',
  'exit-sign': 'exit',
  'atm-sign': 'atm',
  'food-kiosk': 'food',
  'info-desk': 'information',
};

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isAmenity(value: string): value is Amenity {
  return (AMENITY_VALUES as readonly string[]).includes(value);
}

/** True when a raw query contains the amenity itself or one of its aliases. */
export function matchesAmenity(amenity: Amenity, needle: string): boolean {
  const query = normalizeSearchText(needle);
  if (!query) {
    return false;
  }
  return AMENITY_KEYWORDS[amenity].some((keyword) => query.includes(normalizeSearchText(keyword)));
}

export interface AmenitySearchable {
  label?: string;
  category?: string;
  amenity?: string;
}

/**
 * Haystack for substring/fuzzy finders: label + category + amenity + aliases.
 * Shape-preserving (returns a string); existing destination objects pass
 * through unchanged.
 */
export function destinationHaystack(destination: AmenitySearchable): string {
  const parts = [destination.label ?? '', destination.category ?? ''];
  const amenity = destination.amenity ?? destination.category ?? '';
  if (isAmenity(amenity)) {
    parts.push(amenity, ...AMENITY_KEYWORDS[amenity]);
    const assetLinks = Object.entries(ASSET_AMENITY)
      .filter(([, value]) => value === amenity)
      .map(([assetId]) => assetId);
    parts.push(...assetLinks);
  }
  return normalizeSearchText(parts.filter(Boolean).join(' '));
}
