import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored door-double assembly. One unit is one metre. */
export function DoorDouble(props: CatalogObjectProps) {
  return <CatalogObject assetId="door-double" {...props} />;
}
export default DoorDouble;
