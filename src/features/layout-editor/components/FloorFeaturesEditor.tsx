import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Floor, FloorAuthoring } from '@/features/building/model/building-schema.ts';
import { metresToSource, sourceToMetres } from '@/features/building/model/floor-coordinates.ts';

export type FeatureSelection = { kind: 'wall' | 'zone' | 'poi'; id: string } | null;

/** Accessible numeric editing complements drawing; dimensions are always physical metres. */
function NumberField({
  label,
  value,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <Label>
      {label}
      <Input
        aria-label={label}
        disabled={disabled}
        type="number"
        step=".1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const number = Number(draft);
          if (draft.trim() && Number.isFinite(number)) {
            if (number !== value) {
              onCommit(number);
            }
          } else {
            setDraft(String(value));
          }
        }}
      />
    </Label>
  );
}

export function FloorFeaturesEditor({
  floor,
  selection,
  setSelection,
  patch,
  disabled,
  onMessage,
}: {
  floor: Floor;
  selection: FeatureSelection;
  setSelection: (value: FeatureSelection) => void;
  patch: (value: Partial<FloorAuthoring>) => void;
  disabled: boolean;
  onMessage: (message: string) => void;
}) {
  const data = floor.authoring;
  const wall = data?.walls?.find((item) => selection?.kind === 'wall' && item.id === selection.id);
  const zone = data?.zones?.find((item) => selection?.kind === 'zone' && item.id === selection.id);
  const poi = data?.pois?.find((item) => selection?.kind === 'poi' && item.id === selection.id);
  const [polygonDraft, setPolygonDraft] = useState('');
  useEffect(
    () =>
      setPolygonDraft(
        JSON.stringify(
          zone?.polygon.map((point) => sourceToMetres(point, floor.coordinateSystem)) ?? [],
        ),
      ),
    [zone, floor.coordinateSystem],
  );
  const patchWall = (value: Partial<NonNullable<FloorAuthoring['walls']>[number]>) =>
    patch({
      walls: data?.walls?.map((item) => (item.id === wall?.id ? { ...item, ...value } : item)),
    });
  const patchPoi = (value: Partial<NonNullable<FloorAuthoring['pois']>[number]>) =>
    patch({
      pois: data?.pois?.map((item) => (item.id === poi?.id ? { ...item, ...value } : item)),
    });
  const pointFields = (
    name: string,
    point: [number, number],
    commit: (value: [number, number]) => void,
  ) => {
    const metric = sourceToMetres(point, floor.coordinateSystem);
    return ([0, 1] as const).map((axis) => (
      <NumberField
        key={`${name}-${axis}`}
        disabled={disabled}
        label={`${name} ${axis === 0 ? 'X' : 'Z'} (m)`}
        value={metric[axis]}
        onCommit={(value) => {
          const next: [number, number] = [...metric];
          next[axis] = value;
          commit(metresToSource(next, floor.coordinateSystem));
        }}
      />
    ));
  };
  return (
    <fieldset className="grid gap-3 rounded-xl border p-4">
      <legend className="px-2 text-sm font-medium">Walls, zones and points of interest</legend>
      <Label>
        Selected feature
        <select
          className="mt-2 w-full rounded-md border bg-background p-2"
          aria-label="Selected floor feature"
          value={selection ? `${selection.kind}:${selection.id}` : ''}
          onChange={(event) => {
            const [kind, ...id] = event.target.value.split(':');
            setSelection(kind ? { kind: kind as 'wall' | 'zone' | 'poi', id: id.join(':') } : null);
          }}
        >
          <option value="">Choose a feature</option>
          {data?.walls?.map((item) => (
            <option key={item.id} value={`wall:${item.id}`}>
              Wall · {item.id}
            </option>
          ))}
          {data?.zones?.map((item) => (
            <option key={item.id} value={`zone:${item.id}`}>
              Zone · {item.label}
            </option>
          ))}
          {data?.pois?.map((item) => (
            <option key={item.id} value={`poi:${item.id}`}>
              POI · {item.label}
            </option>
          ))}
        </select>
      </Label>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          Placement and dimensions require calibration. You can select and delete old features or
          openings to resolve calibration conflicts.
        </p>
      )}
      {wall && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {pointFields('Wall start', wall.start, (start) => patchWall({ start }))}
            {pointFields('Wall end', wall.end, (end) => patchWall({ end }))}
            <NumberField
              disabled={disabled}
              label="Wall thickness (m)"
              value={wall.thickness}
              onCommit={(thickness) => patchWall({ thickness })}
            />
            <NumberField
              disabled={disabled}
              label="Wall height (m)"
              value={wall.height}
              onCommit={(height) => patchWall({ height })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Opening offset is measured in metres from the wall start to the opening centre.
          </p>
          {(wall.openings ?? []).map((opening, index) => (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3" key={opening.id}>
              {(['offset', 'width', 'height', 'sill'] as const).map((field) => (
                <NumberField
                  key={field}
                  disabled={disabled}
                  label={`Opening ${index + 1} ${field} (m)`}
                  value={opening[field] ?? 0}
                  onCommit={(value) =>
                    patchWall({
                      openings: wall.openings?.map((item) =>
                        item.id === opening.id ? { ...item, [field]: value } : item,
                      ),
                    })
                  }
                />
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  patchWall({ openings: wall.openings?.filter((item) => item.id !== opening.id) })
                }
              >
                Delete opening
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const start = sourceToMetres(wall.start, floor.coordinateSystem),
                end = sourceToMetres(wall.end, floor.coordinateSystem);
              const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
              patchWall({
                openings: [
                  ...(wall.openings ?? []),
                  {
                    id: crypto.randomUUID(),
                    offset: length / 2,
                    width: Math.min(1.2, length * 0.5),
                    height: Math.min(2.1, wall.height),
                    sill: 0,
                  },
                ],
              });
            }}
          >
            Add opening
          </Button>
        </>
      )}
      {zone && (
        <>
          <Label>
            Zone label
            <Input
              disabled={disabled}
              defaultValue={zone.label}
              key={`label-${zone.id}-${zone.label}`}
              onBlur={(event) =>
                patch({
                  zones: data?.zones?.map((item) =>
                    item.id === zone.id ? { ...item, label: event.target.value } : item,
                  ),
                })
              }
            />
          </Label>
          <Label>
            Zone type
            <select
              className="mt-2 rounded-md border bg-background p-2"
              disabled={disabled}
              value={zone.type}
              onChange={(event) =>
                patch({
                  zones: data?.zones?.map((item) =>
                    item.id === zone.id
                      ? { ...item, type: event.target.value as typeof zone.type }
                      : item,
                  ),
                })
              }
            >
              {['walkable', 'blocked', 'display'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Label>
          <Label>
            Zone vertices in metres [X,Z]
            <Textarea
              disabled={disabled}
              aria-label="Zone vertices metres"
              value={polygonDraft}
              onChange={(event) => setPolygonDraft(event.target.value)}
            />
          </Label>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              try {
                const polygon: unknown = JSON.parse(polygonDraft);
                if (
                  !Array.isArray(polygon) ||
                  polygon.length < 3 ||
                  !polygon.every(
                    (point) =>
                      Array.isArray(point) &&
                      point.length === 2 &&
                      point.every((value) => typeof value === 'number' && Number.isFinite(value)),
                  )
                ) {
                  onMessage(
                    'Use at least three zone vertices, each a finite [X,Z] pair in metres.',
                  );
                  return;
                }
                patch({
                  zones: data?.zones?.map((item) =>
                    item.id === zone.id
                      ? {
                          ...item,
                          polygon: (polygon as Array<[number, number]>).map((point) =>
                            metresToSource(point, floor.coordinateSystem),
                          ),
                        }
                      : item,
                  ),
                });
              } catch {
                onMessage('Zone vertices must be valid JSON. The last valid zone is retained.');
              }
            }}
          >
            Apply zone vertices
          </Button>
        </>
      )}
      {poi && (
        <>
          <Label>
            POI label
            <Input
              disabled={disabled}
              defaultValue={poi.label}
              key={`poi-${poi.id}-${poi.label}`}
              onBlur={(event) => patchPoi({ label: event.target.value })}
            />
          </Label>
          <Label>
            POI type
            <select
              className="mt-2 rounded-md border bg-background p-2"
              disabled={disabled}
              value={poi.type}
              onChange={(event) => patchPoi({ type: event.target.value as typeof poi.type })}
            >
              {['entry', 'exit', 'amenity', 'information', 'custom'].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {pointFields('POI position', poi.position, (position) => patchPoi({ position }))}
          </div>
          <Label>
            Amenity category
            <select
              className="mt-2 rounded-md border bg-background p-2"
              disabled={disabled}
              value={poi.amenity ?? ''}
              onChange={(event) =>
                patchPoi({ amenity: (event.target.value || undefined) as typeof poi.amenity })
              }
            >
              <option value="">None / generic</option>
              {['exit', 'washroom', 'elevator', 'food', 'coffee', 'information', 'atm'].map(
                (category) => (
                  <option key={category}>{category}</option>
                ),
              )}
            </select>
          </Label>
        </>
      )}
      <Button
        variant="outline"
        disabled={!wall && !zone && !poi}
        onClick={() => {
          if (wall) {
            patch({ walls: data?.walls?.filter((item) => item.id !== wall.id) });
          }
          if (zone) {
            patch({ zones: data?.zones?.filter((item) => item.id !== zone.id) });
          }
          if (poi) {
            patch({ pois: data?.pois?.filter((item) => item.id !== poi.id) });
          }
          setSelection(null);
        }}
      >
        Delete selected feature
      </Button>
    </fieldset>
  );
}
