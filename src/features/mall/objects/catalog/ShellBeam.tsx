import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored shell-beam assembly. One unit is one metre. */
export function ShellBeam(props: CatalogObjectProps) {
  return <CatalogObject assetId="shell-beam" {...props} />;
}
export default ShellBeam;
