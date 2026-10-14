import { create } from 'zustand';
export type GraphicsMode = 'auto' | 'efficient' | 'balanced' | 'maximum';
export type GraphicsTier = Exclude<GraphicsMode, 'auto'>;
export const GRAPHICS = {
  efficient: { dpr: 0.85, shadowSize: 1024 },
  balanced: { dpr: 1, shadowSize: 1536 },
  maximum: { dpr: 1.5, shadowSize: 2048 },
} as const;
export class QualityGovernor {
  tier: GraphicsTier = 'maximum';
  private samples: number[] = [];
  private elapsed = 0;
  private slow = 0;
  private fast = 0;
  observe(ms: number): GraphicsTier {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 2000) {
      return this.tier;
    }
    this.samples.push(ms);
    this.elapsed += ms;
    if (this.samples.length < 120 && (this.samples.length < 12 || this.elapsed < 2000)) {
      return this.tier;
    }
    const p95 = [...this.samples].sort((a, b) => a - b)[
      Math.floor((this.samples.length - 1) * 0.95)
    ]!;
    this.samples.length = 0;
    this.elapsed = 0;
    this.slow = p95 > 30 ? this.slow + 1 : 0;
    this.fast = p95 < 17 ? this.fast + 1 : 0;
    const tiers: GraphicsTier[] = ['efficient', 'balanced', 'maximum'];
    const index = tiers.indexOf(this.tier);
    if (this.slow >= 2 && index > 0) {
      this.tier = tiers[index - 1]!;
    } else if (this.fast >= 8 && index < 2) {
      this.tier = tiers[index + 1]!;
    } else {
      return this.tier;
    }
    this.slow = this.fast = 0;
    return this.tier;
  }
}
export const useGraphicsQuality = create<{
  mode: GraphicsMode;
  tier: GraphicsTier;
  setMode: (mode: GraphicsMode) => void;
}>((set) => ({
  mode: 'auto',
  tier: 'maximum',
  setMode: (mode) => set({ mode, ...(mode === 'auto' ? {} : { tier: mode }) }),
}));
