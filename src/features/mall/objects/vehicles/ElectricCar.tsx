import { ElectricCar as ElectricCarAssembly, type VehicleProps } from './sharedVehicle.tsx';

/** Full-scale electric saloon with a closed aero nose and a detailed wheelset. */
export function ElectricCar(props: VehicleProps) {
  return <ElectricCarAssembly {...props} />;
}

export default ElectricCar;
