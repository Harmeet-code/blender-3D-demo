import type { BatchPlacement } from '../components/AssetBatch.tsx';

/** Independent instance bounds are culled by each render pass, including shadows. */
export function partitionPlacements(placements: readonly BatchPlacement[], cellSize = 32) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error('Invalid cell size');
  }
  const cells = new Map<string, BatchPlacement[]>();
  for (const placement of placements) {
    const key = `${Math.floor(placement.position[0] / cellSize)}:${Math.floor(placement.position[2] / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(placement);
    cells.set(key, cell);
  }
  return cells;
}
