import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored trash-bin assembly. One unit is one metre. */
export function TrashBin(props: CatalogObjectProps) {
  return <CatalogObject assetId="trash-bin" {...props} />;
}
export default TrashBin;
