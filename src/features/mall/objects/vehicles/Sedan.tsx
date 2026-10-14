import { Sedan as SedanAssembly, type VehicleProps } from './sharedVehicle.tsx';

/** Full-scale procedural four-door sedan. Forward points along local -Y. */
export function Sedan(props: VehicleProps) {
  return <SedanAssembly {...props} />;
}

export default Sedan;
