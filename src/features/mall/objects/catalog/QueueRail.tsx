import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored queue-rail assembly. One unit is one metre. */
export function QueueRail(props: CatalogObjectProps) {
  return <CatalogObject assetId="queue-rail" {...props} />;
}
export default QueueRail;
