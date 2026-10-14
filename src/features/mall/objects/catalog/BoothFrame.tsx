import { CatalogObject, type CatalogObjectProps } from './CatalogObject.tsx';

/** Code-authored booth-frame assembly. One unit is one metre. */
export function BoothFrame(props: CatalogObjectProps) {
  return <CatalogObject assetId="booth-frame" {...props} />;
}
export default BoothFrame;
