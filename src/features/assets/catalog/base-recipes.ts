import type { Recipe } from './recipe-tools.ts';
import { type Finish, type Point3 } from './recipe-tools.ts';

export function buildBaseRecipe(recipe: Recipe, opaque = false) {
  const { id, low } = recipe;
  const box = recipe.box.bind(recipe),
    cylinder = recipe.cylinder.bind(recipe),
    beam = recipe.beam.bind(recipe);
  if (id === 'floor-tile') {
    box('mesh_floor', [4, 0.2, 4], [0, -0.1, 0], 'floor');
  } else if (id === 'booth-ceiling') {
    box('mesh_ceiling', [4, 0.08, 4], [0, 0.04, 0], 'panel');
  } else if (id === 'wall-panel') {
    box('mesh_panel', [1, 2.5, 0.1], [0, 1.25, 0], 'panel', 0.004);
  } else if (id === 'booth-frame') {
    box('mesh_rear', [4, 2.5, 0.1], [0, 1.25, -1.95], 'panel');
    for (const sign of [-1, 1]) {
      box(`mesh_side_${sign}`, [0.1, 2.5, 3.9], [sign * 1.95, 1.25, 0.05], 'panel');
    }
    box('mesh_branding', [4, 0.28, 0.1], [0, 2.36, 1.95], 'branding');
  } else if (id === 'chair') {
    box('mesh_seat', [0.5, 0.08, 0.55], [0, 0.41, 0], 'chair', 0.005);
    box('mesh_back', [0.5, 0.4, 0.06], [0, 0.65, -0.245], 'chair', 0.005);
    for (const x of [-0.21, 0.21]) {
      for (const z of [-0.21, 0.21]) {
        box(`mesh_leg_${x}_${z}`, [0.055, 0.37, 0.055], [x, 0.185, z], 'chair');
      }
    }
  } else if (id === 'table') {
    box('mesh_top', [1.2, 0.06, 0.6], [0, 0.72, 0], 'wood', 0.005);
    for (const x of [-0.51, 0.51]) {
      for (const z of [-0.21, 0.21]) {
        box(`mesh_leg_${x}_${z}`, [0.08, 0.69, 0.08], [x, 0.345, z], 'wood');
      }
    }
  } else if (id === 'display-case') {
    box('mesh_cabinet', [1.2, 0.62, 0.5], [0, 0.31, 0], 'frame', 0.006);
    box('mesh_shelf', [1.16, 0.025, 0.46], [0, 0.635, 0]);
    for (const x of [-0.585, 0.585]) {
      for (const z of [-0.235, 0.235]) {
        box(`mesh_post_${x}_${z}`, [0.025, 0.46, 0.025], [x, 0.85, z]);
      }
    }
    const glass: Finish = opaque ? 'glass_opaque' : 'glass';
    for (const z of [-0.244, 0.244]) {
      box(`mesh_glass_${z}`, [1.15, 0.425, 0.008], [0, 0.8645, z], glass);
    }
    for (const x of [-0.575, 0.575]) {
      box(`mesh_glass_side_${x}`, [0.008, 0.425, 0.46], [x, 0.8645, 0], glass);
    }
    box('mesh_glass_top', [1.16, 0.008, 0.48], [0, 1.096, 0], glass);
    for (const z of [-0.235, 0.235]) {
      box(`mesh_top_frame_${z}`, [1.2, 0.018, 0.025], [0, 1.091, z]);
    }
    box('mesh_handle', [0.18, 0.018, 0.012], [0.35, 0.4, 0.244]);
  } else if (id === 'safe') {
    box('mesh_body', [0.6, 0.8, 0.57], [0, 0.4, -0.015], 'metal', 0.012);
    box('mesh_door', [0.51, 0.69, 0.025], [0, 0.4, 0.2775], 'metal', 0.005);
    cylinder('mesh_lock', 0.035, 0.008, [-0.1, 0.49, 0.291], 'metal', 'Z', 12);
    box('mesh_handle', [0.14, 0.027, 0.01], [0.105, 0.41, 0.295], 'metal', 0.003);
    for (const y of [0.19, 0.61]) {
      box(`mesh_hinge_${y}`, [0.025, 0.07, 0.01], [-0.265, y, 0.295], 'metal', 0.002);
    }
  } else if (id === 'pallet') {
    for (let i = 0; i < 5; i++) {
      box(`mesh_board_${i}`, [1.2, 0.035, 0.13], [0, 0.1325, -0.335 + i * 0.1675], 'wood');
    }
    for (const x of [-0.48, 0, 0.48]) {
      box(`mesh_runner_${x}`, [0.14, 0.035, 0.8], [x, 0.0175, 0], 'wood');
      for (const z of [-0.28, 0, 0.28]) {
        box(`mesh_block_${x}_${z}`, [0.14, 0.08, 0.14], [x, 0.075, z], 'wood');
      }
    }
  } else if (id === 'banner-stand') {
    box('mesh_base', [1, 0.045, 0.3], [0, 0.0225, 0]);
    box('mesh_banner_back', [0.95, 1.8, 0.02], [0, 1.1, 0], 'branding');
    for (const x of [-0.46, 0.46]) {
      box(`mesh_post_${x}`, [0.03, 1.9, 0.03], [x, 0.95, -0.025]);
    }
    const surface = recipe.polygon(
      'branding_surface',
      [
        [-0.475, 0.2, 0.013],
        [0.475, 0.2, 0.013],
        [0.475, 2, 0.013],
        [-0.475, 2, 0.013],
      ],
      [[0, 1, 2, 3]],
      'branding',
    );
    const uv = surface.geometry.getAttribute('uv');
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ].forEach(([u = 0, v = 0], i) => uv.setXY(i, u, v));
    for (const [i, width] of [0.4, 0.28, 0.16].entries()) {
      box(`branding_default_${i}`, [width, 0.045, 0.005], [0, 1.38 - i * 0.12, 0.018]);
    }
  } else if (id === 'forklift') {
    box('mesh_chassis', [1.05, 0.55, 1.6], [0, 0.6, -0.425], 'yellow', 0.03);
    box('mesh_counterweight', [1.05, 0.45, 0.4], [0, 0.95, -1.025], 'yellow', 0.025);
    box('mesh_seat', [0.42, 0.14, 0.4], [0, 1.05, -0.4]);
    if (!low) {
      box('mesh_seat_back', [0.42, 0.38, 0.08], [0, 1.23, -0.58], 'frame', 0.015);
      box('mesh_footrest', [0.7, 0.035, 0.45], [0, 0.91, -0.02], 'yellow');
      cylinder('mesh_steering', 0.13, 0.025, [0, 1.35, -0.05], 'frame', 'Y', 16);
      beam('mesh_steering_column', [0, 1.08, 0.02], [0, 1.35, -0.05], 'metal', 0.03);
    }
    for (const x of [-0.53, 0.53]) {
      for (const z of [-0.9, 0.1]) {
        cylinder(`mesh_wheel_${x}_${z}`, 0.3, 0.14, [x, 0.3, z], 'frame', 'X', low ? 8 : 24);
        if (!low) {
          cylinder(
            `mesh_hub_${x}_${z}`,
            0.15,
            0.008,
            [x + Math.sign(x) * 0.066, 0.3, z],
            'metal',
            'X',
            12,
          );
        }
      }
    }
    for (const x of [-0.43, 0.43]) {
      box(`mesh_mast_${x}`, [0.07, 1.9, 0.08], [x, 1.2, 0.48], 'metal', 0.006);
      for (const z of [-0.9, 0.2]) {
        box(`mesh_cab_post_${x}_${z}`, [0.045, 1.25, 0.045], [x, 1.55, z], 'metal');
      }
    }
    box('mesh_carriage', [0.92, 0.18, 0.09], [0, 0.3, 0.5], 'metal');
    box('mesh_roof', [1.1, 0.06, 1.35], [0, 2.17, -0.35], 'yellow', 0.01);
    for (const x of [-0.33, 0.33]) {
      box(`mesh_fork_${x}`, [0.12, 0.07, 1.55], [x, 0.14, 1], 'metal');
      if (!low) {
        box(`mesh_fork_upright_${x}`, [0.12, 0.32, 0.07], [x, 0.265, 0.26], 'metal');
      }
    }
    if (!low) {
      for (const x of [-0.48, 0.48]) {
        box(`mesh_fender_${x}`, [0.16, 0.04, 0.68], [x, 0.66, 0.1], 'yellow', 0.008);
        box(`mesh_work_light_${x}`, [0.1, 0.08, 0.05], [x, 2.04, 0.3], 'metal');
      }
    }
  } else if (id === 'elevator-entrance') {
    for (const x of [-0.9, 0.9]) {
      box(`mesh_frame_${x}`, [0.2, 2.6, 0.3], [x, 1.3, 0], 'metal', 0.006);
    }
    box('mesh_lintel', [1.6, 0.2, 0.3], [0, 2.5, 0], 'metal', 0.006);
    box('mesh_threshold', [1.6, 0.05, 0.3], [0, -0.025, 0], 'metal');
    for (const [name, x] of [
      ['door_left', -0.4],
      ['door_right', 0.4],
    ] as const) {
      const door = box(name, [0.79, 2.4, 0.08], [x, 1.2, -0.06], 'panel', 0.003);
      if (!low) {
        for (const y of [0.4, 0.8, 1.6, 2]) {
          box(`${name}_trim_${y}`, [0.75, 0.012, 0.007], [0, y - 1.2, 0.044], 'metal', 0, door);
        }
      }
    }
    box('mesh_button', [0.08, 0.16, 0.02], [0.9, 1.1, 0.14], 'branding');
    if (!low) {
      box('mesh_indicator', [0.18, 0.045, 0.012], [0, 2.5, 0.143], 'branding');
    }
  } else if (id === 'stairs' || id === 'escalator-entrance') {
    buildFlight(recipe);
  } else {
    throw new Error(`No procedural recipe for ${id}`);
  }
}

function buildFlight(recipe: Recipe) {
  const { id, low } = recipe;
  const escalator = id === 'escalator-entrance';
  const box = recipe.box.bind(recipe),
    beam = recipe.beam.bind(recipe);
  box('mesh_lower_landing', [2, 0.1, 1], [0, -0.05, 0], escalator ? 'metal' : 'frame');
  box('mesh_upper_landing', [2, 0.1, 1], [0, 3.95, -7], escalator ? 'metal' : 'frame');
  if (low) {
    const points: Point3[] = [];
    for (const x of [-1, 1]) {
      for (const [y, z] of [
        [0, -0.5],
        [0, -6.5],
        [4, -6.5],
      ]) {
        points.push([x, y!, z!]);
      }
    }
    recipe.polygon(
      'mesh_flight_low',
      points,
      [
        [0, 2, 1],
        [3, 4, 5],
        [0, 1, 4, 3],
        [1, 2, 5, 4],
        [2, 0, 3, 5],
      ],
      'frame',
    );
  } else {
    const count = escalator ? 24 : 20;
    for (let i = 0; i < count; i++) {
      const rise = (4 * (i + 1)) / count,
        depth = 6 / count,
        z = -0.5 - depth * (i + 0.5);
      box(`mesh_step_${String(i).padStart(2, '0')}`, [2, rise, depth], [0, rise / 2, z]);
      if (escalator) {
        box(
          `mesh_safety_nosing_${i}`,
          [1.75, 0.012, 0.028],
          [0, rise + 0.006, z + depth / 2 - 0.015],
          'yellow',
        );
      }
    }
  }
  for (const x of [-0.93, 0.93]) {
    if (escalator) {
      buildBelt(recipe, x);
      const profile = [
        [0.06, -0.5],
        [4.06, -6.5],
        [4.92, -6.5],
        [0.92, -0.5],
      ];
      const points: Point3[] = [];
      for (const side of [x - 0.035, x + 0.035]) {
        for (const [y, z] of profile) {
          points.push([side, y!, z!]);
        }
      }
      recipe.polygon(
        `mesh_balustrade_${x}`,
        points,
        [
          [0, 3, 2, 1],
          [4, 5, 6, 7],
          [0, 1, 5, 4],
          [1, 2, 6, 5],
          [2, 3, 7, 6],
          [3, 0, 4, 7],
        ],
        'metal',
      );
      for (const [z, y] of [
        [0.25, 0],
        [-7.25, 4],
      ]) {
        box(`mesh_end_casing_${x}_${z}`, [0.12, 0.9, 0.45], [x, y! + 0.45, z!], 'metal');
      }
    } else {
      beam(`mesh_rail_${x}`, [x, 1.02, -0.5], [x, 5.02, -6.5], 'metal', 0.07);
      beam(`mesh_rail_entry_${x}`, [x, 1.02, 0.45], [x, 1.02, -0.5], 'metal', 0.07);
      beam(`mesh_rail_exit_${x}`, [x, 5.02, -6.5], [x, 5.02, -7.45], 'metal', 0.07);
      for (const [index, t] of (low ? [0, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1]).entries()) {
        beam(
          `mesh_post_${x}_${index}`,
          [x, 4 * t, -0.5 - 6 * t],
          [x, 4 * t + 1.02, -0.5 - 6 * t],
          'metal',
          0.05,
        );
      }
    }
  }
  if (escalator) {
    for (const [z, y] of [
      [0, 0],
      [-7, 4],
    ]) {
      box(`mesh_comb_plate_${z}`, [1.75, 0.012, 0.07], [0, y! + 0.006, z!], 'yellow');
    }
  }
}

function buildBelt(recipe: Recipe, x: number) {
  const segments = recipe.low ? 8 : 16;
  const points: Point3[] = [
    [x, 1.02, 0.15],
    [x, 1.02, -0.5],
    [x, 5.02, -6.5],
    [x, 5.02, -7.15],
  ];
  for (let i = 1; i <= segments; i++) {
    const a = (Math.PI * i) / segments;
    points.push([x, 4.705 + 0.315 * Math.cos(a), -7.15 - 0.315 * Math.sin(a)]);
  }
  points.push([x, 4.39, -6.5], [x, 0.39, -0.5], [x, 0.39, 0.15]);
  for (let i = 1; i < segments; i++) {
    const a = (Math.PI * i) / segments;
    points.push([x, 0.705 - 0.315 * Math.cos(a), 0.15 + 0.315 * Math.sin(a)]);
  }
  const radial = recipe.low ? 4 : 8;
  const vertices: Point3[] = [];
  points.forEach((point, i) => {
    const previous = points[(i - 1 + points.length) % points.length]!,
      next = points[(i + 1) % points.length]!;
    const dy = next[1] - previous[1],
      dz = next[2] - previous[2],
      length = Math.hypot(dy, dz);
    for (let j = 0; j < radial; j++) {
      const a = (2 * Math.PI * j) / radial;
      vertices.push([
        point[0] + 0.035 * Math.cos(a),
        point[1] + (0.035 * Math.sin(a) * dz) / length,
        point[2] - (0.035 * Math.sin(a) * dy) / length,
      ]);
    }
  });
  const faces: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < radial; j++) {
      const n = (i + 1) % points.length,
        k = (j + 1) % radial;
      faces.push([i * radial + j, n * radial + j, n * radial + k, i * radial + k]);
    }
  }
  recipe.polygon(`mesh_handrail_belt_${x}`, vertices, faces, 'frame');
}
