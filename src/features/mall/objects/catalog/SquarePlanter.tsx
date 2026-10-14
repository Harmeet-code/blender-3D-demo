import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored planter assembly. One unit is one metre. */
export function SquarePlanter(props: CatalogObjectProps) {
  return <CatalogObject assetId="planter" {...props} />;
}
export default SquarePlanter;
