import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored crosswalk assembly. One unit is one metre. */
export function Crosswalk(props: CatalogObjectProps) {
  return <CatalogObject assetId="crosswalk" {...props} />;
}
export default Crosswalk;
