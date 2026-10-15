import { polygonBounds, transformFootprint } from '@/utils/geometry/polygon.ts';
import { DEFAULT_CIRCULATION } from './circulation-schema.ts';
import type { PlanObject, PlanFloor, PlanDocument, RecipeId } from './types.ts';

export const isCirculation = (recipe: RecipeId) =>
  ['stairs', 'elevator', 'escalator', 'ramp'].includes(recipe);
export const circulationDesign = (object: Pick<PlanObject, 'circulationDesign'>) =>
  object.circulationDesign ?? DEFAULT_CIRCULATION;
export interface CirculationSpan {
  x: number;
  from: number;
  to: number;
  y0: number;
  y1: number;
  width: number;
  steps: number;
}
export interface Landing {
  id: string;
  localPosition: [number, number, number];
  facingYaw: number;
  clearZone: [number, number];
}
export function circulationMetrics(object: PlanObject) {
  const design = circulationDesign(object),
    [width, rise, depth] = object.dimensions;
  const landing = object.recipe === 'escalator' ? 1 : design.landingLength;
  const flights =
    object.recipe === 'ramp'
      ? design.layout === 'switchback'
        ? 2
        : Math.max(1, Math.ceil(rise / 0.76))
      : design.layout === 'switchback'
        ? 2
        : 1;
  const risers = Math.max(2, object.steps);
  const count = Math.max(1, risers - flights);
  const run =
    object.recipe === 'elevator'
      ? 0
      : object.recipe === 'escalator'
        ? depth - 2
        : design.layout === 'switchback'
          ? object.recipe === 'stairs' && design.autoSize
            ? (risers - 2) * design.going
            : 2 * (depth - 2 * landing)
          : depth - (flights + 1) * landing;
  const clearWidth =
    design.role !== 'upper' &&
    design.layout === 'switchback' &&
    object.recipe !== 'elevator' &&
    object.recipe !== 'escalator'
      ? (width - 0.2) / 2
      : width;
  return {
    width,
    rise,
    depth,
    landing,
    flights,
    risers,
    run,
    clearWidth,
    riser: rise / risers,
    going: run / count,
    pitch: (Math.atan2(rise, run) * 180) / Math.PI,
    ratio: run / rise,
    shaftHeight: rise + 2.6,
    accessible: object.recipe === 'elevator' || object.recipe === 'ramp',
  };
}
export function fitCirculation(object: PlanObject): PlanObject {
  if (
    !isCirculation(object.recipe) ||
    !object.circulationDesign ||
    object.circulationDesign.role === 'upper'
  ) {
    return object;
  }
  const design = object.circulationDesign;
  const [, rise] = object.dimensions,
    landing = design.landingLength;
  const width =
    design.layout === 'switchback' && ['stairs', 'ramp'].includes(object.recipe)
      ? 2 * design.clearWidth + 0.2
      : design.clearWidth;
  let { steps } = object;
  let [, , depth] = object.dimensions;
  if (object.recipe === 'elevator') {
    return object;
  }
  if (!design.autoSize) {
    return object;
  }
  if (object.recipe === 'stairs') {
    steps = Math.max(2, Math.ceil(rise / 0.178));
    const flights = design.layout === 'switchback' ? 2 : 1;
    const run = (steps - flights) * design.going;
    depth =
      design.layout === 'switchback'
        ? Math.ceil((steps - flights) / 2) * design.going + 2 * landing
        : run + 2 * landing;
  } else if (object.recipe === 'escalator') {
    depth = rise / Math.tan(Math.PI / 6) + 2;
  } else {
    const flights = design.layout === 'switchback' ? 2 : Math.max(1, Math.ceil(rise / 0.76));
    depth =
      design.layout === 'switchback'
        ? (rise * design.slopeRatio) / 2 + 2 * landing
        : rise * design.slopeRatio + (flights + 1) * landing;
  }
  return {
    ...object,
    steps,
    dimensions: [width, rise, depth],
    polygon: [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ],
  };
}
export function circulationSpans(object: PlanObject): CirculationSpan[] {
  const design = circulationDesign(object),
    m = circulationMetrics(object),
    spans: CirculationSpan[] = [];
  if (object.recipe === 'elevator' || design.role === 'upper') {
    return spans;
  }
  if (object.recipe === 'escalator') {
    return [
      {
        x: 0,
        from: m.depth / 2 - 1,
        to: -m.depth / 2 + 1,
        y0: 0,
        y1: m.rise,
        width: m.width,
        steps: Math.ceil(m.run / 0.4),
      },
    ];
  }
  if (design.layout === 'switchback') {
    const first = Math.ceil(m.risers / 2),
      second = m.risers - first;
    const midY = object.recipe === 'stairs' ? first * m.riser : m.rise / 2;
    const firstRun =
      object.recipe === 'stairs' && design.autoSize
        ? (first - 1) * design.going
        : m.depth - 2 * m.landing;
    const secondRun =
      object.recipe === 'stairs' && design.autoSize
        ? (second - 1) * design.going
        : m.depth - 2 * m.landing;
    spans.push({
      x: -(m.clearWidth + 0.2) / 2,
      from: m.depth / 2 - m.landing,
      to: m.depth / 2 - m.landing - firstRun,
      y0: 0,
      y1: midY,
      width: m.clearWidth,
      steps: first,
    });
    spans.push({
      x: (m.clearWidth + 0.2) / 2,
      from: -m.depth / 2 + m.landing,
      to: -m.depth / 2 + m.landing + secondRun,
      y0: midY,
      y1: m.rise,
      width: m.clearWidth,
      steps: second,
    });
  } else {
    const run = (m.depth - (m.flights + 1) * m.landing) / m.flights;
    for (let i = 0; i < m.flights; i++) {
      spans.push({
        x: 0,
        from: m.depth / 2 - m.landing - i * (run + m.landing),
        to: m.depth / 2 - m.landing - i * (run + m.landing) - run,
        y0: (m.rise * i) / m.flights,
        y1: (m.rise * (i + 1)) / m.flights,
        width: m.width,
        steps: m.risers,
      });
    }
  }
  return spans;
}
export function circulationLandings(object: PlanObject): Landing[] {
  const m = circulationMetrics(object),
    design = circulationDesign(object);
  if (object.recipe === 'elevator') {
    return [0, m.rise].map((y, index) => ({
      id: index === 0 ? 'elevator_lower_landing' : 'elevator_upper_landing',
      localPosition: [0, y, m.depth / 2 + 0.75] as [number, number, number],
      facingYaw: 0,
      clearZone: [1.5, 1.5] as [number, number],
    }));
  }
  const lowerX = design.layout === 'switchback' ? -(m.clearWidth + 0.2) / 2 : 0;
  const upperX = design.layout === 'switchback' ? (m.clearWidth + 0.2) / 2 : 0;
  const upperZ =
    design.layout === 'switchback' ? m.depth / 2 - m.landing / 2 : -m.depth / 2 + m.landing / 2;
  return [
    {
      id: 'bottom_landing',
      localPosition: [lowerX, 0, m.depth / 2 - m.landing / 2],
      facingYaw: 0,
      clearZone: [m.clearWidth, m.landing],
    },
    {
      id: 'top_landing',
      localPosition: [upperX, m.rise, upperZ],
      facingYaw: design.layout === 'switchback' ? 0 : Math.PI,
      clearZone: [m.clearWidth, m.landing],
    },
  ];
}
export function circulationHeight(object: PlanObject) {
  if (circulationDesign(object).role === 'upper') {
    return 1.05 * object.scale[1];
  }
  return (
    (object.recipe === 'elevator'
      ? object.dimensions[1] + 2.6
      : object.dimensions[1] +
        (object.handrails ? (object.recipe === 'ramp' ? 0.92 : 1.05) : 0.08)) * object.scale[1]
  );
}
export function circulationApproaches(object: PlanObject): [number, number][][] {
  if (!object.circulationDesign || object.legacyPortalLanding) {
    return [];
  }
  const m = circulationMetrics(object),
    { role } = object.circulationDesign;
  const front =
    role === 'lower' ||
    object.recipe === 'elevator' ||
    object.circulationDesign.layout === 'switchback';
  const edge = front ? m.depth / 2 : -m.depth / 2;
  const sign = front ? 1 : -1,
    length = 1.5;
  const w = object.recipe === 'elevator' ? 1.5 : m.clearWidth;
  const x =
    role === 'lower' && object.circulationDesign.layout === 'switchback'
      ? -(m.clearWidth + 0.2) / 2
      : 0;
  const points: [number, number][] = [
    [x - w / 2, edge],
    [x + w / 2, edge],
    [x + w / 2, edge + sign * length],
    [x - w / 2, edge + sign * length],
  ];
  return [
    transformFootprint(
      points.map(([px, pz]) => [px * object.scale[0], pz * object.scale[2]]),
      object.position,
      object.yawRadians,
    ),
  ];
}
export function circulationEntry(object: PlanObject): [number, number] {
  const [polygon] = circulationApproaches(object);
  if (!polygon) {
    return object.position;
  }
  return polygon.reduce<[number, number]>(
    (sum, point) => [sum[0] + point[0] / 4, sum[1] + point[1] / 4],
    [0, 0],
  );
}
export function circulationError(object: PlanObject): string | null {
  if (!object.circulationDesign || !isCirculation(object.recipe) || object.legacyPortalLanding) {
    return null;
  }
  const m = circulationMetrics(object),
    design = object.circulationDesign;
  if (
    object.polygon.length !== 4 ||
    object.polygon.some(
      ([x, z]) =>
        Math.abs(Math.abs(x) - m.width / 2) > 1e-5 || Math.abs(Math.abs(z) - m.depth / 2) > 1e-5,
    )
  ) {
    return 'Connector footprint must match its rectangular construction dimensions.';
  }
  if (design.role === 'upper') {
    return m.width < 1.2 || m.depth < 1.5
      ? 'A connector landing requires at least 1.2 × 1.5 m.'
      : null;
  }
  if (object.scale.some((value) => Math.abs(value - 1) > 1e-6)) {
    return 'Use connector dimensions rather than scale, so tread, door and rail profiles retain their physical sizes.';
  }
  if (object.recipe === 'stairs') {
    if (
      m.clearWidth < 1.2 ||
      m.clearWidth > 4 ||
      m.rise < 1 ||
      m.rise > 6 ||
      m.depth < 2 ||
      m.depth > 12
    ) {
      return 'Stairs require 1.2–4 m flight width, 1–6 m rise and 2–12 m overall depth.';
    }
    if (
      m.riser < 0.15 - 1e-6 ||
      m.riser > 0.18 + 1e-6 ||
      circulationSpans(object).some((span) => {
        const going = Math.abs(span.to - span.from) / Math.max(1, span.steps - 1);
        return going < 0.25 - 1e-6 || going > 0.32 + 1e-6;
      })
    ) {
      return 'Stair proportions do not fit the design brief. Fit run to rise, or choose 0.15–0.18 m risers and 0.25–0.32 m going.';
    }
  } else if (object.recipe === 'elevator') {
    if (m.width < 2 || m.width > 3.5 || m.depth < 2 || m.depth > 3.5 || m.rise < 3 || m.rise > 12) {
      return 'Elevator footprint must be 2–3.5 m per side with 3–12 m floor-to-floor rise; cabin headroom is added above the upper landing.';
    }
  } else if (object.recipe === 'escalator') {
    if (
      m.width < 1.6 ||
      m.width > 2.4 ||
      m.rise < 2.5 ||
      m.rise > 8 ||
      m.depth > 16 ||
      m.pitch < 30 - 0.01 ||
      m.pitch > 35 + 0.01
    ) {
      return 'Escalator requires 1.6–2.4 m width and 30–35° inclination after its two 1 m transitions. Fit run to rise.';
    }
  } else {
    if (
      m.clearWidth < 1.2 ||
      m.clearWidth > 3 ||
      m.rise < 0.1 ||
      m.rise > 1.5 ||
      m.depth > 20 ||
      m.ratio < 12 - 1e-6 ||
      m.ratio > 20 + 1e-6 ||
      m.rise / m.flights > 0.76 + 1e-6
    ) {
      return 'Ramp requires 1.2–3 m clear width, slope between 1:12 and 1:20, and no flight above 0.76 m rise. Fit the run or use switchback.';
    }
  }
  return null;
}
export function snapCirculation(object: PlanObject, floor: PlanFloor): PlanObject {
  if (!object.circulationDesign?.snap || object.planarMatrix) {
    return object;
  }
  const bounds = polygonBounds(floor.boundary),
    local = { ...object, position: [0, 0] as [number, number] };
  const occupied = polygonBounds([
    ...transformFootprint(
      object.polygon.map(([px, pz]) => [px * object.scale[0], pz * object.scale[2]]),
      [0, 0],
      object.yawRadians,
    ),
    ...circulationApproaches(local).flat(),
  ]);
  let [x, z] = object.position;
  for (const edge of [bounds.minX - occupied.minX, bounds.maxX - occupied.maxX]) {
    if (Math.abs(x - edge) < 0.15) {
      x = edge;
    }
  }
  for (const edge of [bounds.minZ - occupied.minZ, bounds.maxZ - occupied.maxZ]) {
    if (Math.abs(z - edge) < 0.15) {
      z = edge;
    }
  }
  return { ...object, position: [x, z] };
}

/** Keep an authored flight aligned with its connected floor elevations after later edits. */
export function circulationLinkError(document: PlanDocument): string | null {
  for (const floor of document.floors) {
    for (const object of floor.objects) {
      if (
        !object.portalId ||
        !object.circulationDesign ||
        object.circulationDesign.role !== 'lower'
      ) {
        continue;
      }
      const other = document.floors.find(
        (candidate) =>
          candidate.source.id !== floor.source.id &&
          candidate.objects.some((item) => item.portalId === object.portalId),
      );
      if (!other) {
        continue;
      }
      const rise = other.source.heightOffset - floor.source.heightOffset;
      if (Math.abs(object.dimensions[1] - rise) > 0.001) {
        return `${object.name}: connected rise must stay at ${rise.toFixed(2)} m. Disconnect and refit before changing floor elevation or rise.`;
      }
    }
  }
  return null;
}
