import type { Recipe } from './recipe-tools.ts';
import type { Point3 } from './recipe-tools.ts';

/**
 * V2 expansion recipes. Attractive minimalist detail from existing Recipe
 * primitives, sparse bevels, shared material merging. Interface meshes
 * (mesh_branding, door_left/right) keep their names for preservation.
 * All identities are floor-contact, +Z facing; bounds match expansion-metadata.
 */
export function buildExpansionRecipe(recipe: Recipe, _opaque = false) {
  switch (recipe.id) {
    case 'info-desk':
      buildInfoDesk(recipe);
      break;
    case 'podium':
      buildPodium(recipe);
      break;
    case 'queue-rail':
      buildQueueRail(recipe);
      break;
    case 'planter':
      buildPlanter(recipe);
      break;
    case 'bench':
      buildBench(recipe);
      break;
    case 'trash-bin':
      buildTrashBin(recipe);
      break;
    case 'food-kiosk':
      buildFoodKiosk(recipe);
      break;
    case 'washroom-sign':
      buildWashroomSign(recipe);
      break;
    case 'exit-sign':
      buildExitSign(recipe);
      break;
    case 'atm-sign':
      buildAtmSign(recipe);
      break;
    case 'door-single':
      buildDoorSingle(recipe);
      break;
    case 'door-double':
      buildDoorDouble(recipe);
      break;
    case 'ramp':
      buildRamp(recipe);
      break;
    case 'shell-slab':
      buildShellSlab(recipe);
      break;
    case 'shell-column':
      buildShellColumn(recipe);
      break;
    case 'shell-beam':
      buildShellBeam(recipe);
      break;
    case 'shell-facade-panel':
      buildFacadePanel(recipe);
      break;
    case 'shell-curtain-wall':
      buildCurtainWall(recipe);
      break;
    case 'shell-roof-flat':
      buildRoofFlat(recipe);
      break;
    case 'shell-canopy':
      buildCanopy(recipe);
      break;
    case 'parking-bay':
      buildParkingBay(recipe);
      break;
    case 'parking-accessible':
      buildParkingAccessible(recipe);
      break;
    case 'road-segment':
      buildRoadSegment(recipe);
      break;
    case 'crosswalk':
      buildCrosswalk(recipe);
      break;
    case 'ev-charger':
      buildEvCharger(recipe);
      break;
    default:
      throw new Error(`No expansion recipe for ${recipe.id}`);
  }
}

function buildInfoDesk(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_counter', [2.4, 1.05, 0.8], [0, 0.525, 0], 'panel', 0.005);
  box('mesh_counter_top', [2.5, 0.05, 0.9], [0, 1.075, 0], 'wood', 0.005);
  box('mesh_kick', [2.2, 0.08, 0.6], [0, 0.04, 0], 'frame');
  box('mesh_branding', [1.6, 0.3, 0.02], [0, 0.75, 0.41], 'branding');
  box('mesh_led_strip', [2.3, 0.02, 0.02], [0, 0.95, 0.41], 'led');
}

function buildPodium(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_base', [0.5, 0.05, 0.5], [0, 0.025, 0], 'frame');
  box('mesh_column', [0.45, 1.1, 0.4], [0, 0.6, 0], 'panel', 0.004);
  box('mesh_top', [0.6, 0.05, 0.55], [0, 1.175, 0], 'wood', 0.004);
  box('mesh_lip', [0.6, 0.04, 0.03], [0, 1.17, 0.26], 'wood');
}

function buildQueueRail(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  const cylinder = recipe.cylinder.bind(recipe);
  for (const x of [-0.9, 0.9]) {
    box(`mesh_post_${x}`, [0.08, 0.95, 0.08], [x, 0.475, 0], 'metal', 0.005);
    cylinder(`mesh_base_${x}`, 0.15, 0.03, [x, 0.015, 0], 'metal', 'Y', 12);
    box(`mesh_collar_${x}`, [0.1, 0.04, 0.1], [x, 0.9, 0], 'frame');
  }
  box('mesh_belt', [1.72, 0.08, 0.02], [0, 0.85, 0], 'frame');
}

function buildPlanter(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  const cylinder = recipe.cylinder.bind(recipe);
  box('mesh_pot', [1.0, 0.45, 0.5], [0, 0.225, 0], 'stone', 0.01);
  box('mesh_pot_rim', [1.02, 0.04, 0.52], [0, 0.44, 0], 'stone', 0.005);
  box('mesh_soil', [0.9, 0.03, 0.4], [0, 0.465, 0], 'wood');
  cylinder('mesh_trunk', 0.03, 0.3, [0, 0.6, 0], 'wood', 'Y', 8);
  // Deterministic geometric foliage: three axis-aligned crowns.
  box('mesh_crown_low', [0.6, 0.25, 0.4], [0, 0.75, 0], 'panel', 0.02);
  box('mesh_crown_left', [0.4, 0.2, 0.3], [-0.15, 0.9, 0.05], 'panel', 0.02);
  box('mesh_crown_right', [0.35, 0.18, 0.28], [0.18, 0.88, -0.05], 'panel', 0.02);
}

function buildBench(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_seat', [1.8, 0.08, 0.5], [0, 0.41, 0], 'wood', 0.005);
  for (const x of [-0.8, 0.8]) {
    box(`mesh_leg_${x}`, [0.08, 0.37, 0.45], [x, 0.185, 0], 'frame');
  }
  box('mesh_stretcher', [1.52, 0.05, 0.05], [0, 0.1, 0], 'frame');
}

function buildTrashBin(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  const cylinder = recipe.cylinder.bind(recipe);
  box('mesh_foot', [0.4, 0.05, 0.4], [0, 0.025, 0], 'frame');
  cylinder('mesh_body', 0.2, 0.7, [0, 0.4, 0], 'metal', 'Y', 16);
  cylinder('mesh_rim', 0.22, 0.05, [0, 0.775, 0], 'frame', 'Y', 16);
}

function buildFoodKiosk(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_rear', [3.0, 2.6, 0.1], [0, 1.3, -1.05], 'panel', 0.004);
  for (const x of [-1.45, 1.45]) {
    box(`mesh_side_${x}`, [0.1, 2.6, 2.1], [x, 1.3, -0.05], 'panel', 0.004);
  }
  box('mesh_roof', [3.0, 0.15, 2.2], [0, 2.675, 0], 'frame', 0.004);
  box('mesh_branding', [2.6, 0.4, 0.08], [0, 2.4, 1.06], 'branding');
  box('mesh_counter', [2.0, 1.05, 0.15], [-0.5, 0.525, 0.95], 'wood', 0.005);
  box('mesh_shelf', [2.6, 0.05, 0.4], [0, 1.15, -0.8], 'wood');
  box('mesh_menu', [1.2, 0.6, 0.03], [0, 1.7, -0.985], 'panel');
  box('mesh_light', [2.6, 0.03, 0.03], [0, 2.55, 0], 'led');
}

function buildWashroomSign(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_base', [0.4, 0.05, 0.4], [0, 0.025, 0], 'metal');
  box('mesh_post', [0.08, 2.0, 0.08], [0, 1.0, 0], 'metal');
  box('mesh_branding', [0.6, 0.5, 0.06], [0, 1.85, 0], 'branding');
  box('mesh_cap', [0.62, 0.05, 0.08], [0, 2.125, 0], 'frame');
}

function buildExitSign(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_base', [0.4, 0.05, 0.4], [0, 0.025, 0], 'metal');
  box('mesh_post', [0.08, 2.15, 0.08], [0, 1.075, 0], 'metal');
  box('mesh_branding', [0.7, 0.35, 0.06], [0, 1.95, 0], 'branding');
  box('mesh_cap', [0.72, 0.05, 0.08], [0, 2.175, 0], 'frame');
}

function buildAtmSign(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_base', [0.8, 0.1, 0.4], [0, 0.05, 0], 'frame');
  box('mesh_body', [0.7, 1.8, 0.3], [0, 1.0, 0], 'panel', 0.005);
  box('mesh_cap', [0.8, 0.1, 0.4], [0, 1.95, 0], 'frame', 0.003);
  box('mesh_branding', [0.6, 0.3, 0.02], [0, 1.6, 0.16], 'branding');
}

function buildDoorSingle(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_jamb_left', [0.2, 2.2, 0.25], [-0.6, 1.1, 0], 'frame', 0.004);
  box('mesh_jamb_right', [0.2, 2.2, 0.25], [0.6, 1.1, 0], 'frame', 0.004);
  box('mesh_lintel', [1.4, 0.2, 0.25], [0, 2.2, 0], 'frame', 0.004);
  box('mesh_threshold', [1.0, 0.02, 0.25], [0, 0.01, 0], 'metal');
  // Leaf swung open against the jamb keeps the 1.0 m passage visually clear.
  box('door_left', [0.05, 2.05, 0.95], [-0.45, 1.05, 0.5], 'wood', 0.003);
}

function buildDoorDouble(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_jamb_left', [0.25, 2.2, 0.3], [-0.975, 1.1, 0], 'frame', 0.004);
  box('mesh_jamb_right', [0.25, 2.2, 0.3], [0.975, 1.1, 0], 'frame', 0.004);
  box('mesh_lintel', [2.2, 0.2, 0.3], [0, 2.3, 0], 'frame', 0.004);
  box('mesh_threshold', [1.7, 0.02, 0.3], [0, 0.01, 0], 'metal');
  box('door_left', [0.05, 2.05, 0.8], [-0.8, 1.05, 0.5], 'wood', 0.003);
  box('door_right', [0.05, 2.05, 0.8], [0.8, 1.05, 0.5], 'wood', 0.003);
}

function buildRamp(recipe: Recipe) {
  // Solid wedge: bottom flat at Y=0, deck slopes 0.05 (low, +Z) to 0.6 (high, -Z).
  const points: Point3[] = [
    [-0.75, 0, -2],
    [0.75, 0, -2],
    [0.75, 0, 2],
    [-0.75, 0, 2],
    [-0.75, 0.6, -2],
    [0.75, 0.6, -2],
    [0.75, 0.05, 2],
    [-0.75, 0.05, 2],
  ];
  const quads: number[][] = [
    [3, 2, 1, 0],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  // Double winding guarantees an outward front face without extra helpers.
  const faces = [...quads, ...quads.map((q) => [...q].reverse())];
  recipe.polygon('mesh_wedge', points, faces, 'panel');
  const box = recipe.box.bind(recipe);
  box('mesh_nosing_low', [1.5, 0.012, 0.1], [0, 0.044, 1.9], 'yellow');
  box('mesh_nosing_high', [1.5, 0.012, 0.1], [0, 0.594, -1.9], 'yellow');
}

function buildShellSlab(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_slab', [6, 0.12, 6], [0, 0.06, 0], 'stone', 0.003);
  box('mesh_joint_x', [6, 0.004, 0.02], [0, 0.118, 0], 'frame');
  box('mesh_joint_z', [0.02, 0.004, 6], [0, 0.118, 0], 'frame');
}

function buildShellColumn(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_base', [0.5, 0.1, 0.5], [0, 0.05, 0], 'stone', 0.005);
  box('mesh_shaft', [0.35, 2.8, 0.35], [0, 1.5, 0], 'stone', 0.005);
  box('mesh_cap', [0.5, 0.1, 0.5], [0, 2.95, 0], 'stone', 0.005);
}

function buildShellBeam(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  for (const x of [-2.85, 2.85]) {
    box(`mesh_column_${x}`, [0.3, 3.0, 0.3], [x, 1.5, 0], 'stone', 0.005);
    box(`mesh_corbel_${x}`, [0.3, 0.2, 0.3], [x, 2.7, 0], 'stone');
  }
  box('mesh_beam', [6.0, 0.4, 0.3], [0, 3.0, 0], 'stone', 0.005);
}

function buildFacadePanel(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_wall', [4.0, 2.8, 0.18], [0, 1.4, 0], 'panel', 0.004);
  box('mesh_parapet', [4.0, 0.2, 0.2], [0, 2.9, 0], 'panel', 0.004);
  for (const x of [-1, 0, 1]) {
    box(`mesh_reveal_${x}`, [0.02, 2.6, 0.02], [x, 1.4, 0.09], 'bronze');
  }
  box('mesh_branding', [2.0, 0.4, 0.02], [0, 2.3, 0.09], 'branding');
}

function buildCurtainWall(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_sill', [4.0, 0.15, 0.15], [0, 0.075, 0], 'frame');
  box('mesh_head', [4.0, 0.15, 0.15], [0, 2.925, 0], 'frame');
  for (const x of [-1.94, 1.94]) {
    box(`mesh_jamb_${x}`, [0.12, 2.7, 0.15], [x, 1.5, 0], 'frame');
  }
  for (const x of [-0.95, 0, 0.95]) {
    box(`mesh_mullion_${x}`, [0.08, 2.7, 0.1], [x, 1.5, 0], 'metal');
  }
  for (const x of [-1.425, -0.475, 0.475, 1.425]) {
    box(`mesh_glass_${x}`, [0.85, 2.7, 0.02], [x, 1.5, 0], 'glass');
  }
}

function buildRoofFlat(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  for (const x of [-2.7, 2.7]) {
    for (const z of [-2.7, 2.7]) {
      box(`mesh_column_${x}_${z}`, [0.3, 3.0, 0.3], [x, 1.5, z], 'stone', 0.005);
    }
  }
  box('mesh_roof', [6.0, 0.2, 6.0], [0, 3.1, 0], 'panel', 0.004);
  for (const z of [-2.97, 2.97]) {
    box(`mesh_trim_${z}`, [6.0, 0.08, 0.06], [0, 3.05, z], 'panel');
  }
}

function buildCanopy(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  for (const x of [-1.75, 1.75]) {
    box(`mesh_post_${x}`, [0.25, 2.8, 0.25], [x, 1.4, 0.8], 'metal', 0.005);
  }
  box('mesh_roof', [4.0, 0.15, 2.0], [0, 2.875, 0], 'panel', 0.004);
  for (const x of [-1, 0, 1]) {
    box(`mesh_purlin_${x}`, [0.08, 0.1, 2.0], [x, 2.75, 0], 'panel');
  }
  box('mesh_branding', [3.0, 0.3, 0.04], [0, 2.6, 0.98], 'branding');
}

function buildParkingBay(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_asphalt', [2.5, 0.02, 5.0], [0, 0.01, 0], 'floor');
  for (const x of [-1.2, 1.2]) {
    box(`mesh_line_${x}`, [0.1, 0.01, 5.0], [x, 0.025, 0], 'panel');
  }
  box('mesh_stop', [2.3, 0.01, 0.15], [0, 0.025, -2.4], 'panel');
}

function buildParkingAccessible(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_asphalt', [3.5, 0.02, 5.0], [0, 0.01, 0], 'floor');
  for (const x of [-1.7, 1.7]) {
    box(`mesh_line_${x}`, [0.1, 0.01, 5.0], [x, 0.025, 0], 'panel');
  }
  box('mesh_aisle', [1.0, 0.008, 4.8], [1.15, 0.024, 0], 'branding');
  for (const [i, z] of [-2, -1.2, -0.4, 0.4, 1.2, 2].entries()) {
    box(`mesh_hatch_${i}`, [1.0, 0.004, 0.1], [1.15, 0.028, z], 'panel');
  }
  box('mesh_symbol', [0.9, 0.004, 0.9], [-0.6, 0.028, 0], 'panel');
}

function buildRoadSegment(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_asphalt', [6.0, 0.02, 12.0], [0, 0.01, 0], 'floor');
  for (const z of [-5, -3, -1, 1, 3, 5]) {
    box(`mesh_dash_${z}`, [0.15, 0.01, 1.2], [0, 0.025, z], 'panel');
  }
  for (const x of [-2.8, 2.8]) {
    box(`mesh_edge_${x}`, [0.12, 0.01, 12.0], [x, 0.025, 0], 'panel');
  }
}

function buildCrosswalk(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_asphalt', [3.0, 0.02, 6.0], [0, 0.01, 0], 'floor');
  for (const z of [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
    box(`mesh_stripe_${z}`, [2.6, 0.01, 0.5], [0, 0.025, z], 'panel');
  }
}

function buildEvCharger(recipe: Recipe) {
  const box = recipe.box.bind(recipe);
  box('mesh_base', [0.6, 0.08, 0.4], [0, 0.04, 0], 'frame');
  box('mesh_body', [0.6, 1.3, 0.35], [0, 0.73, 0], 'panel', 0.005);
  box('mesh_head', [0.7, 0.12, 0.45], [0, 1.44, 0], 'frame', 0.004);
  box('mesh_branding', [0.4, 0.3, 0.02], [0, 1.1, 0.185], 'branding');
  box('mesh_status', [0.3, 0.03, 0.02], [0, 1.35, 0.185], 'led');
}
