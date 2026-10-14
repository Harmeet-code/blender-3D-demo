import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored banner-stand assembly. One unit is one metre. */
export function BannerStand(props: CatalogObjectProps) {
  return <CatalogObject assetId="banner-stand" {...props} />;
}
export default BannerStand;
