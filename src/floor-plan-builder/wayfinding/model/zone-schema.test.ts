import { describe, expect, test } from 'bun:test';
import { narrowestCorridor, walkableZoneSchema } from '../model/zone-schema.ts';

const square = (half: number, cx = 0, cz = 0): [number, number][] => [
  [cx - half, cz - half],
  [cx + half, cz - half],
  [cx + half, cz + half],
  [cx - half, cz + half],
];

const zone = (polygon: [number, number][], holes: [number, number][][] = []) => ({
  id: 'z1',
  floorId: 'f1',
  name: 'Hall',
  type: 'general' as const,
  polygon,
  holes,
});

describe('walkableZoneSchema', () => {
  test('accepts a valid zone', () => {
    expect(() => walkableZoneSchema.parse(zone(square(5)))).not.toThrow();
  });

  test('rejects self-intersecting boundaries', () => {
    const bowtie: [number, number][] = [
      [0, 0],
      [4, 4],
      [4, 0],
      [0, 4],
    ];
    expect(() => walkableZoneSchema.parse(zone(bowtie))).toThrow();
  });

  test('rejects tiny areas', () => {
    expect(() => walkableZoneSchema.parse(zone(square(0.4)))).toThrow(/at least 1/);
  });

  test('rejects corridors below the agent diameter', () => {
    const slot: [number, number][] = [
      [-5, -0.3],
      [5, -0.3],
      [5, 0.3],
      [-5, 0.3],
    ];
    expect(() => walkableZoneSchema.parse(zone(slot))).toThrow(/narrower/);
  });

  test('rejects self-intersecting holes', () => {
    const hole: [number, number][] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ];
    expect(() => walkableZoneSchema.parse(zone(square(5), [hole]))).toThrow();
  });

  test('narrowestCorridor measures the tightest gap', () => {
    expect(narrowestCorridor(square(5))).toBeCloseTo(10, 5);
    const slot: [number, number][] = [
      [-5, -0.3],
      [5, -0.3],
      [5, 0.3],
      [-5, 0.3],
    ];
    expect(narrowestCorridor(slot)).toBeCloseTo(0.6, 5);
  });
});
