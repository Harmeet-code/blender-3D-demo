import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored forklift assembly. One unit is one metre. */
export function Forklift(props: CatalogObjectProps) {
  return <CatalogObject assetId="forklift" {...props} />;
}
export default Forklift;
