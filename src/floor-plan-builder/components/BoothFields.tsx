import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { boothDesign, boothDesignError, boothEdges } from '../model/booth.ts';
import type { BoothDesign } from '../model/booth-schema.ts';
import type { PlanObject } from '../model/types.ts';

export function BoothFields({
  object,
  patch,
}: {
  object: PlanObject;
  patch: (updates: Partial<PlanObject>) => void;
}) {
  const design = boothDesign(object),
    edges = boothEdges(object);
  const [surface, setSurface] = useState('floor');
  const update = (updates: Partial<BoothDesign>) =>
    patch({ boothDesign: { ...design, ...updates } });
  const surfaces = [
    'floor',
    ...edges.flatMap((edge) => [
      `wall-${edge.index}-inner`,
      `wall-${edge.index}-outer`,
      `header-${edge.index}`,
      `plinth-${edge.index}`,
    ]),
  ];
  const selected = surfaces.includes(surface) ? surface : 'floor';
  const fallback =
    selected === 'floor'
      ? object.color
      : selected.startsWith('header')
        ? '#1E2022'
        : selected.startsWith('plinth')
          ? '#C0C4C8'
          : design.primaryColor;
  const error = boothDesignError(object);
  const editEdge = (index: number, updates: Partial<BoothDesign['edges'][number]>) =>
    update({
      layout: 'custom',
      edges: edges.map((edge) => ({
        edge: edge.index,
        mode: edge.mode,
        width: edge.opening === 2 ? 2 : 1.2,
        ...(edge.index === index ? updates : {}),
      })),
    });
  const example = (kind: 'L' | 'U') => {
    const raw: [number, number][] =
      kind === 'L'
        ? [
            [0, 0],
            [4, 0],
            [4, 2],
            [2, 2],
            [2, 4],
            [0, 4],
          ]
        : [
            [0, 0],
            [5, 0],
            [5, 4],
            [3.5, 4],
            [3.5, 1.5],
            [1.5, 1.5],
            [1.5, 4],
            [0, 4],
          ];
    const bounds = polygonBounds(raw),
      w = bounds.maxX - bounds.minX,
      d = bounds.maxZ - bounds.minZ;
    const polygon = raw.map(([x, z]): [number, number] => [x - w / 2, z - d / 2]);
    const openings = kind === 'L' ? [1, 4] : [2, 6];
    patch({
      recipe: 'polygon-booth',
      polygon,
      dimensions: [w, Math.max(2.2, object.dimensions[1]), d],
      boothDesign: {
        ...design,
        layout: 'custom',
        edges: polygon.map((_, edge) => ({
          edge,
          mode: openings.includes(edge) ? 'open' : 'wall',
          width: 1.2,
        })),
        storage: false,
      },
    });
  };
  return (
    <div className="fp-form" aria-label="Booth construction settings">
      <p className="fp-muted">
        Modular shell scheme · 80 mm panels · 350 mm fascia · 80 mm plinth. Profiles keep their
        physical thickness when the footprint is stretched.
      </p>
      {error && (
        <p className="fp-error" role="alert">
          {error}
        </p>
      )}
      <Label>
        Shell layout
        <select
          aria-label="Shell layout"
          value={design.layout}
          onChange={(event) =>
            update({ layout: event.target.value as BoothDesign['layout'], edges: [] })
          }
        >
          <option value="inline">Inline — front open</option>
          <option value="corner">Corner — two sides open</option>
          <option value="peninsula">Peninsula — three sides open</option>
          <option value="island">Island — all sides open</option>
          <option value="custom">Custom edges</option>
        </select>
      </Label>
      <Label>
        Roof mode
        <select
          aria-label="Roof mode"
          value={design.roof}
          onChange={(event) => update({ roof: event.target.value as BoothDesign['roof'] })}
        >
          <option value="open">Open</option>
          <option value="truss">Truss grid</option>
          <option value="solid">Solid roof</option>
        </select>
      </Label>
      <div className="fp-row">
        <Button size="sm" variant="outline" onClick={() => example('L')}>
          L-shaped example
        </Button>
        <Button size="sm" variant="outline" onClick={() => example('U')}>
          U-shaped example
        </Button>
      </div>
      <p className="fp-muted">
        The U example uses fully open ends. Its 1.5 m edges cannot fit a 1.2 m doorway plus two 0.3
        m margins.
      </p>
      <Label>
        Panel primary color
        <Input
          aria-label="Panel primary color"
          type="color"
          value={design.primaryColor}
          onChange={(event) => update({ primaryColor: event.target.value })}
        />
      </Label>
      <Label>
        Surface override
        <select
          aria-label="Surface override"
          value={selected}
          onChange={(event) => setSurface(event.target.value)}
        >
          {surfaces.map((id) => (
            <option key={id}>{id}</option>
          ))}
        </select>
      </Label>
      <div className="fp-row">
        <Input
          aria-label="Surface color"
          type="color"
          value={design.surfaceColors[selected] ?? fallback}
          onChange={(event) =>
            update({ surfaceColors: { ...design.surfaceColors, [selected]: event.target.value } })
          }
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!design.surfaceColors[selected]}
          onClick={() => {
            const colors = { ...design.surfaceColors };
            delete colors[selected];
            update({ surfaceColors: colors });
          }}
        >
          Use inherited color
        </Button>
      </div>
      <p className="fp-muted">
        Carpet inherits the sampled or explicit object color. Panel sides inherit the primary color.
        Headers and plinths retain dark/aluminum defaults.
      </p>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={design.storage}
        onClick={() => update({ storage: !design.storage })}
      >
        Storage closet {design.storage ? 'on' : 'off'}
      </Button>
      {design.storage && (
        <Button
          variant="outline"
          size="sm"
          aria-pressed={design.closetDoorOpen}
          onClick={() => update({ closetDoorOpen: !design.closetDoorOpen })}
        >
          {design.closetDoorOpen ? 'Close' : 'Open'} sliding closet door
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-pressed={design.snap}
        onClick={() => update({ snap: !design.snap })}
      >
        Corner / shared-wall snapping {design.snap ? 'on' : 'off'}
      </Button>
      <Label>
        External placement clearance (m)
        <Input
          aria-label="External placement clearance (m)"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={Number.isFinite(design.clearance) ? design.clearance : ''}
          onChange={(event) =>
            update({ clearance: event.target.value === '' ? NaN : Number(event.target.value) })
          }
        />
      </Label>
      <p className="fp-muted">
        New rectangular/polygon booths default to 0.10/0.15 m clearance. Two snapped closed walls
        may share an edge. Navigation uses walls and columns, leaving the booth interior accessible.
      </p>
      <details>
        <summary>Walls & entrances · vertex-order edge numbers</summary>
        <div className="fp-form">
          {edges.map((edge) => (
            <div className="fp-form" key={edge.index}>
              <Label>
                Edge {edge.index + 1} · {edge.length.toFixed(2)} m
                <select
                  aria-label={`Edge ${edge.index + 1} mode`}
                  value={edge.mode}
                  onChange={(event) =>
                    editEdge(edge.index, {
                      mode: event.target.value as BoothDesign['edges'][number]['mode'],
                    })
                  }
                >
                  <option value="wall">Wall</option>
                  <option value="open">Full open + fascia</option>
                  <option value="entrance">Doorway + fascia</option>
                </select>
              </Label>
              {edge.mode === 'entrance' && (
                <Label>
                  Doorway width
                  <select
                    aria-label={`Edge ${edge.index + 1} doorway width`}
                    value={edge.opening}
                    onChange={(event) =>
                      editEdge(edge.index, { width: Number(event.target.value) as 1.2 | 2 })
                    }
                  >
                    <option value={1.2}>1.2 m</option>
                    <option value={2}>2.0 m</option>
                  </select>
                </Label>
              )}
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => update({ layout: 'inline', edges: [] })}
          >
            Reset edge configuration
          </Button>
        </div>
      </details>
    </div>
  );
}
