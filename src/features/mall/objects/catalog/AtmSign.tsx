import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored atm-sign assembly. One unit is one metre. */
export function AtmSign(props: CatalogObjectProps) {
  return <CatalogObject assetId="atm-sign" {...props} />;
}
export default AtmSign;
