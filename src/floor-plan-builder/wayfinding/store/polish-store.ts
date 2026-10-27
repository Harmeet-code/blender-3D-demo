import { create } from 'zustand';
import { z } from 'zod';

export type Tier = 'high';
export const lightingSchema = z.enum(['day', 'golden', 'evening']);
export type Lighting = z.infer<typeof lightingSchema>;
export const QUALITY = {
  high: { dpr: 1.5, npcs: 20, glow: true, transmission: true, shadow: 2048 },
} as const;
export const FIXED_TIER: Tier = 'high';
export interface SceneMetrics {
  frameMs: number;
  renderMs: number;
  calls: number;
  triangles: number;
  passes: number;
  npcs: number;
  tier: Tier;
}
interface PolishState {
  lighting: Lighting;
  ambient: boolean;
  minimap: boolean;
  notice: string;
  metrics: SceneMetrics | null;
  setLighting: (value: Lighting) => void;
  setAmbient: (value: boolean) => void;
  setMinimap: (value: boolean) => void;
  announce: (notice: string) => void;
  measure: (metrics: SceneMetrics) => void;
}
export const usePolishStore = create<PolishState>()((set) => ({
  lighting: 'day',
  ambient: true,
  minimap: true,
  notice: '',
  metrics: null,
  setLighting: (value) => {
    const result = lightingSchema.safeParse(value);
    if (result.success) {
      set({ lighting: result.data });
    }
  },
  setAmbient: (ambient) => set({ ambient }),
  setMinimap: (minimap) => set({ minimap }),
  announce: (notice) => set({ notice }),
  measure: (metrics) => set({ metrics }),
}));
export const selectTier = (_state: PolishState): Tier => FIXED_TIER;
