import raw from '@/assets/metadata/booth-sizes.v1.json';
export const SIZED_BOOTH_MODELS = raw;
export function boothModelFor(feet: readonly [number, number]) {
  return SIZED_BOOTH_MODELS.find(
    (model) =>
      Math.abs(model.dimensionsFeet[0]! - feet[0]) < 1e-8 &&
      Math.abs(model.dimensionsFeet[1]! - feet[1]) < 1e-8,
  );
}
