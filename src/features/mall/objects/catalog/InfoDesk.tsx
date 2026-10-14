import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored info-desk assembly. One unit is one metre. */
export function InfoDesk(props: CatalogObjectProps) {
  return <CatalogObject assetId="info-desk" {...props} />;
}
export default InfoDesk;
