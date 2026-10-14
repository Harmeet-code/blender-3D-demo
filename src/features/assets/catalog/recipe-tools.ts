import type { Object3D } from 'three';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { beveledBox } from './beveled-box.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Point3 = [number, number, number];
export type Finish =
  | 'panel'
  | 'frame'
  | 'branding'
  | 'chair'
  | 'wood'
  | 'metal'
  | 'yellow'
  | 'glass'
  | 'glass_opaque'
  | 'floor'
  | 'bronze'
  | 'oak'
  | 'stone'
  | 'led'
  | 'graphite';
const palette: Record<
  Finish,
  { rgb: Point3; rough?: number; metal?: number; alpha?: number; emission?: number }
> = {
  panel: { rgb: [0.73, 0.77, 0.79] },
  frame: { rgb: [0.035, 0.07, 0.1] },
  branding: { rgb: [0.02, 0.38, 0.5] },
  chair: { rgb: [0.045, 0.2, 0.26] },
  wood: { rgb: [0.52, 0.34, 0.17] },
  metal: { rgb: [0.27, 0.32, 0.37], rough: 0.4, metal: 0.7 },
  yellow: { rgb: [0.98, 0.53, 0.025] },
  glass: { rgb: [0.4, 0.72, 0.83], rough: 0.18, alpha: 0.24 },
  glass_opaque: { rgb: [0.4, 0.72, 0.83] },
  floor: { rgb: [0.18, 0.22, 0.26] },
  bronze: { rgb: [0.48, 0.32, 0.16], rough: 0.32, metal: 0.82 },
  oak: { rgb: [0.35, 0.19, 0.095], rough: 0.58 },
  stone: { rgb: [0.47, 0.45, 0.4], rough: 0.7 },
  led: { rgb: [0.98, 0.67, 0.36], rough: 0.35, emission: 3 },
  graphite: { rgb: [0.035, 0.048, 0.057], rough: 0.32, metal: 0.35 },
};

/** One construction owner per asset; callers clone transforms while retaining these resources. */
export class Recipe {
  readonly scene = new Group();
  readonly materials = new Map<Finish, MeshStandardMaterial>();
  constructor(
    readonly id: string,
    readonly low: boolean,
  ) {
    this.scene.name = 'root';
    this.scene.userData = {
      asset_id: id,
      asset_version: 1,
      generator_version: 'r3f-1',
      quality_variant: low ? 'low' : 'baseline',
    };
  }
  material(finish: Finish): MeshStandardMaterial {
    let material = this.materials.get(finish);
    if (material) {
      return material;
    }
    const data = palette[finish];
    material = new MeshStandardMaterial({
      color: new Color().setRGB(...data.rgb),
      roughness: data.rough ?? 0.62,
      metalness: data.metal ?? 0,
      transparent: data.alpha !== undefined,
      opacity: data.alpha ?? 1,
      // Match the exported BLEND glass contract; rear panes must not write opaque depth.
      depthWrite: data.alpha === undefined,
      side: data.alpha === undefined ? 0 : DoubleSide,
    });
    material.name =
      finish === 'bronze'
        ? 'booth_satin_bronze'
        : finish === 'oak'
          ? 'booth_natural_oak'
          : finish === 'led'
            ? 'booth_warm_led'
            : `finish_${finish === 'graphite' ? 'branding' : finish}`;
    material.userData.materialRole =
      finish === 'branding' || finish === 'graphite'
        ? 'branding'
        : finish.includes('glass')
          ? 'glass'
          : finish === 'frame'
            ? 'frame'
            : 'surface';
    if (data.emission) {
      material.emissive.copy(material.color);
      material.emissiveIntensity = data.emission;
    }
    this.materials.set(finish, material);
    return material;
  }
  panelColor(rgb: Point3) {
    this.material('panel').color.setRGB(...rgb);
    this.material('panel').roughness = 0.66;
  }
  mesh(
    name: string,
    geometry: BufferGeometry,
    finish: Finish,
    position: Point3 = [0, 0, 0],
    parent: Object3D = this.scene,
  ) {
    if (!geometry.getAttribute('uv')) {
      geometry.setAttribute(
        'uv',
        new Float32BufferAttribute(
          new Float32Array(geometry.getAttribute('position').count * 2),
          2,
        ),
      );
    }
    const mesh = new Mesh(geometry, this.material(finish));
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(
    name: string,
    size: Point3,
    position: Point3,
    finish: Finish = 'frame',
    bevel = 0,
    parent: Object3D = this.scene,
    segments = 1,
  ) {
    const radius = this.low ? 0 : Math.min(bevel, ...size.map((n) => n / 2));
    return this.mesh(
      name,
      radius > 0 ? beveledBox(size, radius, segments) : new BoxGeometry(...size),
      finish,
      position,
      parent,
    );
  }
  cylinder(
    name: string,
    radius: number,
    depth: number,
    position: Point3,
    finish: Finish,
    axis: 'X' | 'Y' | 'Z' = 'Y',
    vertices = 12,
  ) {
    const mesh = this.mesh(
      name,
      new CylinderGeometry(radius, radius, depth, vertices),
      finish,
      position,
    );
    if (axis === 'X') {
      mesh.rotation.z = -Math.PI / 2;
    } else if (axis === 'Z') {
      mesh.rotation.x = Math.PI / 2;
    }
    return mesh;
  }
  polygon(name: string, points: Point3[], faces: number[][], finish: Finish) {
    const positions: number[] = [];
    for (const face of faces) {
      for (let i = 1; i < face.length - 1; i++) {
        for (const index of [face[0]!, face[i]!, face[i + 1]!]) {
          positions.push(...points[index]!);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return this.mesh(name, geometry, finish);
  }
  beam(name: string, start: Point3, end: Point3, finish: Finish = 'metal', width = 0.06) {
    const direction = new Vector3(...end).sub(new Vector3(...start));
    const mesh = this.box(
      name,
      [width, width, direction.length()],
      [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2],
      finish,
    );
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize());
    return mesh;
  }
  socket(name: string, position: Point3, rotation: Point3 = [0, 0, 0]) {
    const node = new Group();
    node.name = name;
    node.position.set(...position);
    node.rotation.set(...rotation);
    this.scene.add(node);
    return node;
  }
  /** Keep interface meshes independent; ordinary static solids merge by material, with named markers. */
  finish(preserve: ReadonlySet<string> = new Set()) {
    this.scene.updateMatrixWorld(true);
    const groups = new Map<MeshStandardMaterial, Mesh[]>();
    for (const child of [...this.scene.children]) {
      if (!(child instanceof Mesh) || preserve.has(child.name) || child.children.length) {
        continue;
      }
      const material = child.material as MeshStandardMaterial;
      if (material.transparent) {
        continue;
      }
      const group = groups.get(material) ?? [];
      group.push(child);
      groups.set(material, group);
    }
    for (const [material, meshes] of groups) {
      const transformed = meshes.map((mesh) => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);
        return geometry;
      });
      const geometry = mergeGeometries(transformed, false);
      if (!geometry) {
        transformed.forEach((item) => item.dispose());
        continue;
      }
      const merged = new Mesh(geometry, material);
      merged.name = `merged_${material.name}`;
      merged.castShadow = true;
      merged.receiveShadow = true;
      this.scene.add(merged);
      for (const mesh of meshes) {
        const marker = new Group();
        marker.name = mesh.name;
        marker.position.copy(mesh.position);
        marker.quaternion.copy(mesh.quaternion);
        marker.scale.copy(mesh.scale);
        this.scene.add(marker);
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
      transformed.forEach((item) => item.dispose());
    }
    this.scene.updateMatrixWorld(true);
    return this.scene;
  }
}
