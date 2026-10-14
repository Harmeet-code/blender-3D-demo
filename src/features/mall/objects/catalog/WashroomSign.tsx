import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored washroom-sign assembly. One unit is one metre. */
export function WashroomSign(props: CatalogObjectProps) {
  return <CatalogObject assetId="washroom-sign" {...props} />;
}
export default WashroomSign;
