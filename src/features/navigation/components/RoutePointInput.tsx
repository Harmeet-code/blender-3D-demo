import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
import { useRoutePointSelection, type RoutePointSlot } from '../model/route-point-selection.ts';

/** Numeric metric entry is the keyboard-accessible equivalent of clicking the floor. */
export function RoutePointInput({
  layout,
  slot,
  floorId,
}: {
  layout: NormalizedLayout;
  slot: RoutePointSlot;
  floorId: string;
}) {
  const id = useId();
  const [floor, setFloor] = useState(floorId);
  const [x, setX] = useState('0');
  const [z, setZ] = useState('0');
  useEffect(() => {
    if (!layout.floors.some((item) => item.id === floor)) {
      setFloor(floorId);
    }
  }, [layout, floor, floorId]);
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        Enter {slot} point coordinates
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <label htmlFor={`${id}-floor`}>Floor</label>
        <select
          id={`${id}-floor`}
          value={floor}
          onChange={(event) => setFloor(event.target.value)}
          className="h-9 rounded-md border bg-background px-2"
        >
          {layout.floors.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={`${id}-x`}>
            X (meters)
            <Input
              id={`${id}-x`}
              type="number"
              step="any"
              value={x}
              onChange={(event) => setX(event.target.value)}
            />
          </label>
          <label htmlFor={`${id}-z`}>
            Z (meters)
            <Input
              id={`${id}-z`}
              type="number"
              step="any"
              value={z}
              onChange={(event) => setZ(event.target.value)}
            />
          </label>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={
            !x.trim() || !z.trim() || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))
          }
          onClick={() => {
            const picker = useRoutePointSelection.getState();
            picker.begin(layout, slot);
            picker.select(layout, floor, [Number(x), Number(z)]);
          }}
        >
          Use {slot} point
        </Button>
      </div>
    </details>
  );
}
