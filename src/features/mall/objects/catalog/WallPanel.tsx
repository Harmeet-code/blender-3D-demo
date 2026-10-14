import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored wall-panel assembly. One unit is one metre. */
export function WallPanel(props: CatalogObjectProps) {
  return <CatalogObject assetId="wall-panel" {...props} />;
}
export default WallPanel;
