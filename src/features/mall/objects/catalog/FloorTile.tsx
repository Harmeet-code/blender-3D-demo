import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored floor-tile assembly. One unit is one metre. */
export function FloorTile(props: CatalogObjectProps) {
  return <CatalogObject assetId="floor-tile" {...props} />;
}
export default FloorTile;
