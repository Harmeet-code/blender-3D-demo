import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored booth-10x10 assembly. One unit is one metre. */
export function Booth10x10(props: CatalogObjectProps) {
  return <CatalogObject assetId="booth-10x10" {...props} />;
}
export default Booth10x10;
