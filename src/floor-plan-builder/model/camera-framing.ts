import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three';

export interface FrameBounds3 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface CameraFrame {
  target: [number, number, number];
  position: [number, number, number];
}

/** Keep the current viewing direction and compute a distance that contains every bound corner. */
export function frameCameraToBounds(
  camera: Camera,
  currentTarget: Vector3,
  bounds: FrameBounds3,
  padding = 1.18,
): CameraFrame {
  const target = new Vector3(
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  const direction = camera.position.clone().sub(currentTarget).normalize();
  if (direction.lengthSq() < 1e-8) {
    direction.set(0.15, 0.9, 0.55).normalize();
  }
  const right = new Vector3().crossVectors(camera.up, direction).normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const aspect = camera instanceof PerspectiveCamera ? camera.aspect : 1;
  const fov = camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() : 45;
  const verticalTangent = Math.tan((fov * Math.PI) / 360);
  const horizontalTangent = verticalTangent * Math.max(0.01, aspect);
  const orthographicHeight =
    camera instanceof OrthographicCamera ? (camera.top - camera.bottom) / camera.zoom : null;
  let distance = 0.1;
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const offset = new Vector3(x, y, z).sub(target);
        const required = orthographicHeight
          ? offset.dot(direction) +
            Math.max(
              Math.abs(offset.dot(up)) / (orthographicHeight / 2),
              Math.abs(offset.dot(right)) / ((orthographicHeight * aspect) / 2),
            )
          : offset.dot(direction) +
            Math.max(
              Math.abs(offset.dot(right)) / horizontalTangent,
              Math.abs(offset.dot(up)) / verticalTangent,
            );
        distance = Math.max(distance, required);
      }
    }
  }
  const position = target.clone().addScaledVector(direction, distance * padding);
  return {
    target: [target.x, target.y, target.z],
    position: [position.x, position.y, position.z],
  };
}
