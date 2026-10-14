import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored table assembly. One unit is one metre. */
export function ExhibitionTable(props: CatalogObjectProps) {
  return <CatalogObject assetId="table" {...props} />;
}
export default ExhibitionTable;
