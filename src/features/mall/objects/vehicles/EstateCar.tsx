import { EstateCar as EstateAssembly, type VehicleProps } from './sharedVehicle.tsx';

/** Full-scale estate/wagon body with an extended roof and rear quarter glass. */
export function EstateCar(props: VehicleProps) {
  return <EstateAssembly {...props} />;
}

export default EstateCar;
