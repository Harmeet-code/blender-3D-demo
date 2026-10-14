/** Display transform for dollhouse stacking. Saved layout heights stay canonical. */
export function floorDisplayOffset(
  heightOffset: number,
  index: number,
  dollhouse: boolean,
  gap = 8,
): number {
  return heightOffset + (dollhouse ? index * gap : 0);
}
