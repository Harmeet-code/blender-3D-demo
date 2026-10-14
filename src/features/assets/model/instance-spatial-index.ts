import type { Ray } from 'three';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

export interface InstanceTransform {
  position: [number, number, number];
  yawRadians: number;
  scale?: [number, number, number];
}
interface TreeNode {
  bounds: Box3;
  indices?: number[];
  left?: TreeNode;
  right?: TreeNode;
}

/** Immutable instance transforms + conservative broad phase, rebuilt only on placement changes. */
export class InstanceSpatialIndex {
  readonly transforms: Matrix4[];
  readonly inverses: Matrix4[];
  private readonly bounds: Box3[];
  private readonly root: TreeNode | null;
  private readonly stack: TreeNode[] = [];

  constructor(bounds: Box3, placements: readonly InstanceTransform[]) {
    const up = new Vector3(0, 1, 0);
    this.transforms = placements.map((placement) =>
      new Matrix4().compose(
        new Vector3(...placement.position),
        new Quaternion().setFromAxisAngle(up, placement.yawRadians),
        new Vector3(...(placement.scale ?? [1, 1, 1])),
      ),
    );
    this.inverses = this.transforms.map((matrix) => matrix.clone().invert());
    this.bounds = this.transforms.map((matrix) => bounds.clone().applyMatrix4(matrix));
    this.root = placements.length ? this.build(placements.map((_, i) => i)) : null;
  }

  private build(indices: number[]): TreeNode {
    const bounds = new Box3();
    for (const index of indices) {
      bounds.union(this.bounds[index]!);
    }
    if (indices.length <= 8) {
      return { bounds, indices };
    }
    const dimensions = bounds.getSize(new Vector3());
    const axis =
      dimensions.x >= dimensions.y && dimensions.x >= dimensions.z
        ? 'x'
        : dimensions.y >= dimensions.z
          ? 'y'
          : 'z';
    indices.sort(
      (a, b) =>
        this.bounds[a]!.min[axis] +
        this.bounds[a]!.max[axis] -
        (this.bounds[b]!.min[axis] + this.bounds[b]!.max[axis]),
    );
    const middle = Math.floor(indices.length / 2);
    return {
      bounds,
      left: this.build(indices.slice(0, middle)),
      right: this.build(indices.slice(middle)),
    };
  }

  candidates(ray: Ray, output: number[]) {
    output.length = 0;
    this.stack.length = 0;
    if (this.root) {
      this.stack.push(this.root);
    }
    while (this.stack.length) {
      const node = this.stack.pop()!;
      if (!ray.intersectsBox(node.bounds)) {
        continue;
      }
      if (node.indices) {
        for (const index of node.indices) {
          if (ray.intersectsBox(this.bounds[index]!)) {
            output.push(index);
          }
        }
      } else {
        if (node.left) {
          this.stack.push(node.left);
        }
        if (node.right) {
          this.stack.push(node.right);
        }
      }
    }
    return output;
  }
}
