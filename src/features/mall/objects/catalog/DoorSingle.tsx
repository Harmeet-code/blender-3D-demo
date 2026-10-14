import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored door-single assembly. One unit is one metre. */
export function DoorSingle(props: CatalogObjectProps) {
  return <CatalogObject assetId="door-single" {...props} />;
}
export default DoorSingle;
