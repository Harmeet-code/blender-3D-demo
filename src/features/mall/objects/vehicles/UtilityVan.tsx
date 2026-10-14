import { UtilityVan as UtilityVanAssembly, type VehicleProps } from './sharedVehicle.tsx';

/** Full-scale utility van with solid cargo flanks and a separate glazed cab. */
export function UtilityVan(props: VehicleProps) {
  return <UtilityVanAssembly {...props} />;
}

export default UtilityVan;
