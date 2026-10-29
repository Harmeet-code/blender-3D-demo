import { useMemo, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import type { PlanDocument } from '../../model/types.ts';
import { useWayfindingStore } from '../store/wayfinding-store.ts';
import type { RouteRequest } from '../model/route-schema.ts';
import { parkingAnchorPoint } from '../../model/parking-navigation.ts';
import { parkingLayout } from '../../model/parking-lot.ts';
import { diningAnchorPoint } from '../../model/dining-navigation.ts';
import { diningLayout } from '../../model/dining.ts';

type ToolId = 'select' | 'route-start' | 'route-dest';
export function RoutePicker({
  document,
  floorId,
  tool,
  setTool,
  selectionId,
}: {
  document: PlanDocument;
  floorId: string;
  tool: string;
  setTool: (tool: ToolId) => void;
  selectionId: string | null;
}) {
  const request = useWayfindingStore((state) => state.request),
    setRequest = useWayfindingStore((state) => state.setRequest);
  const option = useWayfindingStore((state) => state.option),
    setOption = useWayfindingStore((state) => state.setOption);
  const status = useWayfindingStore((state) => state.status);
  const [query, setQuery] = useState('');
  const [end, setEndChoice] = useState<'start' | 'dest'>('dest');
  const [parkingBayId, setParkingBayId] = useState('');
  const [diningSeatId, setDiningSeatId] = useState('');
  const all = useMemo(
    () =>
      document.floors.flatMap((floor) =>
        floor.objects.map((object) => ({
          floorId: floor.source.id,
          floorName: floor.source.name,
          object,
        })),
      ),
    [document],
  );
  const matches = useMemo(
    () =>
      all
        .filter((item) =>
          `${item.object.name} ${item.object.boothNumber} ${item.object.recipe} ${item.floorName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 12),
    [all, query],
  );
  const selectedParking = all.find(
    (item) => item.object.id === selectionId && item.object.recipe === 'parking-lot',
  );
  const selectedParkingLayout = selectedParking ? parkingLayout(selectedParking.object) : null;
  const selectedDining = all.find(
    (item) => item.object.id === selectionId && item.object.recipe === 'dining',
  );
  const selectedDiningLayout = selectedDining ? diningLayout(selectedDining.object) : null;
  const setEnd = (which: 'start' | 'dest', endpoint: RouteRequest['start']) => {
    const spawn = document.floors.find((floor) => floor.source.id === floorId)?.spawn ?? [0, 0];
    const fallback: RouteRequest['start'] = { floorId, kind: 'point', point: [...spawn] };
    setRequest({
      start: which === 'start' ? endpoint : (request?.start ?? fallback),
      dest: which === 'dest' ? endpoint : (request?.dest ?? fallback),
      accessibleOnly: option === 'accessible',
      allowRestricted: request?.allowRestricted ?? false,
    });
    setTool('select');
    setQuery('');
  };
  const label = (endpoint: RouteRequest['start'] | undefined) =>
    endpoint
      ? endpoint.kind === 'item'
        ? (all.find(
            (item) => item.floorId === endpoint.floorId && item.object.id === endpoint.itemId,
          )?.object.name ?? 'Missing item')
        : `Floor point (${endpoint.point?.map((value) => value.toFixed(1)).join(', ')})`
      : 'Not selected';
  return (
    <div className="fp-form flex flex-col gap-3" aria-label="Route picker">
      <div className="fp-row">
        <Button
          size="sm"
          variant={tool === 'route-start' ? 'default' : 'outline'}
          aria-pressed={tool === 'route-start'}
          onClick={() => {
            setEndChoice('start');
            setTool('route-start');
          }}
        >
          Pick start
        </Button>
        <Button
          size="sm"
          variant={tool === 'route-dest' ? 'default' : 'outline'}
          aria-pressed={tool === 'route-dest'}
          onClick={() => {
            setEndChoice('dest');
            setTool('route-dest');
          }}
        >
          Pick destination
        </Button>
      </div>
      <p className="fp-muted">
        Start: {label(request?.start)}
        <br />
        Destination: {label(request?.dest)}
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="route-endpoint">Set endpoint</FieldLabel>
          <select
            id="route-endpoint"
            value={end}
            onChange={(event) => setEndChoice(event.target.value as 'start' | 'dest')}
          >
            <option value="start">Start</option>
            <option value="dest">Destination</option>
          </select>
        </Field>
        <div className="fp-row">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setEnd(end, {
                floorId,
                kind: 'point',
                point: [
                  ...(document.floors.find((floor) => floor.source.id === floorId)?.spawn ?? [
                    0, 0,
                  ]),
                ],
              })
            }
          >
            Use spawn
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectionId}
            onClick={() => {
              const item = all.find((candidate) => candidate.object.id === selectionId);
              if (item) {
                setEnd(end, { floorId: item.floorId, kind: 'item', itemId: item.object.id });
              }
            }}
          >
            Use selection
          </Button>
        </div>
        {selectedParking && (
          <div className="fp-context-panel" aria-label="Parking lot route anchors">
            <p className="fp-muted">Parking lot anchors</p>
            {(
              [
                ['pedestrian-exit', 'Use pedestrian exit'],
                ['vehicle-arrival', 'Use safe pedestrian landing beside vehicle gate'],
              ] as const
            ).map(([kind, anchorLabel]) => {
              const point = parkingAnchorPoint(selectedParking.object, kind);
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  disabled={!point}
                  onClick={() =>
                    point && setEnd(end, { floorId: selectedParking.floorId, kind: 'point', point })
                  }
                >
                  {anchorLabel}
                </Button>
              );
            })}
            <Field>
              <FieldLabel htmlFor="parking-arrival-bay">Free stall</FieldLabel>
              <select
                id="parking-arrival-bay"
                value={parkingBayId}
                onChange={(event) => setParkingBayId(event.target.value)}
              >
                <option value="">Choose a free stall</option>
                {selectedParkingLayout?.bays
                  .filter((bay) => !bay.isOccupied && !bay.hatchFor)
                  .map((bay) => (
                    <option key={bay.id} value={bay.id}>
                      {bay.id} · {bay.type}
                    </option>
                  ))}
              </select>
            </Field>
            {(() => {
              const point = parkingBayId
                ? parkingAnchorPoint(selectedParking.object, 'bay-access', parkingBayId)
                : null;
              return (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!point}
                  onClick={() =>
                    point && setEnd(end, { floorId: selectedParking.floorId, kind: 'point', point })
                  }
                >
                  Use stall-side arrival landing
                </Button>
              );
            })()}
          </div>
        )}
        {selectedDining && selectedDiningLayout && (
          <div className="fp-context-panel" aria-label="Dining route targets">
            <p className="fp-muted">
              Dining arrivals use a clear point outside the selected furniture blocker.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedDining.object.diningHost}
              onClick={() => {
                const point = diningAnchorPoint(selectedDining.object, 'host');
                if (point) {
                  setEnd(end, { floorId: selectedDining.floorId, kind: 'point', point });
                }
              }}
            >
              Use host station
            </Button>
            <Field>
              <FieldLabel htmlFor="dining-seat-arrival">Seat arrival</FieldLabel>
              <select
                id="dining-seat-arrival"
                value={diningSeatId}
                onChange={(event) => setDiningSeatId(event.target.value)}
              >
                <option value="">Choose a seat</option>
                {selectedDiningLayout.tables
                  .flatMap((table) => table.chairs)
                  .map((chair) => (
                    <option key={chair.id} value={chair.id}>
                      {chair.id}
                      {chair.occupied ? ' · occupied' : ' · vacant'}
                    </option>
                  ))}
              </select>
            </Field>
            <Button
              size="sm"
              variant="outline"
              disabled={!diningSeatId}
              onClick={() => {
                const point = diningSeatId
                  ? diningAnchorPoint(selectedDining.object, 'seat', diningSeatId)
                  : null;
                if (point) {
                  setEnd(end, { floorId: selectedDining.floorId, kind: 'point', point });
                }
              }}
            >
              Use seat arrival landing
            </Button>
          </div>
        )}
        <Field>
          <FieldLabel id="route-search-label">
            Search {end === 'start' ? 'start' : 'destination'}
          </FieldLabel>
          <Command shouldFilter={false} aria-label="Search route endpoints">
            <CommandInput
              aria-labelledby="route-search-label"
              value={query}
              onValueChange={setQuery}
              placeholder="Booth, washroom, exit…"
            />
            <CommandList>
              <CommandEmpty>No matching objects.</CommandEmpty>
              <CommandGroup heading="Inventory locations">
                {matches.map((item) => (
                  <CommandItem
                    key={`${item.floorId}-${item.object.id}`}
                    value={`${item.floorId}-${item.object.id}`}
                    onSelect={() =>
                      setEnd(end, { floorId: item.floorId, kind: 'item', itemId: item.object.id })
                    }
                  >
                    {item.object.name} · {item.floorName}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </Field>
        <Field>
          <FieldLabel htmlFor="route-option">Route option</FieldLabel>
          <select
            id="route-option"
            value={option}
            onChange={(event) => setOption(event.target.value as 'shortest' | 'accessible')}
          >
            <option value="shortest">Shortest</option>
            <option value="accessible">Accessible</option>
          </select>
        </Field>
        <Field orientation="horizontal">
          <Switch
            id="route-restricted"
            checked={request?.allowRestricted ?? false}
            disabled={!request}
            onCheckedChange={(allowRestricted) => {
              if (request) {
                setRequest({ ...request, allowRestricted });
              }
            }}
          />
          <FieldLabel htmlFor="route-restricted">Allow restricted zones</FieldLabel>
        </Field>
      </FieldGroup>
      <p className="fp-muted" aria-live="polite">
        {status === 'routing'
          ? 'Updating routes…'
          : !request
            ? 'The floor spawn is used until you choose a start.'
            : 'Click a floor point or search an inventory location.'}
      </p>
    </div>
  );
}
