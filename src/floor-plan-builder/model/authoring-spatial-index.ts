/** A conservative, immutable broadphase index for planar authoring geometry. */
export interface Bounds2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export type Point2 = readonly [number, number];

export interface AuthoringSpatialEntry<T> {
  /** `null` bounds are retained as always-candidates to avoid false negatives. */
  bounds: Bounds2 | null;
  value: T;
}

interface IndexedEntry<T> extends AuthoringSpatialEntry<T> {
  order: number;
}

interface Node<T> {
  bounds: Bounds2;
  entries?: IndexedEntry<T>[];
  left?: Node<T>;
  right?: Node<T>;
}

const LEAF_CAPACITY = 8;

function isValidBounds(bounds: Bounds2): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minZ) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxZ) &&
    bounds.minX <= bounds.maxX &&
    bounds.minZ <= bounds.maxZ
  );
}

function intersects(a: Bounds2, b: Bounds2): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function union(entries: readonly IndexedEntry<unknown>[]): Bounds2 {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const entry of entries) {
    const bounds = entry.bounds!;
    minX = Math.min(minX, bounds.minX);
    minZ = Math.min(minZ, bounds.minZ);
    maxX = Math.max(maxX, bounds.maxX);
    maxZ = Math.max(maxZ, bounds.maxZ);
  }
  return { minX, minZ, maxX, maxZ };
}

/** Returns a finite AABB, or null when a point cannot be indexed safely. */
export function bounds2FromPoints(points: readonly Point2[]): Bounds2 | null {
  if (!points.length) {
    return null;
  }
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return null;
    }
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ };
}

/**
 * Immutable median-split AABB tree. Queries are broadphase only; callers must
 * retain their existing exact geometry predicates. Results preserve input order
 * so equal-distance and first-match behavior remains deterministic.
 */
export class AuthoringSpatialIndex<T> {
  private readonly entries: IndexedEntry<T>[];
  private readonly alwaysCandidates: IndexedEntry<T>[];
  private readonly root: Node<T> | null;
  private readonly stack: Node<T>[] = [];
  private readonly matches: IndexedEntry<T>[] = [];

  constructor(entries: readonly AuthoringSpatialEntry<T>[]) {
    const indexed = entries.map((entry, order) => ({ ...entry, order }));
    this.entries = indexed;
    const bounded: IndexedEntry<T>[] = [];
    this.alwaysCandidates = [];
    for (const entry of indexed) {
      if (entry.bounds && isValidBounds(entry.bounds)) {
        bounded.push(entry);
      } else {
        this.alwaysCandidates.push(entry);
      }
    }
    this.root = bounded.length ? this.build(bounded) : null;
  }

  /** Reuses `output` when supplied; malformed queries conservatively return all entries. */
  query(bounds: Bounds2, output: T[] = []): T[] {
    output.length = 0;
    if (!isValidBounds(bounds)) {
      for (const entry of this.entries) {
        output.push(entry.value);
      }
      return output;
    }

    this.stack.length = 0;
    this.matches.length = 0;
    for (const entry of this.alwaysCandidates) {
      this.matches.push(entry);
    }
    if (this.root) {
      this.stack.push(this.root);
    }
    while (this.stack.length) {
      const node = this.stack.pop()!;
      if (!intersects(node.bounds, bounds)) {
        continue;
      }
      if (node.entries) {
        for (const entry of node.entries) {
          if (intersects(entry.bounds!, bounds)) {
            this.matches.push(entry);
          }
        }
      } else {
        if (node.left) this.stack.push(node.left);
        if (node.right) this.stack.push(node.right);
      }
    }

    this.matches.sort((a, b) => a.order - b.order);
    for (const entry of this.matches) {
      output.push(entry.value);
    }
    return output;
  }

  private build(entries: IndexedEntry<T>[]): Node<T> {
    const bounds = union(entries);
    if (entries.length <= LEAF_CAPACITY) {
      return { bounds, entries };
    }
    const splitX = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ;
    entries.sort((a, b) => {
      const aCenter = splitX ? a.bounds!.minX + a.bounds!.maxX : a.bounds!.minZ + a.bounds!.maxZ;
      const bCenter = splitX ? b.bounds!.minX + b.bounds!.maxX : b.bounds!.minZ + b.bounds!.maxZ;
      return aCenter - bCenter || a.order - b.order;
    });
    const middle = Math.floor(entries.length / 2);
    return {
      bounds,
      left: this.build(entries.slice(0, middle)),
      right: this.build(entries.slice(middle)),
    };
  }
}
