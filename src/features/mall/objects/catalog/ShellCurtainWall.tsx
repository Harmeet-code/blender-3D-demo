import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored shell-curtain-wall assembly. One unit is one metre. */
export function ShellCurtainWall(props: CatalogObjectProps) {
  return <CatalogObject assetId="shell-curtain-wall" {...props} />;
}
export default ShellCurtainWall;
