import { z } from 'zod';
import { boothDesignSchema } from './booth-schema.ts';
import { circulationDesignSchema } from './circulation-schema.ts';
import { parkingDesignSchema } from './parking-schema.ts';
import { fitCirculation, isCirculation } from './circulation.ts';
import {
  isBooth,
  objectSchema,
  planDocumentTypeSchema,
  recipes,
  type PlanDocumentType,
  type PlanObject,
  type RecipeId,
} from './types.ts';

const dimension = z.number().finite().min(0.1).max(1000);
const dimensions = z.tuple([dimension, dimension, dimension]);
export const inventoryRecipeSchema = z
  .object({
    id: z.enum(recipes),
    name: z.string().trim().min(1),
    documentType: planDocumentTypeSchema.optional(),
    // Keep legacy labels in the accepted type for the legacy editor shell while inventory records
    // move to the six current product categories below.
    category: z.enum([
      'Booths',
      'Structure',
      'Furniture',
      'Services',
      'Navigation',
      'Connectors',
      'Connections',
      'Structures',
      'Amenities',
    ]),
    dimensions,
    collidable: z.boolean(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    renderer: z.enum(recipes),
    minDimensions: dimensions,
    maxDimensions: dimensions,
    material: z.object({
      roughness: z.number().finite().min(0).max(1),
      metalness: z.number().finite().min(0).max(1),
    }),
  })
  .refine(
    (recipe) =>
      recipe.id === recipe.renderer &&
      recipe.dimensions.every(
        (value, axis) =>
          value >= recipe.minDimensions[axis]! && value <= recipe.maxDimensions[axis]!,
      ),
    'Recipe dimensions must respect their limits and bind the matching procedural renderer.',
  );
export type InventoryRecipe = z.infer<typeof inventoryRecipeSchema>;
const definitions: Omit<
  InventoryRecipe,
  'renderer' | 'minDimensions' | 'maxDimensions' | 'material'
>[] = [
  {
    id: 'booth',
    name: 'Standard booth',
    category: 'Booths',
    dimensions: [3, 2.6, 3],
    collidable: true,
    color: '#334155',
    documentType: 'booth',
  },
  {
    id: 'polygon-booth',
    name: 'Polygon booth',
    category: 'Booths',
    dimensions: [4, 2.6, 3],
    collidable: true,
    color: '#334155',
    documentType: 'booth',
  },
  {
    id: 'show-office',
    name: 'Show office',
    category: 'Structure',
    dimensions: [6, 2.8, 4],
    collidable: true,
    color: '#d7d9d4',
    documentType: 'structure',
  },
  {
    id: 'shipping',
    name: 'Shipping',
    category: 'Services',
    dimensions: [8, 0.1, 5],
    collidable: false,
    color: '#b8c9c2',
    documentType: 'area',
  },
  {
    id: 'wash-rack',
    name: 'Wash rack',
    category: 'Services',
    dimensions: [4, 0.1, 3],
    collidable: false,
    color: '#9fc6d8',
    documentType: 'area',
  },
  {
    id: 'parking-lot',
    name: 'Parking lot',
    category: 'Services',
    dimensions: [36, 0.1, 28],
    collidable: false,
    color: '#777e82',
    documentType: 'area',
  },
  {
    id: 'food-truck',
    name: 'Food truck',
    category: 'Services',
    dimensions: [5, 2.8, 2.4],
    collidable: true,
    color: '#d8873d',
    documentType: 'asset',
  },
  {
    id: 'dining',
    name: 'Dining',
    category: 'Services',
    dimensions: [8, 0.1, 6],
    collidable: false,
    color: '#decda7',
    documentType: 'area',
  },
  {
    id: 'stairs',
    name: 'Stairs',
    category: 'Connectors',
    dimensions: [2, 3, 7.48],
    collidable: true,
    color: '#a6b1c2',
  },
  {
    id: 'elevator',
    name: 'Elevator',
    category: 'Connectors',
    dimensions: [2.5, 3, 2.5],
    collidable: true,
    color: '#b4c0cd',
  },
  {
    id: 'escalator',
    name: 'Escalator',
    category: 'Connectors',
    dimensions: [2, 3, 3 / Math.tan(Math.PI / 6) + 2],
    collidable: true,
    color: '#94a3b8',
  },
  {
    id: 'ramp',
    name: 'Accessible ramp',
    category: 'Connectors',
    dimensions: [2, 0.5, 9],
    collidable: true,
    color: '#c4cccf',
  },
  {
    id: 'barn-tent',
    name: 'Barn tent',
    category: 'Structure',
    dimensions: [5, 3.5, 4],
    collidable: true,
    color: '#e4d5bc',
  },
  {
    id: 'entrance',
    name: 'Entrance',
    category: 'Structure',
    dimensions: [4.8, 3, 0.6],
    collidable: true,
    color: '#87cdb9',
  },
  {
    id: 'washroom-men',
    name: 'Men’s washroom',
    category: 'Services',
    dimensions: [3, 2.8, 3],
    collidable: true,
    color: '#F8F9FA',
  },
  {
    id: 'washroom-women',
    name: 'Women’s washroom',
    category: 'Services',
    dimensions: [3, 2.8, 3],
    collidable: true,
    color: '#F8F9FA',
  },
  {
    id: 'kids-zone',
    name: 'Kids zone',
    category: 'Services',
    dimensions: [5, 0.3, 4],
    collidable: true,
    color: '#c4d690',
  },
  {
    id: 'avatar',
    name: 'Standing person',
    category: 'Navigation',
    dimensions: [0.65, 1.8, 0.65],
    collidable: false,
    color: '#9ac8d8',
  },
  {
    id: 'information',
    name: 'Information desk',
    category: 'Navigation',
    dimensions: [2, 2.4, 1],
    collidable: true,
    color: '#dfceb1',
  },
  {
    id: 'food-kiosk',
    name: 'Food kiosk',
    category: 'Services',
    dimensions: [3, 2.6, 2],
    collidable: true,
    color: '#d8b594',
  },
  {
    id: 'water',
    name: 'Drinking water',
    category: 'Services',
    dimensions: [0.8, 1.2, 0.7],
    collidable: true,
    color: '#8ebbd5',
  },
  {
    id: 'first-aid',
    name: 'First aid',
    category: 'Services',
    dimensions: [2, 2, 2],
    collidable: true,
    color: '#e5c0b9',
  },
  {
    id: 'exit',
    name: 'Emergency exit',
    category: 'Navigation',
    dimensions: [1.5, 2.4, 0.4],
    collidable: true,
    color: '#9fceaa',
  },
  {
    id: 'bench',
    name: 'Bench',
    category: 'Furniture',
    dimensions: [2, 0.85, 0.65],
    collidable: true,
    color: '#b7a386',
  },
  {
    id: 'table',
    name: 'Table',
    category: 'Furniture',
    dimensions: [1.5, 1.1, 1],
    collidable: true,
    color: '#c6b99d',
  },
  {
    id: 'chair',
    name: 'Chair',
    category: 'Furniture',
    dimensions: [0.5, 0.85, 0.5],
    collidable: true,
    color: '#8a94a0',
  },
  {
    id: 'barrier',
    name: 'Queue barrier',
    category: 'Structure',
    dimensions: [2, 1, 0.3],
    collidable: true,
    color: '#adb6c0',
  },
  {
    id: 'planter',
    name: 'Planter',
    category: 'Furniture',
    dimensions: [0.8, 1.3, 0.8],
    collidable: true,
    color: '#9ab594',
  },
  {
    id: 'bin',
    name: 'Waste bin',
    category: 'Furniture',
    dimensions: [0.6, 0.9, 0.6],
    collidable: true,
    color: '#9ba8b0',
  },
];
export const inventory: InventoryRecipe[] = definitions
  .filter((definition) => definition.id !== 'booth' && definition.id !== 'polygon-booth')
  .map((definition) =>
  inventoryRecipeSchema.parse(
    Object.assign({}, definition, {
      renderer: definition.id,
      minDimensions: [0.1, 0.1, 0.1] as [number, number, number],
      maxDimensions: [1000, 1000, 1000] as [number, number, number],
      material: {
        roughness: definition.id === 'barn-tent' ? 0.85 : 0.65,
        metalness: definition.category === 'Connectors' ? 0.15 : 0,
      },
    }),
  ),
);
export function rectangle(width: number, depth: number): [number, number][] {
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
}
export function uniqueName(proposed: string, names: string[]): string {
  const keys = new Set(names.map((name) => name.trim().toLowerCase()));
  const base = proposed.trim() || 'Untitled';
  let candidate = base;
  for (let n = 2; keys.has(candidate.toLowerCase()); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}
/**
 * Derive the next booth label entirely from the current document, so undo/import/delete stay deterministic.
 *
 * The series continues from the numerically greatest label on the floor, never from the last
 * label in array order: an import or a reorder must not restart the count. The prefix and the
 * digit width of that label are preserved (L10 -> L11, C62 -> C63), and B001 is used when the
 * floor has no numbered booth yet.
 */
export function nextBoothNumber(objects: PlanObject[], reserved: string[] = []): string {
  const candidates = objects
    .filter(isBooth)
    .map((object, index) => {
      const value = object.boothNumber.trim();
      const match = /^(.*?)(\d+)$/.exec(value);
      return match
        ? {
            prefix: match[1]!,
            digits: match[2]!,
            value: BigInt(match[2]!),
            width: match[2]!.length,
            index,
          }
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);
  const greatest = candidates.reduce<(typeof candidates)[number] | null>((best, candidate) => {
    if (!best) {
      return candidate;
    }
    if (candidate.value > best.value) {
      return candidate;
    }
    // Equal values keep the later entry so a freshly duplicated label still advances.
    return candidate.value === best.value && candidate.index > best.index ? candidate : best;
  }, null);
  const prefix = greatest?.prefix ?? 'B';
  const width = greatest?.width ?? 3;
  let suffix = (greatest?.value ?? 0n) + 1n;
  const used = new Set([
    ...objects.filter(isBooth).map((object) => object.boothNumber.trim().toLowerCase()),
    ...reserved.map((number) => number.trim().toLowerCase()),
  ]);
  let candidate = `${prefix}${String(suffix).padStart(width, '0')}`;
  while (used.has(candidate.toLowerCase())) {
    suffix += 1n;
    candidate = `${prefix}${String(suffix).padStart(width, '0')}`;
  }
  return candidate;
}
export function createObject(
  recipe: RecipeId,
  position: [number, number],
  others: PlanObject[] = [],
  names = others.map((object) => object.name),
): PlanObject {
  const definition = definitions.find((item) => item.id === recipe) ?? inventory[0]!;
  const [width, , depth] = definition.dimensions;
  const polygon = rectangle(width, depth);
  const documentType: PlanDocumentType = definition.documentType ?? 'asset';
  const shellDesign =
    recipe === 'booth'
      ? boothDesignSchema.parse({ layout: 'enclosed', clearance: 0.1 })
      : recipe === 'polygon-booth'
        ? boothDesignSchema.parse({ layout: 'enclosed', clearance: 0.15 })
        : recipe === 'show-office'
          ? boothDesignSchema.parse({ layout: 'enclosed' })
          : undefined;
  return fitCirculation(
    objectSchema.parse({
      id: crypto.randomUUID(),
      recipe,
      documentType,
      name: uniqueName(definition.name, names),
      position,
      yawRadians: 0,
      scale: [1, 1, 1],
      dimensions: definition.dimensions,
      collidable: definition.collidable,
      polygon,
      boothDesign: shellDesign,
      circulationDesign: isCirculation(recipe) ? circulationDesignSchema.parse({}) : undefined,
      parkingDesign: recipe === 'parking-lot' ? parkingDesignSchema.parse({}) : undefined,
      boothNumber: documentType === 'booth' ? nextBoothNumber(others) : '',
      color: definition.color,
      gender: recipe === 'washroom-men' ? 'men' : recipe === 'washroom-women' ? 'women' : 'unisex',
      roughness: definition.id === 'barn-tent' ? 0.85 : 0.65,
      metalness: definition.category === 'Connectors' ? 0.15 : 0,
      colorMode: documentType === 'booth' ? 'surface' : 'explicit',
    }),
  );
}
