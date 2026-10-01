import type { BuildingLayout } from './building-schema.ts';

/** Minimal topological graph over portals for multi-floor routing. */
export interface FloorGraph {
  adjacency: Map<string, string[]>;
}

/** Build floor -> floors adjacency from portal `connects` lists. */
export function buildFloorGraph(layout: BuildingLayout): FloorGraph {
  const adjacency = new Map<string, string[]>();
  for (const floor of layout.floors) {
    adjacency.set(floor.id, []);
  }
  for (const portal of layout.portals) {
    for (const from of portal.connects) {
      for (const to of portal.connects) {
        if (from !== to) {
          const list = adjacency.get(from) ?? [];
          if (!list.includes(to)) {
            list.push(to);
          }
          adjacency.set(from, list);
        }
      }
    }
  }
  return { adjacency };
}

/** BFS shortest floor path, e.g. B1 -> F1 via lift-01. Returns floor ids. */
export function findFloorPath(graph: FloorGraph, fromFloorId: string, toFloorId: string): string[] {
  if (fromFloorId === toFloorId) {
    return [fromFloorId];
  }
  const visited = new Set<string>([fromFloorId]);
  const queue: string[][] = [[fromFloorId]];
  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) {
      continue;
    }
    const current = path[path.length - 1];
    if (current === undefined) {
      continue;
    }
    for (const next of graph.adjacency.get(current) ?? []) {
      if (visited.has(next)) {
        continue;
      }
      const nextPath = [...path, next];
      if (next === toFloorId) {
        return nextPath;
      }
      visited.add(next);
      queue.push(nextPath);
    }
  }
  return [];
}

/**
 * Placeholder single-floor path. Replace with recast-navigation-js NavMesh
 * query once walkable zones are triangulated.
 */
export function straightLinePath(
  from: [number, number, number],
  to: [number, number, number],
): Array<[number, number, number]> {
  return [from, to];
}
