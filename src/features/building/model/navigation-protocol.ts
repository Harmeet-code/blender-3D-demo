import type { NormalizedLayout } from './normalize-layout.ts';
import type { RoutePoint } from './navigation.ts';
import type { PortalType } from './building-schema.ts';

export interface NavigationRouteOptions {
  enabledPortalTypes?: readonly PortalType[];
}

export type BuildingRoute = { points: RoutePoint[]; floors: string[] } | null;
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
    };
export type NavigationResponse =
  | { id: number; revision: number; route: BuildingRoute }
  | { id: number; revision: number; error: string };
