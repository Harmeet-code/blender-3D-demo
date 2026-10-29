import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { computeParkingLayout, parkingDesign } from '../model/parking-lot.ts';
import { parkingDesignSchema, type ParkingDesign } from '../model/parking-schema.ts';
import type { PlanObject } from '../model/types.ts';

const bayTypes = ['standard', 'accessible', 'ev', 'motorcycle', 'vip', 'loading'] as const;

export function ParkingLotFields({
  object,
  selectedBayId,
  onClearBay,
  patch,
}: {
  object: PlanObject;
  selectedBayId?: string | null;
  onClearBay?: () => void;
  patch: (value: Partial<PlanObject>) => void;
}) {
  const design = parkingDesign(object);
  const layout = useMemo(
    () => computeParkingLayout(object.polygon, design),
    [object.polygon, design],
  );
  const selectedBay = layout.bays.find((bay) => bay.id === selectedBayId);
  const update = (values: Partial<ParkingDesign>) =>
    patch({ parkingDesign: parkingDesignSchema.parse({ ...design, ...values }) });

  const setBayOverride = (type: (typeof bayTypes)[number], pinned: boolean) => {
    if (!selectedBay) {
      return;
    }
    const overrides = { ...design.overrides };
    overrides[`${selectedBay.u.toFixed(4)},${selectedBay.v.toFixed(4)}`] = {
      type,
      pinned,
    };
    update({ overrides });
  };

  return (
    <details className="fp-settings-group" open>
      <summary>Parking lot layout</summary>
      <div className="fp-muted" role="status">
        {layout.capacity} fixed-size bays · {layout.aisles.length} aisles
      </div>
      {layout.validationIssues.map((issue) => (
        <p className="fp-error" role="alert" key={issue}>
          {issue}
        </p>
      ))}
      <Field label="Bay angle">
        <select
          aria-label="Parking bay angle"
          value={design.bayAngle}
          onChange={(event) =>
            update({ bayAngle: event.target.value as ParkingDesign['bayAngle'] })
          }
        >
          <option value="90">90°</option>
          <option value="60">60°</option>
          <option value="45">45°</option>
          <option value="parallel">Parallel</option>
        </select>
      </Field>
      <Field label="Aisle direction">
        <select
          aria-label="Parking aisle direction"
          value={design.oneWay ? 'one-way' : 'two-way'}
          onChange={(event) => update({ oneWay: event.target.value === 'one-way' })}
        >
          <option value="two-way">Two-way</option>
          <option value="one-way">One-way</option>
        </select>
      </Field>
      <NumberField
        label="Curb margin (m)"
        value={design.margin}
        min={0.5}
        max={3}
        step={0.1}
        onChange={(margin) => update({ margin })}
      />
      <NumberField
        label="Occupancy"
        value={design.occupancy}
        min={0}
        max={1}
        step={0.05}
        onChange={(occupancy) => update({ occupancy })}
      />
      <NumberField
        label="Occupancy seed"
        value={design.seed}
        min={1}
        max={9999}
        step={1}
        onChange={(seed) => update({ seed: Math.round(seed) })}
      />
      <Field label="Show vehicles">
        <Input
          aria-label="Show parking vehicles"
          type="checkbox"
          checked={design.showVehicles}
          onChange={(event) => update({ showVehicles: event.target.checked })}
        />
      </Field>
      <Field label="Occupancy heatmap">
        <Input
          aria-label="Parking occupancy heatmap"
          type="checkbox"
          checked={design.heatmap}
          onChange={(event) => update({ heatmap: event.target.checked })}
        />
      </Field>
      {selectedBay ? (
        <div className="fp-context-panel">
          <p>
            <strong>{selectedBay.id}</strong> · {selectedBay.isOccupied ? 'Occupied' : 'Available'}
          </p>
          <Field label="Bay type">
            <select
              aria-label="Selected bay type"
              value={selectedBay.type}
              onChange={(event) =>
                setBayOverride(event.target.value as (typeof bayTypes)[number], selectedBay.pinned)
              }
            >
              {bayTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pin bay type across relayout">
            <Input
              aria-label="Pin selected bay type"
              type="checkbox"
              checked={selectedBay.pinned}
              onChange={(event) => setBayOverride(selectedBay.type, event.target.checked)}
            />
          </Field>
          <Button size="sm" variant="ghost" onClick={onClearBay}>
            Clear bay selection
          </Button>
        </div>
      ) : (
        <p className="fp-muted">Click a bay in the scene to edit its type.</p>
      )}
      <p className="fp-muted">
        Bay sizes stay standardized as the footprint changes. Selection and per-bay types are saved
        with the shared draft.
      </p>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="fp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}
