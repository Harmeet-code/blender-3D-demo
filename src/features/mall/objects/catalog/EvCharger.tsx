import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored ev-charger assembly. One unit is one metre. */
export function EvCharger(props: CatalogObjectProps) {
  return <CatalogObject assetId="ev-charger" {...props} />;
}
export default EvCharger;
