import type { AssetId } from './asset-schema.ts';

export type AddOnVisual =
  | { kind: 'room-prop'; assetId: AssetId }
  | { kind: 'logistics'; assetId: AssetId }
  | { kind: 'branding'; assetId: 'banner-stand' }
  | { kind: 'nonvisual' };

export const ADD_ON_VISUALS: Readonly<Record<string, AddOnVisual>> = {
  chair: { kind: 'room-prop', assetId: 'chair' },
  table: { kind: 'room-prop', assetId: 'table' },
  'display-case': { kind: 'room-prop', assetId: 'display-case' },
  'safe-service': { kind: 'room-prop', assetId: 'safe' },
  'forklift-service': { kind: 'logistics', assetId: 'forklift' },
  'pallet-service': { kind: 'logistics', assetId: 'pallet' },
  'logo-banner': { kind: 'branding', assetId: 'banner-stand' },
  'early-setup': { kind: 'nonvisual' },
  'early-delivery': { kind: 'nonvisual' },
  'exhibitor-parking': { kind: 'nonvisual' },
  'visa-letter': { kind: 'nonvisual' },
};
