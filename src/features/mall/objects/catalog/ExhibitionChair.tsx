import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored chair assembly. One unit is one metre. */
export function ExhibitionChair(props: CatalogObjectProps) {
  return <CatalogObject assetId="chair" {...props} />;
}
export default ExhibitionChair;
