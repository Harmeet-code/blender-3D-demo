import type { NormalizedLayout } from './normalize-layout.ts';
import type { RoutePoint } from './navigation.ts';
import type { PortalType } from './building-schema.ts';

export interface NavigationRouteOptions {
  enabledPortalTypes?: readonly PortalType[];
  disabledPortals?: readonly string[];
}

export interface NavAreaPaint {
  polygon: [number, number][];
  area: number;
  flags: number;
}

export interface AreaQueryFilter {
  includeFlags?: number;
  excludeFlags?: number;
  areaCosts?: readonly (readonly [number, number])[];
}

export type BuildingRoute = {
  points: RoutePoint[];
  floors: string[];
  straight?: RoutePoint[];
  straightFloors?: string[];
  buildMs?: number;
} | null;
export type NavigationRequest =
  | { type: 'layout'; revision: number; layout: NormalizedLayout }
  | { type: 'cancel'; id: number }
  | {
      type: 'route';
      id: number;
      revision: number;
      fromFloor: string;
      from: RoutePoint;
      toFloor: string;
      to: RoutePoint;
      enabledPortalTypes?: readonly PortalType[];
      disabledPortals?: readonly string[];
      queryFilter?: AreaQueryFilter;
      straight?: boolean;
      /** Per-floor areas; boundaries are baked into the mesh before contour simplification. */
      navAreas?: Record<string, NavAreaPaint[]>;
    };
export type NavigationResponse =
  | { id: number; revision: number; route: BuildingRoute }
  | { id: number; revision: number; error: string };
