import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored parking-bay assembly. One unit is one metre. */
export function ParkingBay(props: CatalogObjectProps) {
  return <CatalogObject assetId="parking-bay" {...props} />;
}
export default ParkingBay;
