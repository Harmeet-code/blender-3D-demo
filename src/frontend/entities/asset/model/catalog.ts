import rawCatalog from '../../../assets/metadata/catalog.v1.json';
import ceilingUrl from '../../../assets/models/booth-ceiling.v1.glb?url';
import assetUrl0 from '../../../assets/models/floor-tile.v1.glb?url';
import assetUrl1 from '../../../assets/models/wall-panel.v1.glb?url';
import assetUrl2 from '../../../assets/models/booth-frame.v1.glb?url';
import assetUrl3 from '../../../assets/models/chair.v1.glb?url';
import assetUrl4 from '../../../assets/models/table.v1.glb?url';
import assetUrl5 from '../../../assets/models/display-case.v1.glb?url';
import assetUrl6 from '../../../assets/models/safe.v1.glb?url';
import assetUrl7 from '../../../assets/models/pallet.v1.glb?url';
import assetUrl8 from '../../../assets/models/banner-stand.v1.glb?url';
import assetUrl9 from '../../../assets/models/forklift.v1.glb?url';
import assetUrl10 from '../../../assets/models/elevator-entrance.v1.glb?url';
import assetUrl11 from '../../../assets/models/stairs.v1.glb?url';
import assetUrl12 from '../../../assets/models/escalator-entrance.v1.glb?url';
import assetUrl13 from '../../../assets/models/display-case.v1.opaque.glb?url';
import assetUrl14 from '../../../assets/models/forklift.v1.low.glb?url';
import assetUrl15 from '../../../assets/models/elevator-entrance.v1.low.glb?url';
import assetUrl16 from '../../../assets/models/stairs.v1.low.glb?url';
import assetUrl17 from '../../../assets/models/escalator-entrance.v1.low.glb?url';
import { err, ok, type Result } from 'neverthrow';
import { assetCatalogSchema, type AssetMetadata } from './asset-schema.ts';
const catalog = assetCatalogSchema.safeParse(rawCatalog);
const urls: Readonly<Record<string, string>> = {
  'booth-ceiling@1:baseline': ceilingUrl,
  'floor-tile@1:baseline': assetUrl0,
  'wall-panel@1:baseline': assetUrl1,
  'booth-frame@1:baseline': assetUrl2,
  'chair@1:baseline': assetUrl3,
  'table@1:baseline': assetUrl4,
  'display-case@1:baseline': assetUrl5,
  'safe@1:baseline': assetUrl6,
  'pallet@1:baseline': assetUrl7,
  'banner-stand@1:baseline': assetUrl8,
  'forklift@1:baseline': assetUrl9,
  'elevator-entrance@1:baseline': assetUrl10,
  'stairs@1:baseline': assetUrl11,
  'escalator-entrance@1:baseline': assetUrl12,
  'display-case@1:opaque': assetUrl13,
  'forklift@1:low': assetUrl14,
  'elevator-entrance@1:low': assetUrl15,
  'stairs@1:low': assetUrl16,
  'escalator-entrance@1:low': assetUrl17,
};
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
  const metadata = catalog.data.find((asset) => asset.id === id && asset.version === version);
  const quality: AssetQuality =
    lowQuality && metadata?.variants?.opaque
      ? 'opaque'
      : lowQuality && metadata?.variants?.low
        ? 'low'
        : 'baseline';
  const url = urls[`${id}@${version}:${quality}`];
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
  return catalog.success ? catalog.data : [];
}
