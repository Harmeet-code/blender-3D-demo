import type { PlanObject } from './types.ts';

export const statusColors: Record<PlanObject['status'], string> = {
  AVAILABLE: '#2ecc71',
  HOLD: '#ffb020',
  BOOKED: '#ff5c6a',
  UNAVAILABLE: '#596173',
};
export interface StudioView {
  preview: boolean;
  display: 'surface' | 'availability' | 'heat';
  night: boolean;
  orbitLocked: boolean;
  camera: 'iso' | 'top';
  cameraRevision: number;
  touring: boolean;
  resizeAspect: boolean;
  resizeSnap: number;
}
export const initialView: StudioView = {
  preview: false,
  display: 'surface',
  night: false,
  orbitLocked: false,
  camera: 'iso',
  cameraRevision: 0,
  touring: false,
  resizeAspect: false,
  resizeSnap: 0,
};
export const formatPrice = (price: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(price);

/** Same blue/cyan/green/yellow/red ramp as demo/visuals/BoothBuilder.js. */
export function heatColor(value: number): string {
  const t = Math.max(0, Math.min(1, value));
  let rgb: number[];
  if (t < 0.25) {
    rgb = [0, 80 + 140 * (t / 0.25), 255];
  } else if (t < 0.5) {
    rgb = [0, 255, 255 - 195 * ((t - 0.25) / 0.25)];
  } else if (t < 0.75) {
    rgb = [255 * ((t - 0.5) / 0.25), 255, 0];
  } else {
    rgb = [255, 255 - 195 * ((t - 0.75) / 0.25), 0];
  }
  return `#${rgb.map((channel) => Math.floor(channel).toString(16).padStart(2, '0')).join('')}`;
}
