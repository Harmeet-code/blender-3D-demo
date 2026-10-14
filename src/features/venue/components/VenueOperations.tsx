import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import type { VenueOperation, VenueSnapshot } from '../model/venue-contracts.ts';
import type { VenueExecute } from './VenueBooths.tsx';
import {
  VenueAction,
  VenueEmpty,
  VenueField,
  VenueInput,
  VenueMetric,
  VenuePanel,
  VenueSelect,
  venueDate,
} from './VenuePrimitives.tsx';

export function VenueOperations({
  snapshot,
  execute,
  pending,
}: {
  snapshot: VenueSnapshot;
  execute: VenueExecute;
  pending: boolean;
}) {
  const layout = useLayoutStore((state) => state.layout);
  const [floorId, setFloorId] = useState(layout.floors[0]?.id ?? ''),
    [kind, setKind] = useState<VenueOperation['kind']>('incident'),
    [x, setX] = useState('0'),
    [z, setZ] = useState('0'),
    [count, setCount] = useState('0'),
    [note, setNote] = useState(''),
    [filter, setFilter] = useState('open');
  const [signageId, setSignageId] = useState('entrance-main'),
    [title, setTitle] = useState('Welcome'),
    [body, setBody] = useState(''),
    [destinationId, setDestinationId] = useState('');
  const activeFloor = layout.floors.find((floor) => floor.id === floorId) ?? layout.floors[0];
  const effectiveFloorId = activeFloor?.id ?? '';
  const boundary = activeFloor?.authoring?.boundary ?? [];
  const rooms = useMemo(
    () => layout.rooms.filter((room) => room.floorId === effectiveFloorId),
    [layout, effectiveFloorId],
  );
  const bounds = useMemo(() => {
    const points = boundary.length ? boundary : rooms.flatMap((room) => room.polygon);
    if (!points.length) {
      return { minX: -20, minZ: -15, width: 40, depth: 30 };
    }
    const minX = Math.min(...points.map((point) => point[0])) - 2,
      minZ = Math.min(...points.map((point) => point[1])) - 2;
    return {
      minX,
      minZ,
      width: Math.max(5, Math.max(...points.map((point) => point[0])) - minX + 2),
      depth: Math.max(5, Math.max(...points.map((point) => point[1])) - minZ + 2),
    };
  }, [boundary, rooms]);
  const radius = Math.max(bounds.width, bounds.depth) / 90;
  const open = snapshot.operations.filter((operation) => !operation.resolvedAt);
  const operations = snapshot.operations.filter(
    (operation) =>
      filter === 'all' || (filter === 'open' ? !operation.resolvedAt : !!operation.resolvedAt),
  );
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <VenueMetric
          label="Open incidents"
          value={open.filter((item) => item.kind === 'incident').length}
        />
        <VenueMetric
          label="Cleaning requests"
          value={open.filter((item) => item.kind === 'cleaning').length}
        />
        <VenueMetric
          label="Recorded occupancy"
          value={open
            .filter((item) => item.kind === 'occupancy')
            .reduce((sum, item) => sum + (item.count ?? 0), 0)}
          hint="Sum of unresolved manual observations"
        />
      </div>
      <VenuePanel
        title="Operations map"
        description="Pick a location on the floor diagram or enter metre coordinates. Occupancy is a manual observation, not an automatic sensor count."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <VenueSelect
              label="Floor"
              value={effectiveFloorId}
              onChange={setFloorId}
              options={layout.floors.map((floor) => ({ value: floor.id, label: floor.name }))}
            />
            <svg
              role="img"
              aria-label="Operations floor diagram, click to position a pin"
              viewBox={`${bounds.minX} ${bounds.minZ} ${bounds.width} ${bounds.depth}`}
              className="mt-3 h-72 w-full cursor-crosshair rounded-xl border bg-muted/20"
              onClick={(event) => {
                const matrix = event.currentTarget.getScreenCTM();
                if (!matrix) {
                  return;
                }
                const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
                  matrix.inverse(),
                );
                setX(point.x.toFixed(2));
                setZ(point.y.toFixed(2));
              }}
            >
              {boundary.length > 0 && (
                <polygon
                  points={boundary.map((point) => point.join(',')).join(' ')}
                  fill="white"
                  fillOpacity="0.07"
                  stroke="currentColor"
                  strokeWidth={radius / 6}
                />
              )}
              {rooms.map((room) => (
                <polygon
                  key={room.id}
                  points={room.polygon.map((point) => point.join(',')).join(' ')}
                  fill="#94a3b8"
                  fillOpacity="0.25"
                  stroke="#64748b"
                  strokeWidth={radius / 8}
                />
              ))}
              {activeFloor?.authoring?.walls?.map((wall) => (
                <line
                  key={wall.id}
                  x1={wall.start[0]}
                  y1={wall.start[1]}
                  x2={wall.end[0]}
                  y2={wall.end[1]}
                  stroke="#64748b"
                  strokeWidth={Math.max(wall.thickness, radius / 6)}
                />
              ))}
              {open
                .filter((operation) => operation.floorId === effectiveFloorId)
                .map((operation) => (
                  <g key={operation.id}>
                    <circle
                      cx={operation.position[0]}
                      cy={operation.position[1]}
                      r={operation.kind === 'occupancy' ? radius * 2 : radius}
                      fill={
                        operation.kind === 'incident'
                          ? '#ef4444'
                          : operation.kind === 'cleaning'
                            ? '#f59e0b'
                            : '#3b82f6'
                      }
                      fillOpacity={operation.kind === 'occupancy' ? 0.3 : 0.85}
                    />
                    <title>
                      {operation.kind}: {operation.note} {operation.count ?? ''}
                    </title>
                  </g>
                ))}
              {Number.isFinite(Number(x)) && Number.isFinite(Number(z)) && (
                <circle
                  cx={Number(x)}
                  cy={Number(z)}
                  r={radius}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={radius / 3}
                />
              )}
            </svg>
            <p className="mt-2 text-xs text-muted-foreground">
              Red: incident · Amber: cleaning · Blue: occupancy observation · Green: proposed pin
            </p>
          </div>
          <form
            className="grid content-start gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!effectiveFloorId) {
                return;
              }
              await execute({
                type: 'operation',
                kind,
                floorId: effectiveFloorId,
                position: [Number(x), Number(z)],
                note,
                ...(kind === 'occupancy' ? { count: Number(count) } : {}),
              });
              setNote('');
            }}
          >
            <VenueSelect
              label="Operation type"
              value={kind}
              onChange={(value) => setKind(value as VenueOperation['kind'])}
              options={[
                { value: 'incident', label: 'Incident' },
                { value: 'cleaning', label: 'Cleaning request' },
                { value: 'occupancy', label: 'Occupancy observation' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <VenueField label="X (metres)">
                <VenueInput
                  type="number"
                  step="0.01"
                  required
                  value={x}
                  onChange={(event) => setX(event.target.value)}
                />
              </VenueField>
              <VenueField label="Z (metres)">
                <VenueInput
                  type="number"
                  step="0.01"
                  required
                  value={z}
                  onChange={(event) => setZ(event.target.value)}
                />
              </VenueField>
            </div>
            {kind === 'occupancy' && (
              <VenueField label="People observed">
                <VenueInput
                  type="number"
                  min="0"
                  max="100000"
                  step="1"
                  required
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </VenueField>
            )}
            <VenueField label="Notes">
              <textarea
                className="min-h-24 rounded-md border bg-background p-3 text-sm"
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Location, severity or requested action"
              />
            </VenueField>
            <Button disabled={pending || !effectiveFloorId}>Record {kind}</Button>
          </form>
        </div>
      </VenuePanel>
      <VenuePanel
        title="Operations queue"
        actions={
          <VenueSelect
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      >
        {!operations.length ? (
          <VenueEmpty>No {filter === 'all' ? '' : filter} operations recorded.</VenueEmpty>
        ) : (
          <div className="grid gap-2">
            {operations
              .slice()
              .reverse()
              .map((operation) => (
                <article
                  key={operation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {operation.kind} · {operation.floorId}
                      {operation.count !== undefined ? ` · ${operation.count} people` : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {operation.note || 'No additional notes'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      [{operation.position.join(', ')}] m · {venueDate(operation.createdAt)}
                      {operation.resolvedAt ? ` · resolved ${venueDate(operation.resolvedAt)}` : ''}
                    </p>
                  </div>
                  {!operation.resolvedAt && (
                    <VenueAction
                      disabled={pending}
                      onClick={() =>
                        void execute({ type: 'resolve-operation', operationId: operation.id })
                      }
                    >
                      Resolve
                    </VenueAction>
                  )}
                </article>
              ))}
          </div>
        )}
      </VenuePanel>
      <VenuePanel
        title="Signage content"
        description="Publish content by stable display ID. Displays pull this event’s signage feed; destination links use room or POI identifiers."
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void execute({
              type: 'signage',
              signageId,
              title,
              body,
              ...(destinationId.trim() ? { destinationId: destinationId.trim() } : {}),
            });
          }}
        >
          <VenueField label="Display ID">
            <VenueInput
              required
              maxLength={120}
              value={signageId}
              onChange={(event) => setSignageId(event.target.value)}
            />
          </VenueField>
          <VenueField label="Title">
            <VenueInput
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </VenueField>
          <VenueField label="Message">
            <textarea
              className="min-h-24 rounded-md border bg-background p-3 text-sm"
              maxLength={2000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </VenueField>
          <VenueField label="Destination ID (optional)">
            <VenueInput
              maxLength={120}
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
              placeholder="room-101"
            />
          </VenueField>
          <Button disabled={pending} className="w-fit">
            Update display
          </Button>
        </form>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {snapshot.signage.map((sign) => (
            <button
              key={sign.id}
              type="button"
              className="rounded-xl border bg-muted/30 p-4 text-left"
              onClick={() => {
                setSignageId(sign.id);
                setTitle(sign.title);
                setBody(sign.body);
                setDestinationId(sign.destinationId ?? '');
              }}
            >
              <p className="text-xs text-muted-foreground">
                {sign.id} · {venueDate(sign.updatedAt)}
              </p>
              <h3 className="mt-2 text-lg font-semibold">{sign.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{sign.body}</p>
              {sign.destinationId && (
                <p className="mt-2 text-xs">Directions to {sign.destinationId}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">Click to edit</p>
            </button>
          ))}
        </div>
      </VenuePanel>
    </div>
  );
}
