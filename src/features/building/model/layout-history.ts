import type { BuildingLayout } from './building-schema.ts';
/** Immutable accepted snapshots only. Preview gestures never enter this history. */
export class LayoutHistory {
  private past: BuildingLayout[] = [];
  private future: BuildingLayout[] = [];
  private readonly costs = new WeakMap<BuildingLayout, number>();
  private cost(layout: BuildingLayout) {
    let size = this.costs.get(layout);
    if (size === undefined) {
      size = JSON.stringify(layout).length * 4;
      this.costs.set(layout, size);
    }
    return size;
  }
  push(previous: BuildingLayout) {
    this.past.push(previous);
    this.future.length = 0;
    while (
      this.past.length > 40 ||
      this.past.reduce((sum, layout) => sum + this.cost(layout), 0) > 8 * 1024 * 1024
    ) {
      this.past.shift();
    }
  }
  undo(current: BuildingLayout) {
    const target = this.past.pop();
    if (target) {
      this.future.push(current);
      while (this.future.reduce((sum, layout) => sum + this.cost(layout), 0) > 8 * 1024 * 1024) {
        this.future.shift();
      }
    }
    return target;
  }
  redo(current: BuildingLayout) {
    const target = this.future.pop();
    if (target) {
      this.past.push(current);
    }
    return target;
  }
  clear() {
    this.past.length = this.future.length = 0;
  }
  counts() {
    return { undoCount: this.past.length, redoCount: this.future.length };
  }
}
export function draftKey(buildingId: string) {
  return `venue-draft:v1:${buildingId}`;
}
