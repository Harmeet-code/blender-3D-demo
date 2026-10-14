import { useRef, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Vector3, type Object3D } from 'three';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useRoutePointSelection } from '@/features/navigation/model/route-point-selection.ts';

/** Raster/source pixels never enter this path: intersections are already world meters. */
export function FloorPointInteraction({ children }: { children: ReactNode }) {
  const layout = useActiveLayout();
  const floorWorld = useRef(new Vector3());
  const floorHit = (event: ThreeEvent<MouseEvent>) => {
    let ancestor: Object3D | null = event.object;
    while (ancestor && typeof ancestor.userData.floorId !== 'string') {
      ancestor = ancestor.parent;
    }
    if (!ancestor) {
      return null;
    }
    ancestor.getWorldPosition(floorWorld.current);
    // A click on a furniture top/wall must not become a floor destination underneath it.
    if (Math.abs(event.point.y - floorWorld.current.y) > 0.2) {
      return null;
    }
    return {
      floorId: ancestor.userData.floorId as string,
      point: [event.point.x, event.point.z] as [number, number],
    };
  };
  return (
    <group
      onClick={(event) => {
        const selection = useRoutePointSelection.getState();
        if (!selection.pickSlot) {
          return;
        }
        const hit = floorHit(event);
        if (!hit) {
          return;
        }
        event.stopPropagation();
        selection.select(layout, hit.floorId, hit.point);
      }}
      onDoubleClick={(event) => {
        if (useRoutePointSelection.getState().pickSlot || useWorldStore.getState().dollhouse) {
          return;
        }
        const hit = floorHit(event);
        if (!hit) {
          return;
        }
        event.stopPropagation();
        useWorldStore.getState().teleportToPoint(hit.floorId, hit.point);
      }}
    >
      {children}
    </group>
  );
}
