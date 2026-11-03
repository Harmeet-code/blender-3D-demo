import type { BoothMeta, Role } from '../contracts.ts';

/** Approved public booth metadata. Missing source fields stay absent. */
export interface BoothMetaView {
  company?: BoothMeta['fields'][string];
  category?: BoothMeta['fields'][string];
  boothName?: BoothMeta['fields'][string];
  boothNumber?: BoothMeta['fields'][string];
  publicDescription?: BoothMeta['fields'][string];
  contactDetails?: BoothMeta['fields'][string];
  internalNotes?: BoothMeta['fields'][string];
}

const VISITOR_FIELDS = [
  'company',
  'category',
  'boothName',
  'boothNumber',
  'publicDescription',
] as const satisfies readonly (keyof BoothMetaView)[];

const STAFF_FIELDS = ['contactDetails', 'internalNotes'] as const satisfies readonly (keyof BoothMetaView)[];

/**
 * Return only approved booth metadata for the requested local role.
 * This is a presentation projection, not authentication or a security boundary;
 * callers must not treat client-side filtering as protection for delivered data.
 * Unknown fields, fieldVisibility, and absent source values are omitted.
 */
export function projectBoothMetaView(booth: BoothMeta, role: Role): BoothMetaView {
  const allowed: readonly (keyof BoothMetaView)[] = role === 'visitor'
    ? VISITOR_FIELDS
    : [...VISITOR_FIELDS, ...STAFF_FIELDS];
  const view: BoothMetaView = {};
  for (const key of allowed) {
    if (Object.hasOwn(booth.fields, key)) {
      view[key] = booth.fields[key];
    }
  }
  return view;
}
