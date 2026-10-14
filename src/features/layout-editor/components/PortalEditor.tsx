import { useEffect, useState } from 'react';
import type { BuildingLayout, Portal } from '@/features/building/model/building-schema.ts';
import { metresToSource, sourceToMetres } from '@/features/building/model/floor-coordinates.ts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function PortalNumber({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
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
          const next = Number(draft);
          if (draft.trim() && Number.isFinite(next)) {
            if (next !== value) {
              onCommit(next);
            }
          } else {
            setDraft(String(value));
          }
        }}
      />
    </Label>
  );
}

export function PortalEditor({
  source,
  portalId,
  setPortalId,
  commit,
  chooseFloor,
}: {
  source: BuildingLayout;
  portalId: string;
  setPortalId: (id: string) => void;
  commit: (source: BuildingLayout) => boolean;
  chooseFloor: (id: string) => void;
}) {
  const [type, setType] = useState<Portal['type']>('elevator');
  const portal = source.portals.find((item) => item.id === portalId);
  const [connects, setConnects] = useState(
    portal?.connects ?? source.floors.map((floor) => floor.id),
  );
  useEffect(
    () => setConnects(portal?.connects ?? source.floors.map((floor) => floor.id)),
    [portal, source.floors],
  );
  const patch = (value: Partial<Portal>) =>
    portal &&
    commit({
      ...source,
      portals: source.portals.map((item) => (item.id === portal.id ? { ...item, ...value } : item)),
    });
  return (
    <section className="grid gap-3 rounded-xl border p-4" aria-label="Floor connectors">
      <p className="font-medium">Connect floors</p>
      <p className="text-xs text-muted-foreground">
        Create a connector, choose its floors, then place and verify an entry on every floor before
        publishing.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Label>
          New connector type
          <select
            className="mt-2 rounded-md border bg-background p-2"
            value={type}
            onChange={(event) => setType(event.target.value as Portal['type'])}
          >
            {['elevator', 'stairs', 'escalator'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Label>
        <Button
          variant="outline"
          disabled={source.floors.length < 2}
          onClick={() => {
            const id = `${type}-${crypto.randomUUID()}`;
            if (
              commit({
                ...source,
                schemaVersion: 2,
                portals: [
                  ...source.portals,
                  { id, type, connects: source.floors.map((floor) => floor.id), entries: [] },
                ],
              })
            ) {
              setPortalId(id);
            }
          }}
        >
          Create floor connector
        </Button>
      </div>
      <Label>
        Connector
        <select
          aria-label="Selected floor connector"
          className="mt-2 w-full rounded-md border bg-background p-2"
          value={portal?.id ?? ''}
          onChange={(event) => setPortalId(event.target.value)}
        >
          <option value="">Choose a connector</option>
          {source.portals.map((item) => (
            <option key={item.id} value={item.id}>
              {item.type} · {item.id}
            </option>
          ))}
        </select>
      </Label>
      {portal && (
        <>
          <Label>
            Connector type
            <select
              className="mt-2 rounded-md border bg-background p-2"
              value={portal.type}
              onChange={(event) => patch({ type: event.target.value as Portal['type'] })}
            >
              {['elevator', 'stairs', 'escalator'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Label>
          <div className="flex flex-wrap gap-3">
            {source.floors.map((floor) => (
              <Label key={floor.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={connects.includes(floor.id)}
                  onChange={(event) =>
                    setConnects(
                      event.target.checked
                        ? [...connects, floor.id]
                        : connects.filter((id) => id !== floor.id),
                    )
                  }
                />
                {floor.name}
              </Label>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={connects.length < 2}
            onClick={() =>
              patch({
                connects,
                entries: portal.entries?.filter((entry) => connects.includes(entry.floorId)),
              })
            }
          >
            Apply connected floors
          </Button>
          {portal.connects.map((floorId) => {
            const floor = source.floors.find((item) => item.id === floorId);
            if (!floor) {
              return null;
            }
            const entry = portal.entries?.find((item) => item.floorId === floorId);
            const disabled = floor.calibrationStatus === 'required';
            const metric = entry ? sourceToMetres(entry.position, floor.coordinateSystem) : null;
            return (
              <div key={floor.id} className="grid gap-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm">
                    {floor.name} · {entry ? 'Entry placed' : 'Entry missing'}
                  </span>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => chooseFloor(floor.id)}
                  >
                    Place entry on {floor.name}
                  </Button>
                </div>
                {disabled && (
                  <p className="text-xs text-muted-foreground">
                    Calibrate this floor before placing or moving its entry.
                  </p>
                )}
                {entry && metric && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {([0, 1] as const).map((axis) => (
                      <PortalNumber
                        key={axis}
                        disabled={disabled}
                        label={`${floor.name} entry ${axis === 0 ? 'X' : 'Z'} (m)`}
                        value={metric[axis]}
                        onCommit={(value) => {
                          const point: [number, number] = [...metric];
                          point[axis] = value;
                          patch({
                            entries: portal.entries?.map((item) =>
                              item.floorId === floor.id
                                ? {
                                    ...item,
                                    position: metresToSource(point, floor.coordinateSystem),
                                  }
                                : item,
                            ),
                          });
                        }}
                      />
                    ))}
                    <PortalNumber
                      disabled={disabled}
                      label={`${floor.name} entry facing (degrees)`}
                      value={(entry.yawRadians * 180) / Math.PI}
                      onCommit={(value) =>
                        patch({
                          entries: portal.entries?.map((item) =>
                            item.floorId === floor.id
                              ? { ...item, yawRadians: (value * Math.PI) / 180 }
                              : item,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        patch({
                          entries: portal.entries?.filter((item) => item.floorId !== floor.id),
                        })
                      }
                    >
                      Delete {floor.name} entry
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          <Button
            variant="outline"
            onClick={() => {
              if (
                commit({
                  ...source,
                  portals: source.portals.filter((item) => item.id !== portal.id),
                })
              ) {
                setPortalId('');
              }
            }}
          >
            Delete connector
          </Button>
        </>
      )}
    </section>
  );
}
