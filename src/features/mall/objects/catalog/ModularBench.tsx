import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored bench assembly. One unit is one metre. */
export function ModularBench(props: CatalogObjectProps) {
  return <CatalogObject assetId="bench" {...props} />;
}
export default ModularBench;
