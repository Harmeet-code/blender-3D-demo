/** Ephemeral, unlocked entrance overrides. Never serialized or used to change navigation. */
export const proximityDoors = new Set<string>();

type DoorStateListener = () => void;
const collisionListeners = new Set<DoorStateListener>();
let collisionOpenDoorIds: ReadonlySet<string> = new Set();

/** Collision opens only after the rendered leaves reach their fully open pose. */
export function setCollisionDoorOpen(id: string, open: boolean): void {
  const currentlyOpen = collisionOpenDoorIds.has(id);
  if (currentlyOpen === open) {return;}
  const next = new Set(collisionOpenDoorIds);
  if (open) {next.add(id);}
  else {next.delete(id);}
  collisionOpenDoorIds = next;
  for (const listener of collisionListeners) {listener();}
}

export function getCollisionOpenDoorIds(): ReadonlySet<string> {
  return collisionOpenDoorIds;
}

export function subscribeCollisionDoorState(listener: DoorStateListener): () => void {
  collisionListeners.add(listener);
  return () => collisionListeners.delete(listener);
}
