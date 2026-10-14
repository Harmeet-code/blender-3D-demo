import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored elevator-entrance assembly. One unit is one metre. */
export function CatalogElevatorEntrance(props: CatalogObjectProps) {
  return <CatalogObject assetId="elevator-entrance" {...props} />;
}
export default CatalogElevatorEntrance;
