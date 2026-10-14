import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored food-kiosk assembly. One unit is one metre. */
export function FoodKiosk(props: CatalogObjectProps) {
  return <CatalogObject assetId="food-kiosk" {...props} />;
}
export default FoodKiosk;
