import { z } from 'zod';
import { boothDesignSchema } from './booth-schema.ts';
import { circulationDesignSchema } from './circulation-schema.ts';
import { fitCirculation, isCirculation } from './circulation.ts';
import { objectSchema, recipes, type PlanObject, type RecipeId } from './types.ts';

const dimension = z.number().finite().min(0.1).max(1000);
const dimensions = z.tuple([dimension, dimension, dimension]);
export const inventoryRecipeSchema = z
  .object({
    id: z.enum(recipes),
    name: z.string().trim().min(1),
    category: z.enum(['Booths', 'Connections', 'Structures', 'Amenities', 'Furniture']),
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
  },
  {
    id: 'polygon-booth',
    name: 'Polygon booth',
    category: 'Booths',
    dimensions: [4, 2.6, 3],
    collidable: true,
    color: '#334155',
  },
  {
    id: 'stairs',
    name: 'Stairs',
    category: 'Connections',
    dimensions: [2, 3, 7.48],
    collidable: true,
    color: '#a6b1c2',
  },
  {
    id: 'elevator',
    name: 'Elevator',
    category: 'Connections',
    dimensions: [2.5, 3, 2.5],
    collidable: true,
    color: '#b4c0cd',
  },
  {
    id: 'escalator',
    name: 'Escalator',
    category: 'Connections',
    dimensions: [2, 3, 3 / Math.tan(Math.PI / 6) + 2],
    collidable: true,
    color: '#94a3b8',
  },
  {
    id: 'ramp',
    name: 'Accessible ramp',
    category: 'Connections',
    dimensions: [2, 0.5, 9],
    collidable: true,
    color: '#c4cccf',
  },
  {
    id: 'barn-tent',
    name: 'Barn tent',
    category: 'Structures',
    dimensions: [5, 3.5, 4],
    collidable: true,
    color: '#e4d5bc',
  },
  {
    id: 'entrance',
    name: 'Entrance',
    category: 'Structures',
    dimensions: [4.8, 3, 0.6],
    collidable: true,
    color: '#87cdb9',
  },
  {
    id: 'washroom-men',
    name: 'Men’s washroom',
    category: 'Amenities',
    dimensions: [3, 2.8, 3],
    collidable: true,
    color: '#F8F9FA',
  },
  {
    id: 'washroom-women',
    name: 'Women’s washroom',
    category: 'Amenities',
    dimensions: [3, 2.8, 3],
    collidable: true,
    color: '#F8F9FA',
  },
  {
    id: 'kids-zone',
    name: 'Kids zone',
    category: 'Amenities',
    dimensions: [5, 0.3, 4],
    collidable: true,
    color: '#c4d690',
  },
  {
    id: 'avatar',
    name: 'Standing person',
    category: 'Amenities',
    dimensions: [0.65, 1.8, 0.65],
    collidable: false,
    color: '#9ac8d8',
  },
  {
    id: 'information',
    name: 'Information desk',
    category: 'Amenities',
    dimensions: [2, 2.4, 1],
    collidable: true,
    color: '#dfceb1',
  },
  {
    id: 'food-kiosk',
    name: 'Food kiosk',
    category: 'Amenities',
    dimensions: [3, 2.6, 2],
    collidable: true,
    color: '#d8b594',
  },
  {
    id: 'water',
    name: 'Drinking water',
    category: 'Amenities',
    dimensions: [0.6, 1.2, 0.6],
    collidable: true,
    color: '#8ebbd5',
  },
  {
    id: 'first-aid',
    name: 'First aid',
    category: 'Amenities',
    dimensions: [2, 2, 2],
    collidable: true,
    color: '#e5c0b9',
  },
  {
    id: 'exit',
    name: 'Emergency exit',
    category: 'Amenities',
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
    dimensions: [1.5, 0.75, 1],
    collidable: true,
    color: '#c6b99d',
  },
  {
    id: 'barrier',
    name: 'Queue barrier',
    category: 'Furniture',
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
export const inventory: InventoryRecipe[] = definitions.map((definition) =>
  inventoryRecipeSchema.parse(
    Object.assign({}, definition, {
      renderer: definition.id,
      minDimensions: [0.1, 0.1, 0.1] as [number, number, number],
      maxDimensions: [1000, 1000, 1000] as [number, number, number],
      material: {
        roughness: definition.id === 'barn-tent' ? 0.85 : 0.65,
        metalness: definition.category === 'Connections' ? 0.15 : 0,
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
export function createObject(
  recipe: RecipeId,
  position: [number, number],
  others: PlanObject[] = [],
  names = others.map((object) => object.name),
): PlanObject {
  const definition = inventory.find((item) => item.id === recipe) ?? inventory[0]!;
  const [width, , depth] = definition.dimensions;
  const polygon = rectangle(width, depth);
  return fitCirculation(
    objectSchema.parse({
      id: crypto.randomUUID(),
      recipe,
      name: uniqueName(definition.name, names),
      position,
      yawRadians: 0,
      scale: [1, 1, 1],
      dimensions: definition.dimensions,
      collidable: definition.collidable,
      polygon,
      boothDesign: recipe.includes('booth')
        ? boothDesignSchema.parse({ clearance: recipe === 'polygon-booth' ? 0.15 : 0.1 })
        : undefined,
      circulationDesign: isCirculation(recipe) ? circulationDesignSchema.parse({}) : undefined,
      boothNumber: uniqueName(
        'B001',
        others.map((o) => o.boothNumber),
      ),
      color: definition.color,
      gender: recipe === 'washroom-men' ? 'men' : recipe === 'washroom-women' ? 'women' : 'unisex',
      roughness: definition.material.roughness,
      metalness: definition.material.metalness,
      colorMode: recipe.includes('booth') ? 'surface' : 'explicit',
    }),
  );
}
