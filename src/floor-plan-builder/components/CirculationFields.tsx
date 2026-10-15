import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PlanObject } from '../model/types.ts';
import { circulationDesignSchema, type CirculationDesign } from '../model/circulation-schema.ts';
import {
  circulationError,
  circulationLandings,
  circulationMetrics,
  fitCirculation,
} from '../model/circulation.ts';

export function CirculationFields({
  object,
  patch,
}: {
  object: PlanObject;
  patch: (values: Partial<PlanObject>) => void;
}) {
  const design = object.circulationDesign,
    m = circulationMetrics(object);
  if (object.legacyPortalLanding) {
    return null;
  }
  if (!design) {
    return (
      <Button
        variant="outline"
        onClick={() =>
          patch(
            fitCirculation({
              ...object,
              scale: [1, 1, 1],
              circulationDesign: circulationDesignSchema.parse({
                clearWidth: Math.min(4, Math.max(1.2, object.dimensions[0])),
              }),
            }),
          )
        }
      >
        Upgrade connector geometry and fit dimensions
      </Button>
    );
  }
  const update = (values: Partial<CirculationDesign>) =>
    patch(fitCirculation({ ...object, circulationDesign: { ...design, ...values } }));
  const numeric = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    min: number,
    max: number,
    step = 0.1,
  ) => (
    <Label className="fp-field">
      <span>{label}</span>
      <Input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const number = event.target.valueAsNumber;
          if (Number.isFinite(number)) {
            onChange(number);
          }
        }}
      />
    </Label>
  );
  const issue = circulationError(object),
    upper = design.role === 'upper';
  return (
    <fieldset className="fp-form">
      <legend>Connector construction</legend>
      {issue && (
        <p className="fp-error" role="alert">
          {issue}
        </p>
      )}
      <p className="fp-muted">
        {upper
          ? 'Upper landing marker'
          : `Overall footprint ${m.width.toFixed(2)} × ${m.depth.toFixed(2)} m · floor rise ${m.rise.toFixed(2)} m`}
      </p>
      {!upper && (
        <>
          {['stairs', 'ramp'].includes(object.recipe) && (
            <>
              <Label className="fp-field">
                <span>Flight layout</span>
                <select
                  aria-label="Flight layout"
                  value={design.layout}
                  onChange={(event) =>
                    update({ layout: event.target.value as CirculationDesign['layout'] })
                  }
                >
                  <option value="straight">Straight</option>
                  <option value="switchback">Switchback</option>
                </select>
              </Label>
              {numeric(
                'Clear flight width (m)',
                design.clearWidth,
                (clearWidth) => update({ clearWidth }),
                1.2,
                object.recipe === 'ramp' ? 3 : 4,
              )}
              {numeric(
                'Landing length (m)',
                design.landingLength,
                (landingLength) => update({ landingLength }),
                1.5,
                3,
              )}
            </>
          )}
          {object.recipe !== 'elevator' && (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={design.autoSize}
              onClick={() => update({ autoSize: !design.autoSize })}
            >
              Fit run to rise {design.autoSize ? 'on' : 'off'}
            </Button>
          )}
          {object.recipe === 'stairs' && (
            <>
              {numeric(
                'Target tread going (m)',
                design.going,
                (going) => update({ going }),
                0.25,
                0.32,
                0.01,
              )}
              {!design.autoSize &&
                numeric(
                  'Riser count',
                  object.steps,
                  (steps) => patch({ steps: Math.round(steps) }),
                  2,
                  100,
                  1,
                )}
              <p className="fp-muted">
                {m.risers} risers · {(m.riser * 1000).toFixed(0)} mm rise ·{' '}
                {(m.going * 1000).toFixed(0)} mm average going
              </p>
              <Label className="fp-field">
                <span>Nosing color</span>
                <select
                  aria-label="Nosing color"
                  value={design.nosing}
                  onChange={(event) => update({ nosing: event.target.value as 'green' | 'yellow' })}
                >
                  <option value="green">Safety green</option>
                  <option value="yellow">Warning yellow</option>
                </select>
              </Label>
            </>
          )}
          {object.recipe === 'ramp' && (
            <>
              {numeric(
                'Ramp slope denominator',
                design.slopeRatio,
                (slopeRatio) => update({ slopeRatio }),
                12,
                20,
                1,
              )}
              <p className="fp-muted">
                1:{m.ratio.toFixed(1)} slope · {m.flights} flight(s) ·{' '}
                {(m.rise / m.flights).toFixed(2)} m rise per flight
              </p>
            </>
          )}
          {object.recipe === 'escalator' && (
            <>
              <p className="fp-muted">{m.pitch.toFixed(1)}° incline · two 1 m transitions</p>
              {numeric(
                'Escalator clear housing width (m)',
                design.clearWidth,
                (clearWidth) => update({ clearWidth }),
                1.6,
                2.4,
              )}
              {numeric(
                'Operating speed (m/s)',
                design.speed,
                (speed) => update({ speed }),
                0,
                0.75,
                0.05,
              )}
              <Label className="fp-field">
                <span>Travel direction</span>
                <select
                  aria-label="Travel direction"
                  value={design.direction}
                  onChange={(event) => update({ direction: event.target.value as 'UP' | 'DOWN' })}
                >
                  <option value="UP">Up</option>
                  <option value="DOWN">Down</option>
                </select>
              </Label>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={design.running}
                onClick={() => update({ running: !design.running })}
              >
                {design.running ? 'Stop' : 'Start'} escalator
              </Button>
            </>
          )}
          {object.recipe === 'elevator' && (
            <>
              <p className="fp-muted">
                Shaft height {m.shaftHeight.toFixed(2)} m, including cabin headroom above upper
                floor.
              </p>
              <Label className="fp-field">
                <span>Cabin target</span>
                <select
                  aria-label="Cabin target"
                  value={design.cabinLevel}
                  onChange={(event) =>
                    update({ cabinLevel: event.target.value as 'lower' | 'upper' })
                  }
                >
                  <option value="lower">Lower landing (L1)</option>
                  <option value="upper">Upper landing (L2)</option>
                </select>
              </Label>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={design.doorsOpen}
                onClick={() => update({ doorsOpen: !design.doorsOpen })}
              >
                {design.doorsOpen ? 'Close' : 'Open'} elevator doors
              </Button>
              <p className="fp-muted">
                Doors close before travel and open only at the occupied landing.
              </p>
            </>
          )}
          {['elevator', 'escalator'].includes(object.recipe) && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={design.glass}
              onClick={() => update({ glass: !design.glass })}
            >
              Glass {design.glass ? 'on' : 'off'}
            </Button>
          )}
          {object.recipe !== 'elevator' && (
            <Button
              size="sm"
              variant="outline"
              aria-pressed={object.handrails}
              onClick={() => patch({ handrails: !object.handrails })}
            >
              Handrails {object.handrails ? 'on' : 'off'}
            </Button>
          )}
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        aria-pressed={design.showLandings}
        onClick={() => update({ showLandings: !design.showLandings })}
      >
        Landing symbols {design.showLandings ? 'on' : 'off'}
      </Button>
      {!upper && (
        <details>
          <summary>Landing coordinates (local meters)</summary>
          {circulationLandings(object).map((landing) => (
            <p key={landing.id} className="fp-muted">
              {landing.id}: [{landing.localPosition.map((v) => v.toFixed(2)).join(', ')}] ·{' '}
              {landing.clearZone.join(' × ')} m
            </p>
          ))}
        </details>
      )}
      <p className="fp-muted">
        Materials follow the construction preset. Routing currently uses flat floor portal links;
        directional escalator routing, 3D ramp traversal and physical rail colliders require
        navigation integration.
      </p>
    </fieldset>
  );
}
