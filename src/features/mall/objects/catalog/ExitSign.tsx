import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored exit-sign assembly. One unit is one metre. */
export function ExitSign(props: CatalogObjectProps) {
  return <CatalogObject assetId="exit-sign" {...props} />;
}
export default ExitSign;
