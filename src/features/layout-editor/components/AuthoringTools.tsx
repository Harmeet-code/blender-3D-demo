import { useState } from 'react';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { Box3, Vector3 } from 'three';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import {
  BOOTH_DIMENSIONS_FEET,
  METRES_PER_FOOT,
} from '@/features/building/model/booth-dimensions.ts';

import { getAssetCatalog } from '@/features/assets/model/catalog.ts';

import { uploadMedia } from '../api/media-client.ts';

import { boothModelFor } from '@/features/assets/model/booth-models.ts';

import { mediaUrl } from '../api/media-client.ts';

import { INVENTORY_DRAG_TYPE, type InventoryDrag } from '../model/inventory-drag.ts';

import type { DragEvent } from 'react';
import { disposeMeasuredImport } from '@/features/assets/model/dispose-measured-import.ts';

export type PlacementChoice = {
  assetId?: string;

  url?: string;

  dimensions: [number, number, number];
};

export function AuthoringTools({
  tool,

  setTool,

  feet,

  setFeet,

  choice,

  setChoice,

  calibrationFeet,

  setCalibrationFeet,

  onMessage,

  calibrationRequired = false,

  onInventoryDrag,
}: {
  tool: string;

  setTool: (value: string) => void;

  feet: [number, number];

  setFeet: (value: [number, number]) => void;

  choice: PlacementChoice;

  setChoice: (value: PlacementChoice) => void;

  calibrationFeet: number;

  setCalibrationFeet: (value: number) => void;

  onMessage: (message: string) => void;

  calibrationRequired?: boolean;

  onInventoryDrag: (value: InventoryDrag | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const booth = boothModelFor(feet);

  const startDrag = (event: DragEvent, value: InventoryDrag) => {
    event.dataTransfer.setData(INVENTORY_DRAG_TYPE, JSON.stringify(value));

    event.dataTransfer.effectAllowed = 'copy';

    onInventoryDrag(value);
  };

  return (
    <div className="grid gap-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap gap-2">
        {[
          ['boundary', 'Floor boundary'],

          ['obstacle', 'Blocked area'],

          ['spawn', 'Avatar start'],

          ['wall', 'Draw wall'],

          ['zone', 'Draw zone'],

          ['poi', 'Place point of interest'],

          ['calibrate', 'Calibrate two points'],

          ['calibrate-rectangle', 'Calibrate rectangle'],

          ['booth-preset', 'Place sized booth'],

          ['asset', 'Place 3D asset'],
        ].map(([id, label]) => (
          <Button
            key={id}

            size="sm"

            disabled={calibrationRequired && !['calibrate', 'calibrate-rectangle'].includes(id!)}

            variant={tool === id ? 'default' : 'outline'}

            onClick={() => setTool(id!)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label>
          Booth preset (feet)
          <select
            aria-label="Booth size preset"

            className="mt-2 w-full rounded-md border bg-background p-2"

            value={feet.join('x')}

            onChange={(e) => setFeet(e.target.value.split('x').map(Number) as [number, number])}
          >
            {BOOTH_DIMENSIONS_FEET.map((size) => (
              <option key={size.join('x')} value={size.join('x')}>
                {size[0]} × {size[1]} ft
              </option>
            ))}
            <option value={feet.join('x')}>Custom size</option>
          </select>
        </Label>
        {([0, 1] as const).map((axis) => (
          <Label key={axis}>
            {axis === 0 ? 'Width' : 'Depth'} (ft)
            <Input
              type="number"

              min="0.1"

              step=".1"

              aria-label={axis === 0 ? 'Booth width feet' : 'Booth depth feet'}

              value={feet[axis]}

              onChange={(e) => {
                const n = Number(e.target.value);

                if (n > 0) {
                  const value: [number, number] = [...feet];

                  value[axis] = n;

                  setFeet(value);
                }
              }}
            />
          </Label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Actual footprint: {(feet[0] * METRES_PER_FOOT).toFixed(4)} ×{' '}
        {(feet[1] * METRES_PER_FOOT).toFixed(4)} m. Click the plan to place the booth; select and
        drag it to move. Facing rotates new placements.
      </p>
      {booth && (
        <div className="flex items-center gap-4">
          <img
            src={mediaUrl(booth.preview)}

            alt={`${feet[0]} by ${feet[1]} foot booth reference`}

            className="h-28 w-36 rounded-lg border object-cover"
          />
          <p className="text-sm">
            {booth.label}
            <br />
            <span className="text-muted-foreground">
              Physical booth · 2.8 m high · open entrance
              <br />
              You choose its position on the floor plan.
            </span>
          </p>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3" aria-label="Drag and drop inventory">
        <Button
          variant="outline"
          disabled={calibrationRequired}
          draggable={!calibrationRequired}

          onDragStart={(event) => startDrag(event, { kind: 'booth', feet })}
          onDragEnd={() => onInventoryDrag(null)}

          onClick={() => setTool('booth-preset')}
          className="h-auto cursor-grab flex-col items-start gap-1 p-3 text-left"
        >
          <span>
            Booth · {feet[0]} × {feet[1]} ft
          </span>
          <span className="text-xs text-muted-foreground">
            Drag onto the plan or click, then place
          </span>
        </Button>
        {getAssetCatalog()
          .filter((asset) => asset.id !== 'booth-ceiling')
          .map((asset) => {
            const selected = { assetId: asset.id, dimensions: asset.dimensions };

            return (
              <Button
                key={asset.id}
                variant="outline"
                disabled={calibrationRequired}
                draggable={!calibrationRequired}

                onDragStart={(event) => startDrag(event, { kind: 'asset', choice: selected })}
                onDragEnd={() => onInventoryDrag(null)}

                onClick={() => {
                  setChoice(selected);
                  setTool('asset');
                }}
                className="h-auto cursor-grab flex-col items-start gap-1 p-3 text-left"
              >
                <span>{asset.label}</span>
                <span className="text-xs text-muted-foreground">
                  {asset.dimensions.map((value) => value.toFixed(2)).join(' × ')} m
                </span>
              </Button>
            );
          })}
        {choice.url && (
          <Button
            variant="outline"
            disabled={calibrationRequired}
            draggable={!calibrationRequired}

            onDragStart={(event) => startDrag(event, { kind: 'asset', choice })}
            onDragEnd={() => onInventoryDrag(null)}
            onClick={() => setTool('asset')}
          >
            Imported model · drag to place
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Label>
          Inventory asset
          <select
            aria-label="Asset library"

            className="mt-2 w-full rounded-md border bg-background p-2"

            value={choice.assetId ?? ''}

            onChange={(e) => {
              const asset = getAssetCatalog().find((a) => a.id === e.target.value);

              if (asset) {
                setChoice({ assetId: asset.id, dimensions: asset.dimensions });
              }
            }}
          >
            <option value="">Imported GLB</option>
            {getAssetCatalog()
              .filter((a) => !['booth-frame', 'floor-tile', 'booth-ceiling'].includes(a.id))

              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label}
                </option>
              ))}
          </select>
        </Label>
        <Label>
          Import custom artifact (.glb)
          <Input
            aria-label="Import Blender GLB"

            disabled={busy}

            type="file"

            accept=".glb"

            onChange={async (e) => {
              const file = e.target.files?.[0];

              if (!file) {
                return;
              }

              setBusy(true);

              try {
                if (file.size > 50 * 1024 * 1024) {
                  throw new Error('GLB must be under 50 MiB.');
                }

                // Validate the GLB's embedded buffers/textures before the loader resolves any URI.

                const uploaded = await uploadMedia(file);

                const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), '');

                try {
                  const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
                  if (![size.x, size.y, size.z].every((n) => Number.isFinite(n) && n > 0)) {
                    throw new Error('Model needs a nonzero 3D footprint.');
                  }
                  setChoice({ url: uploaded.url, dimensions: [size.x, size.y, size.z] });
                } finally {
                  disposeMeasuredImport(gltf.scenes);
                }

                setTool('asset');

                onMessage(`Imported ${file.name}. Click to place; Model units are metres.`);
              } catch (error) {
                onMessage(error instanceof Error ? error.message : 'Import failed.');
              } finally {
                setBusy(false);

                e.target.value = '';
              }
            }}
          />
        </Label>
        <Label>
          Known calibration length (ft)
          <Input
            aria-label="Calibration length feet"

            type="number"

            min=".1"

            value={calibrationFeet}

            onChange={(e) => {
              const n = Number(e.target.value);

              if (n > 0) {
                setCalibrationFeet(n);
              }
            }}
          />
        </Label>
      </div>
      {tool === 'calibrate' && (
        <p className="text-sm">
          Click both ends of a known edge. For SW13, use 30 ft (9.144 m). Calibration measures the
          edge, independent of preview resolution.
        </p>
      )}
      {tool === 'calibrate-rectangle' && (
        <p className="text-sm">
          Set the reference width and depth above. Click a corner, the other end of its width edge,
          then the other end of its depth edge (both share the first corner). This also corrects
          nonuniform stretching and rotation. Camera perspective and lens distortion require a
          rectified plan.
        </p>
      )}
    </div>
  );
}
