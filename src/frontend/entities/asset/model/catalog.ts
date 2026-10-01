import rawCatalog from '../../../assets/metadata/catalog.v1.json';
import floorUrl from '../../../assets/models/floor-tile.v1.glb?url';
import wallUrl from '../../../assets/models/wall-panel.v1.glb?url';
import boothUrl from '../../../assets/models/booth-frame.v1.glb?url';
import chairUrl from '../../../assets/models/chair.v1.glb?url';
import tableUrl from '../../../assets/models/table.v1.glb?url';
import { err, ok, type Result } from 'neverthrow';
import { assetCatalogSchema, type AssetMetadata } from './asset-schema.ts';
const catalog = assetCatalogSchema.safeParse(rawCatalog);
const urls: Readonly<Record<string, string>> = {
  'floor-tile@1': floorUrl,
  'wall-panel@1': wallUrl,
  'booth-frame@1': boothUrl,
  'chair@1': chairUrl,
  'table@1': tableUrl,
};
let fault =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('asset-failure')
    : null;
export function clearAssetFault() {
  fault = null;
}
export interface CatalogError {
  code: 'UNKNOWN_ASSET' | 'INVALID_CATALOG';
  message: string;
}
export function resolveAsset(
  id: string,
  version = 1,
): Result<{ metadata: AssetMetadata; url: string }, CatalogError> {
  if (!catalog.success) {
    return err({ code: 'INVALID_CATALOG', message: 'Asset catalog is invalid' });
  }
  const metadata = catalog.data.find((asset) => asset.id === id && asset.version === version);
  const url = urls[`${id}@${version}`];
  const faultUrl =
    id === 'chair' && fault === 'http'
      ? `${import.meta.env.BASE_URL}missing-chair.glb`
      : id === 'chair' && fault === 'decode'
        ? 'data:application/octet-stream;base64,YmFkLWdsYg=='
        : url;
  return metadata && faultUrl
    ? ok({ metadata, url: faultUrl })
    : err({ code: 'UNKNOWN_ASSET', message: `${id} version ${version} is unavailable` });
}
export function getAssetCatalog(): readonly AssetMetadata[] {
  return catalog.success ? catalog.data : [];
}
