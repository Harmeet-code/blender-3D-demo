import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored podium assembly. One unit is one metre. */
export function Podium(props: CatalogObjectProps) {
  return <CatalogObject assetId="podium" {...props} />;
}
export default Podium;
