import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored parking-accessible assembly. One unit is one metre. */
export function ParkingAccessible(props: CatalogObjectProps) {
  return <CatalogObject assetId="parking-accessible" {...props} />;
}
export default ParkingAccessible;
