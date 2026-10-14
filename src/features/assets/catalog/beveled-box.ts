import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Point3 } from './recipe-tools.ts';

/** Sparse bevel topology: six flat faces, twelve edge strips, eight corner patches.
 * Unlike a subdivided rounded cube, the large flat faces stay two triangles each. */
export function beveledBox(size: Point3, radius: number, segments: number) {
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [];
  const extent = size.map((value) => value / 2) as Point3;
  const inner = extent.map((value) => Math.max(0, value - radius)) as Point3;
  const triangle = (a: Point3, b: Point3, c: Point3, na: Point3, nb: Point3, nc: Point3) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ];
    if (Math.hypot(...cross) < 1e-12) {
      return;
    }
    if (cross.reduce((sum, value, i) => sum + value * (na[i]! + nb[i]! + nc[i]!), 0) < 0) {
      [b, c] = [c, b];
      [nb, nc] = [nc, nb];
    }
    for (const [p, n] of [
      [a, na],
      [b, nb],
      [c, nc],
    ] as const) {
      positions.push(...p);
      normals.push(...n);
      uv.push(0, 0);
    }
  };
  for (const axis of [0, 1, 2]) {
    const other = [0, 1, 2].filter((value) => value !== axis),
      u = other[0]!,
      v = other[1]!;
    for (const sign of [-1, 1]) {
      const normal: Point3 = [0, 0, 0];
      normal[axis] = sign;
      const points: Point3[] = [];
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p: Point3 = [0, 0, 0];
        p[axis] = sign * extent[axis]!;
        p[u] = a! * inner[u]!;
        p[v] = b! * inner[v]!;
        points.push(p);
      }
      triangle(points[0]!, points[1]!, points[2]!, normal, normal, normal);
      triangle(points[0]!, points[2]!, points[3]!, normal, normal, normal);
    }
    for (const su of [-1, 1]) {
      for (const sv of [-1, 1]) {
        for (let i = 0; i < segments; i++) {
          const point = (angle: number, side: number): [Point3, Point3] => {
            const p: Point3 = [0, 0, 0],
              n: Point3 = [0, 0, 0];
            p[axis] = side * inner[axis]!;
            n[u] = su * Math.cos(angle);
            n[v] = sv * Math.sin(angle);
            p[u] = su * inner[u]! + radius * n[u]!;
            p[v] = sv * inner[v]! + radius * n[v]!;
            return [p, n];
          };
          const a = (i * Math.PI) / (2 * segments),
            b = ((i + 1) * Math.PI) / (2 * segments);
          const [p0, n0] = point(a, -1),
            [p1, n1] = point(a, 1),
            [p2, n2] = point(b, 1),
            [p3, n3] = point(b, -1);
          triangle(p0, p1, p2, n0, n1, n2);
          triangle(p0, p2, p3, n0, n2, n3);
        }
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const point = (i: number, j: number): [Point3, Point3] => {
          const direction = [segments - i - j, i, j],
            length = Math.hypot(...direction);
          const n: Point3 = [
            (sx * direction[0]!) / length,
            (sy * direction[1]!) / length,
            (sz * direction[2]!) / length,
          ];
          return [
            [
              sx * inner[0] + radius * n[0],
              sy * inner[1] + radius * n[1],
              sz * inner[2] + radius * n[2],
            ],
            n,
          ];
        };
        for (let i = 0; i < segments; i++) {
          for (let j = 0; j < segments - i; j++) {
            const [a, na] = point(i, j),
              [b, nb] = point(i + 1, j),
              [c, nc] = point(i, j + 1);
            triangle(a, b, c, na, nb, nc);
            if (i + j < segments - 1) {
              const [d, nd] = point(i + 1, j + 1);
              triangle(b, d, c, nb, nd, nc);
            }
          }
        }
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return geometry;
}
