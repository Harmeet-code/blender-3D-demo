import type { PlanObject } from './types.ts';

export const shippingVariants = ['dock-bay', 'container-yard', 'staging-only'] as const;
export type ShippingVariant = (typeof shippingVariants)[number];

export const shippingProfiles: Record<
  ShippingVariant,
  { label: string; dimensions: [number, number, number] }
> = {
  'dock-bay': { label: 'Dock bay', dimensions: [8, 5, 8] },
  'container-yard': { label: 'Container yard', dimensions: [12, 5.8, 10] },
  'staging-only': { label: 'Staging apron', dimensions: [6, 2.4, 6] },
};

export function applyShippingVariant(
  _object: PlanObject,
  variant: ShippingVariant,
): Partial<PlanObject> {
  const { dimensions } = shippingProfiles[variant];
  return {
    shippingVariant: variant,
    dimensions,
    scale: [1, 1, 1],
    shippingDoorStates:
      variant === 'dock-bay'
        ? Array.from(
            { length: dimensions[0] >= 10 ? Math.max(2, Math.floor(dimensions[0] / 4) - 1) : 1 },
            () => 'closed' as const,
          )
        : [],
  };
}

export const shippingDefaultVariant: ShippingVariant = 'dock-bay';
export const shippingDefaultDoorStates = ['closed'] as const;
