import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored ramp assembly. One unit is one metre. */
export function Ramp(props: CatalogObjectProps) {
  return <CatalogObject assetId="ramp" {...props} />;
}
export default Ramp;
