import { isConnector, type PlanDocument, type PlanFloor, type PlanObject } from './types.ts';

interface RelatedObjectChange {
  floorId: string;
  id: string;
  expected: PlanObject | null;
  replacement: PlanObject | null;
}
/** A saved step owns one floor and only the related objects it actually changed elsewhere. */
export interface FloorStep {
  floor: PlanFloor;
  expectedFloor: PlanFloor;
  related: RelatedObjectChange[];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function reconcileConnectors(document: PlanDocument): PlanDocument {
  const groups = new Map<string, Set<string>>();
  for (const floor of document.floors) {
    for (const object of floor.objects) {
      if (object.portalId && isConnector(object.recipe)) {
        const members = groups.get(object.portalId) ?? new Set<string>();
        members.add(floor.source.id);
        groups.set(object.portalId, members);
      }
    }
  }
  return {
    ...document,
    floors: document.floors.map((floor) => {
      const objects = floor.objects.map((object) => {
        if (!isConnector(object.recipe) || !object.portalId) {
          return object;
        }
        const members = [...(groups.get(object.portalId) ?? [])];
        const connected = members.length >= 2;
        const connectsFloorIds = connected ? members : [];
        const portalId = connected ? object.portalId : '';
        return portalId === object.portalId && same(connectsFloorIds, object.connectsFloorIds)
          ? object
          : { ...object, portalId, connectsFloorIds, managed: true };
      });
      return objects.every((object, index) => object === floor.objects[index])
        ? floor
        : { ...floor, objects };
    }),
  };
}

/** Capture an inverse, including only changed connector records on other floors. */
export function inverseStep(before: PlanDocument, after: PlanDocument, floorId: string): FloorStep {
  const floor = before.floors.find((item) => item.source.id === floorId);
  const expectedFloor = after.floors.find((item) => item.source.id === floorId);
  if (!floor || !expectedFloor) {
    throw new Error('The saved-step floor no longer exists.');
  }
  const related: RelatedObjectChange[] = [];
  for (const prior of before.floors) {
    if (prior.source.id === floorId) {
      continue;
    }
    const next = after.floors.find((item) => item.source.id === prior.source.id);
    if (!next) {
      continue;
    }
    const ids = new Set([...prior.objects, ...next.objects].map((object) => object.id));
    for (const id of ids) {
      const replacement = prior.objects.find((object) => object.id === id) ?? null;
      const expected = next.objects.find((object) => object.id === id) ?? null;
      if (!same(replacement, expected)) {
        related.push({ floorId: prior.source.id, id, expected, replacement });
      }
    }
  }
  return structuredClone({ floor, expectedFloor, related });
}

function restoreRecords<T extends { id: string }>(
  actual: T[],
  expected: T[],
  replacement: T[],
): T[] {
  const result = new Map(actual.map((record) => [record.id, record]));
  for (const id of new Set([...expected, ...replacement].map((record) => record.id))) {
    const before = expected.find((record) => record.id === id) ?? null;
    const next = replacement.find((record) => record.id === id) ?? null;
    if (same(before, next)) {
      continue;
    }
    if (!same(result.get(id) ?? null, before)) {
      throw new Error(
        'A saved-step object changed through a linked operation. Resolve its later edit before restoring this step.',
      );
    }
    if (next) {
      result.set(id, structuredClone(next));
    } else {
      result.delete(id);
    }
  }
  return [...result.values()];
}

function restoreFloor(actual: PlanFloor, step: FloorStep): PlanFloor {
  const restored = { ...actual };
  // Incoming connector changes are outside this floor's own chronological stack.
  // Restore only the fields/records owned by this step, preserving those incoming changes.
  for (const key of [
    'source',
    'boundary',
    'spawn',
    'referenceCoordinates',
    'referenceTransform',
    'calibrationText',
  ] as const) {
    if (same(step.floor[key], step.expectedFloor[key])) {
      continue;
    }
    if (!same(actual[key], step.expectedFloor[key])) {
      throw new Error(
        'This floor property changed after the saved step. Resolve the later edit before restoring it.',
      );
    }
    Object.assign(restored, { [key]: structuredClone(step.floor[key]) });
  }
  restored.objects = restoreRecords(actual.objects, step.expectedFloor.objects, step.floor.objects);
  restored.zones = restoreRecords(actual.zones, step.expectedFloor.zones, step.floor.zones);
  return restored;
}

export function restoreStep(document: PlanDocument, step: FloorStep): PlanDocument {
  for (const change of step.related) {
    const floor = document.floors.find((item) => item.source.id === change.floorId);
    const actual = floor?.objects.find((object) => object.id === change.id) ?? null;
    if (!floor || !same(actual, change.expected)) {
      throw new Error(
        'A linked landing changed on another floor. Undo its later edits there first, then retry this saved step.',
      );
    }
  }
  const floors = document.floors.map((floor) => {
    if (floor.source.id === step.floor.source.id) {
      return restoreFloor(floor, step);
    }
    const changes = step.related.filter((change) => change.floorId === floor.source.id);
    if (!changes.length) {
      return floor;
    }
    const objects = floor.objects.filter(
      (object) => !changes.some((change) => change.id === object.id),
    );
    for (const change of changes) {
      if (change.replacement) {
        objects.push(structuredClone(change.replacement));
      }
    }
    return { ...floor, objects };
  });
  return reconcileConnectors({ ...document, floors });
}
