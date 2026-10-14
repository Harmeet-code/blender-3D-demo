import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored road-segment assembly. One unit is one metre. */
export function RoadSegment(props: CatalogObjectProps) {
  return <CatalogObject assetId="road-segment" {...props} />;
}
export default RoadSegment;
