import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored pallet assembly. One unit is one metre. */
export function Pallet(props: CatalogObjectProps) {
  return <CatalogObject assetId="pallet" {...props} />;
}
export default Pallet;
