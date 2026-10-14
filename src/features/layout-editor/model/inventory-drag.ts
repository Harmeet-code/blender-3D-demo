export const INVENTORY_DRAG_TYPE = 'application/x-venue-inventory';
export type InventoryDrag =
  | { kind: 'booth'; feet: [number, number] }
  | {
      kind: 'asset';
      choice: { assetId?: string; url?: string; dimensions: [number, number, number] };
    };
