import { describe, expect, test } from 'bun:test';
import {
  buildingLayoutSchema,
  demoLayout,
} from '../src/frontend/entities/building/model/building-schema.ts';
import {
  buildFloorGraph,
  findFloorPath,
} from '../src/frontend/entities/building/model/pathfinding.ts';

describe('building layout contract', () => {
  test('demo layout validates', () => {
    expect(() => buildingLayoutSchema.parse(demoLayout)).not.toThrow();
  });

  test('multi-floor path routes via portal graph', () => {
    const graph = buildFloorGraph(demoLayout);
    expect(findFloorPath(graph, 'B1', 'F1')).toEqual(['B1', 'F1']);
  });
});
