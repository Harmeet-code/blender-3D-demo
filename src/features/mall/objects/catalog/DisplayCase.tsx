import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored display-case assembly. One unit is one metre. */
export function DisplayCase(props: CatalogObjectProps) {
  return <CatalogObject assetId="display-case" {...props} />;
}
export default DisplayCase;
