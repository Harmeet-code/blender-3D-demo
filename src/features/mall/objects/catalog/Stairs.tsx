import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored stairs assembly. One unit is one metre. */
export function Stairs(props: CatalogObjectProps) {
  return <CatalogObject assetId="stairs" {...props} />;
}
export default Stairs;
