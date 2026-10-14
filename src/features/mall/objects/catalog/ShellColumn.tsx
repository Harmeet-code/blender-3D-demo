import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored shell-column assembly. One unit is one metre. */
export function ShellColumn(props: CatalogObjectProps) {
  return <CatalogObject assetId="shell-column" {...props} />;
}
export default ShellColumn;
