import type { PlanObject } from '../model/types.ts';
import { circulationDesign, circulationMetrics, circulationSpans } from '../model/circulation.ts';
import { Part, Sign, useCirculationTexture } from './CirculationParts.tsx';

/** Cheap overview silhouettes; animated machinery and transmission are reserved for inspection. */
export function CirculationFar({ object }: { object: PlanObject }) {
  const m = circulationMetrics(object),
    design = circulationDesign(object),
    stairs = object.recipe === 'stairs',
    ramp = object.recipe === 'ramp';
  const map = useCirculationTexture(
    'steps',
    '',
    stairs && design.nosing === 'green' ? '#10B981' : '#F59E0B',
  );
  if (object.recipe === 'elevator') {
    return (
      <>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <Part
              key={`${x}:${z}`}
              size={[0.1, m.shaftHeight, 0.1]}
              at={[x * (m.width / 2 - 0.05), m.shaftHeight / 2, z * (m.depth / 2 - 0.05)]}
              color="#1E2022"
            />
          )),
        )}
        {design.glass && (
          <>
            <Part
              size={[m.width, m.shaftHeight, 0.012]}
              at={[0, m.shaftHeight / 2, -m.depth / 2]}
              glass
            />
            {[-1, 1].map((side) => (
              <Part
                key={side}
                size={[0.012, m.shaftHeight, m.depth]}
                at={[side * (m.width / 2 - 0.02), m.shaftHeight / 2, 0]}
                glass
              />
            ))}
          </>
        )}
        {[0, m.rise].map((y) => (
          <Part key={y} size={[1.2, 2.1, 0.04]} at={[0, y + 1.05, m.depth / 2]} />
        ))}
        <Part size={[m.width, 0.08, m.depth]} at={[0, m.shaftHeight, 0]} color="#1E2022" />
        {design.showLandings && (
          <Sign text="ACCESS" at={[0, m.shaftHeight + 0.042, 0]} flat size={[1, 1]} />
        )}
      </>
    );
  }
  return (
    <>
      {circulationSpans(object).map((span, i) => {
        const dz = span.to - span.from,
          dy = span.y1 - span.y0,
          angle = -Math.atan2(dy, dz),
          length = Math.hypot(dz, dy),
          escalator = object.recipe === 'escalator';
        return (
          <group key={i}>
            <Part
              size={[span.width, ramp ? 0.05 : escalator ? 0.45 : 0.18, length]}
              at={[
                span.x,
                (span.y0 + span.y1) / 2 - (ramp ? 0.025 : 0.12),
                (span.from + span.to) / 2,
              ]}
              rotation={[angle, 0, 0]}
              color={ramp ? '#334155' : '#FFFFFF'}
              roughness={ramp ? 0.95 : 0.55}
              metalness={ramp ? 0 : 0.6}
              map={ramp ? undefined : map}
            />
            {[-1, 1].map((end) => (
              <Part
                key={end}
                size={[span.width, 0.05, m.landing]}
                at={[
                  span.x,
                  (end === 1 ? span.y0 : span.y1) - 0.025,
                  (end === 1 ? span.from : span.to) - (Math.sign(dz) * end * m.landing) / 2,
                ]}
                color={ramp ? '#334155' : '#1E2022'}
                roughness={0.9}
                metalness={0}
              />
            ))}
            {object.handrails &&
              [-1, 1].map((side) => (
                <Part
                  key={side}
                  size={[0.045, 0.045, length]}
                  at={[
                    span.x + side * (span.width / 2 - 0.03),
                    (span.y0 + span.y1) / 2 + (ramp ? 0.86 : 0.95),
                    (span.from + span.to) / 2,
                  ]}
                  rotation={[angle, 0, 0]}
                  color={escalator ? '#1E2022' : '#C0C4C8'}
                />
              ))}
          </group>
        );
      })}
    </>
  );
}
