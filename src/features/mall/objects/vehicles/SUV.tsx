import { SUV as SUVAssembly, type VehicleProps } from './sharedVehicle.tsx';

/** Full-scale procedural SUV with cutout wheel-arch side panels and a glazed cabin. */
export function SUV(props: VehicleProps) {
  return <SUVAssembly {...props} />;
}

export default SUV;
