import rawCatalog from '@/assets/metadata/catalog.v1.json';
import { err, ok, type Result } from 'neverthrow';
import { assetCatalogSchema, type AssetMetadata } from '@/features/assets/model/asset-schema.ts';
import { proceduralBoothMetadata } from './procedural-booth-metadata.ts';
import { expansionAssetMetadata } from './expansion-metadata.ts';
const catalog = assetCatalogSchema.safeParse(rawCatalog);
const entries = catalog.success
  ? [...catalog.data, ...proceduralBoothMetadata, ...expansionAssetMetadata]
  : [];
export type AssetQuality = 'baseline' | 'low' | 'opaque';
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
  lowQuality = false,
): Result<
  {
    metadata: AssetMetadata;
    url: string;
    quality: AssetQuality;
  },
  CatalogError
> {
  if (!catalog.success) {
    return err({ code: 'INVALID_CATALOG', message: 'Asset catalog is invalid' });
  }
  const metadata = entries.find((asset) => asset.id === id && asset.version === version);
  const quality: AssetQuality =
    lowQuality && metadata?.variants?.opaque
      ? 'opaque'
      : lowQuality && metadata?.variants?.low
        ? 'low'
        : 'baseline';
  const url = metadata ? `procedural:${id}@${version}:${quality}` : undefined;
  const faultUrl =
    id === 'chair' && fault === 'http'
      ? `${import.meta.env.BASE_URL}__asset_failure__/http.glb`
      : id === 'chair' && fault === 'decode'
        ? 'data:application/octet-stream;base64,YmFkLWdsYg=='
        : url;
  return metadata && faultUrl
    ? ok({ metadata, url: faultUrl, quality })
    : err({ code: 'UNKNOWN_ASSET', message: `${id} version ${version} is unavailable` });
}
export function getAssetCatalog(): readonly AssetMetadata[] {
  return entries;
}
