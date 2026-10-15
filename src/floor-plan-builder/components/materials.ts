/**
 * Shared PBR material registry for procedural floor-plan models.
 *
 * Plain token objects only — no THREE material instances are cached here.
 * Callers spread tokens into `meshStandardMaterial` / `meshPhysicalMaterial`
 * JSX (declarative, R3F-owned) or into merged-geometry vertex-color batches
 * following `BoothObject.tsx`. Nothing in this registry needs disposal;
 * owned `CanvasTexture`s and merged `BufferGeometry`s are disposed by their
 * builders (see `procedural-primitives.ts`, `BoothObject.tsx`).
 */

export interface MaterialToken {
  color: string;
  roughness: number;
  metalness: number;
  transmission?: number;
  thickness?: number;
  ior?: number;
}

export const materials = {
  /** Anodized aluminum truss / poles. Spec §4 barn-tent + booth profiles. */
  aluminum: { color: '#C0C4C8', roughness: 0.35, metalness: 0.85 },
  /** Brushed steel turnstile housing. Spec §4 entrance. */
  brushedSteel: { color: '#C0C4C8', roughness: 0.25, metalness: 0.85 },
  /** Translucent white PVC roof canvas. Spec §4 barn-tent. */
  roofCanvas: {
    color: '#F8F9FA',
    roughness: 0.6,
    metalness: 0,
    transmission: 0.35,
    thickness: 0.01,
    ior: 1.49,
  },
  /** Translucent clear vinyl sidewalls (window variant). Spec §4. */
  clearVinyl: {
    color: '#F8F9FA',
    roughness: 0.1,
    metalness: 0,
    transmission: 0.85,
    thickness: 0.01,
    ior: 1.49,
  },
  /** Wooden floor deck. Spec §4 barn-tent. */
  woodDeck: { color: '#9A3412', roughness: 0.7, metalness: 0 },
  /** Matte dark arch columns + header spandrel. Spec §4 entrance. */
  darkPanel: { color: '#1E2022', roughness: 0.85, metalness: 0.05 },
  /** Polished frameless glass sliding doors. Spec §4 entrance. */
  polishedGlass: {
    color: '#F8F9FA',
    roughness: 0.05,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.02,
    ior: 1.52,
  },
  /** Matte vinyl branding banners. Spec §4 entrance. */
  vinylBlue: { color: '#2563EB', roughness: 0.8, metalness: 0 },
  /** Wayfinding cyan signage emissive. Spec §4 entrance. */
  wayfindingCyan: { color: '#06B6D4', roughness: 0.4, metalness: 0 },
  /** Ground anchoring steel. Spec §2 guy ropes & stakes. */
  anchorSteel: { color: '#84929B', roughness: 0.45, metalness: 0.85 },
  /** Safety-edge rubber seals. Spec §5 entrance. */
  rubber: { color: '#20252A', roughness: 1, metalness: 0 },
} satisfies Record<string, MaterialToken>;

export type MaterialName = keyof typeof materials;
