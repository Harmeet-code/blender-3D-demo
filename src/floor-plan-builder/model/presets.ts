import { isBooth, type PlanObject } from './types.ts';

/** Demo BoothEditor.js catalog; renderer is intentionally new. Cardinal gates map to local X/Z. */
export const boothPresets = [
  {
    id: 'flexscape',
    label: 'Flexscape',
    price: 1500,
    boothSize: 'S',
    boothType: 'flex',
    gate: 'back',
    color: '#2ecc71',
    height: 1,
  },
  {
    id: 'ephemera',
    label: 'Ephemera',
    price: 2500,
    boothSize: 'M',
    boothType: 'standard',
    gate: 'front',
    color: '#ffb020',
    height: 1.2,
  },
  {
    id: 'modulex',
    label: 'Modulex',
    price: 4000,
    boothSize: 'L',
    boothType: 'modular',
    gate: 'right',
    color: '#6aa9ff',
    height: 1.5,
  },
  {
    id: 'chroma',
    label: 'Chroma',
    price: 6000,
    boothSize: 'XL',
    boothType: 'premium',
    gate: 'left',
    color: '#9b59b6',
    height: 2,
  },
] as const;
export function withPreset(object: PlanObject, id: string | null): PlanObject {
  const preset = isBooth(object) ? boothPresets.find((item) => item.id === id) : undefined;
  return preset
    ? {
        ...object,
        presetId: preset.id,
        price: preset.price,
        boothSize: preset.boothSize,
        boothType: preset.boothType,
        gate: preset.gate,
        color: preset.color,
        colorMode: 'explicit',
        // New shell-scheme construction retains a minimum usable 2.2 m head height.
        // Legacy recipes retain the original demo height until explicitly upgraded.
        dimensions: [
          object.dimensions[0],
          object.boothDesign ? Math.max(2.2, preset.height) : preset.height,
          object.dimensions[2],
        ],
        managed: true,
      }
    : object;
}
