import { PickupTruck as PickupAssembly, type VehicleProps } from './sharedVehicle.tsx';

/** Full-scale pickup with an open, lined cargo bed and raised running boards. */
export function PickupTruck(props: VehicleProps) {
  return <PickupAssembly {...props} />;
}

export default PickupTruck;
