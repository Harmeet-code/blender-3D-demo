import { BufferGeometry, Float32BufferAttribute } from 'three';
import wordmark from './luminary-wordmark.json';
import type { Recipe } from './recipe-tools.ts';
import { type Finish, type Point3 } from './recipe-tools.ts';

/** Exact source dimensions; finish components use physical pitch instead of stretched meshes. */
export function buildSizedBooth(recipe: Recipe, feet: [number, number]) {
  const W = feet[0] * 0.3048,
    D = feet[1] * 0.3048,
    H = 2.8;
  recipe.panelColor([0.78, 0.76, 0.7]);
  const part = (name: string, size: Point3, position: Point3, finish: Finish, radius = 0.003) =>
    recipe.box(name, size, position, finish, radius, recipe.scene, 2);
  part('mesh_rear', [W, H, 0.08], [0, H / 2, -D / 2 + 0.04], 'panel', 0.004);
  for (const sign of [-1, 1]) {
    part(
      `mesh_side_${sign}`,
      [0.08, H, D - 0.08],
      [sign * (W / 2 - 0.04), H / 2, 0.04],
      'panel',
      0.004,
    );
  }
  part('mesh_branding', [W, 0.22, 0.1], [0, H - 0.11, D / 2 - 0.05], 'graphite', 0.004);
  part('inset_oak_floor', [W, 0.024, D], [0, 0.012, 0], 'oak', 0.001);
  for (const sign of [-1, 1]) {
    part(
      `bronze_entry_post_${sign}`,
      [0.055, H, 0.055],
      [sign * (W / 2 - 0.09), H / 2, D / 2 - 0.065],
      'bronze',
      0.004,
    );
    part(
      `oak_side_plinth_${sign}`,
      [0.025, 0.14, D - 0.22],
      [sign * (W / 2 - 0.0925), 0.095, 0.015],
      'oak',
      0.002,
    );
    part(
      `warm_side_wash_${sign}`,
      [0.025, 0.018, D - 0.28],
      [sign * (W / 2 - 0.1), H - 0.35, 0],
      'led',
      0.001,
    );
    const bays = Math.max(1, Math.ceil((D - 0.2) / 1.2));
    for (let i = 1; i < bays; i++) {
      part(
        `panel_side_reveal_${sign}_${i}`,
        [0.008, H - 0.27, 0.012],
        [sign * (W / 2 - 0.085), H / 2, -D / 2 + 0.12 + (i * (D - 0.24)) / bays],
        'bronze',
        0,
      );
    }
  }
  part('rear_oak_plinth', [W - 0.2, 0.14, 0.025], [0, 0.095, -D / 2 + 0.0925], 'oak', 0.002);
  part('rear_light_wash', [W - 0.22, 0.018, 0.026], [0, H - 0.35, -D / 2 + 0.1], 'led', 0.001);
  part(
    'entry_shadow_reveal',
    [W - 0.14, 0.018, 0.014],
    [0, H - 0.235, D / 2 - 0.05],
    'bronze',
    0.001,
  );
  const accent = Math.min(W - 0.35, 1.8),
    count = Math.max(3, Math.floor(accent / 0.085)),
    pitch = accent / count;
  for (let i = 0; i < count; i++) {
    part(
      `oak_accent_slat_${i}`,
      [pitch - 0.018, H - 0.58, 0.022],
      [-accent / 2 + pitch * (i + 0.5), H / 2 + 0.05, -D / 2 + 0.095],
      'oak',
      0.002,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(wordmark.position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(wordmark.normal, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(wordmark.uv, 2));
  geometry.setIndex(wordmark.index);
  const label = recipe.mesh('exhibitor_name', geometry, 'bronze', [0, H - 0.11, D / 2 - 0.006]);
  label.quaternion.set(...(wordmark.rotation as [number, number, number, number]));
  recipe.scene.userData.dimensions_feet = feet;
  recipe.scene.userData.metres_per_foot = 0.3048;
  recipe.scene.userData.dimensions_metres = [W, H, D];
}
