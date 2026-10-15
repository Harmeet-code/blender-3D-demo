import { useEffect } from 'react';
import { metresToSource } from '@/features/building/model/floor-coordinates.ts';
import { activeFloor, type StudioStore } from '../model/store.ts';
import { placementError } from '../model/geometry.ts';
import { objectSchema, polygonSchema, isBooth, isConnector } from '../model/types.ts';
import { encodeLayout } from '../model/adapter.ts';

export const studioDebugEnabled = () =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug');
function createAudit(store: StudioStore) {
  return Object.freeze({
    audit: () => {
      const state = store.getState();
      let canonical: ReturnType<typeof encodeLayout> | null = null;
      try {
        canonical = encodeLayout(state.document);
      } catch {
        /* Report validity without exposing authored payloads. */
      }
      return {
        revision: state.revision,
        floorId: state.floorId,
        wireValid: !!canonical,
        floors: state.document.floors.map((floor) => ({
          id: floor.source.id,
          boundaryValid: polygonSchema.safeParse(floor.boundary).success,
          zones: floor.zones.map((zone) => ({
            id: zone.id,
            valid: polygonSchema.safeParse(zone.polygon).success,
          })),
          objects: floor.objects.map((object) => ({
            id: object.id,
            recipe: object.recipe,
            metadataValid: objectSchema.safeParse(object).success,
            roomConsistent:
              !isBooth(object) ||
              !!canonical?.rooms.some(
                (room) => room.id === object.id && room.floorId === floor.source.id,
              ),
            portalConsistent:
              !isConnector(object.recipe) ||
              !object.portalId ||
              !!canonical?.portals.some(
                (portal) =>
                  portal.id === object.portalId && portal.connects.includes(floor.source.id),
              ),
            placement: placementError(object, floor),
          })),
        })),
      };
    },
    coordinates: (x: number, z: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new Error('Use finite metric X/Z values.');
      }
      const floor = activeFloor(store.getState());
      return {
        floorId: floor.source.id,
        world: [x, z],
        source: metresToSource([x, z], floor.source.coordinateSystem),
      };
    },
  });
}
declare global {
  interface Window {
    FLOOR_PLAN_AUDIT?: ReturnType<typeof createAudit>;
  }
}

export function useStudioDebug(store: StudioStore) {
  useEffect(() => {
    if (!studioDebugEnabled()) {
      return;
    }
    const previous = window.FLOOR_PLAN_AUDIT,
      audit = createAudit(store);
    window.FLOOR_PLAN_AUDIT = audit;
    return () => {
      if (window.FLOOR_PLAN_AUDIT !== audit) {
        return;
      }
      if (previous) {
        window.FLOOR_PLAN_AUDIT = previous;
      } else {
        delete window.FLOOR_PLAN_AUDIT;
      }
    };
  }, [store]);
}
