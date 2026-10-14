import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored shell-canopy assembly. One unit is one metre. */
export function ShellCanopy(props: CatalogObjectProps) {
  return <CatalogObject assetId="shell-canopy" {...props} />;
}
export default ShellCanopy;
