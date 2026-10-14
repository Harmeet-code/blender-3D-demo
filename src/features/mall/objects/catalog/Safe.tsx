import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored safe assembly. One unit is one metre. */
export function Safe(props: CatalogObjectProps) {
  return <CatalogObject assetId="safe" {...props} />;
}
export default Safe;
