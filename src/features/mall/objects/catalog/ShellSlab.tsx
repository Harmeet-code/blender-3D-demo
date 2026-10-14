import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored shell-slab assembly. One unit is one metre. */
export function ShellSlab(props: CatalogObjectProps) {
  return <CatalogObject assetId="shell-slab" {...props} />;
}
export default ShellSlab;
