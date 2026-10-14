import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { VENUE_KITS } from '@/features/assets/model/venue-kit-presets.ts';
import type { AssetId } from '@/features/assets/model/asset-schema.ts';
import {
  composeKitLayout,
  MAX_KIT_ITEM_COUNT,
  venueKitCountSummary,
  type VenueKitCountSummary,
} from '@/features/building/model/venue-kit-layout.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';

interface KitItemChoice {
  assetId: AssetId;
  defaultCount: number;
  note?: string;
}

interface KitPreview {
  layout: BuildingLayout;
  counts: VenueKitCountSummary[];
  source: BuildingLayout;
}

/** Explicitly review a quantity-configured starter before replacing the editor draft. */
export function VenueKitStarter({
  currentLayout,
  onGenerate,
}: {
  currentLayout: BuildingLayout;
  onGenerate: (layout: BuildingLayout) => boolean | void;
}) {
  const [kitId, setKitId] = useState(VENUE_KITS[0]!.id);
  const kit = VENUE_KITS.find((item) => item.id === kitId) ?? VENUE_KITS[0]!;
  const items = useMemo(() => {
    const combined = new Map<AssetId, KitItemChoice>();
    for (const item of kit.items) {
      const existing = combined.get(item.assetId);
      combined.set(item.assetId, {
        assetId: item.assetId,
        defaultCount: (existing?.defaultCount ?? 0) + item.count,
        note: [existing?.note, item.note].filter(Boolean).join(' · ') || undefined,
      });
    }
    return [...combined.values()];
  }, [kit]);
  const [counts, setCounts] = useState<Partial<Record<AssetId, number>>>(() =>
    Object.fromEntries(items.map((item) => [item.assetId, item.defaultCount])),
  );
  const [preview, setPreview] = useState<KitPreview | null>(null);
  const [error, setError] = useState('');
  const invalidItem = items.find((item) => {
    const count = counts[item.assetId] ?? item.defaultCount;
    return !Number.isInteger(count) || count < 0 || count > MAX_KIT_ITEM_COUNT;
  });
  const existingInstances = currentLayout.floors.reduce(
    (total, floor) => total + (floor.authoring?.instances.length ?? 0),
    0,
  );

  const chooseKit = (nextKitId: string) => {
    const nextKit = VENUE_KITS.find((item) => item.id === nextKitId);
    if (!nextKit) {
      return;
    }
    const nextCounts = new Map<AssetId, number>();
    for (const item of nextKit.items) {
      nextCounts.set(item.assetId, (nextCounts.get(item.assetId) ?? 0) + item.count);
    }
    setKitId(nextKitId);
    setCounts(Object.fromEntries(nextCounts));
    setPreview(null);
    setError('');
  };

  const setItemCount = (assetId: AssetId, count: number) => {
    setCounts((current) => ({ ...current, [assetId]: count }));
    setPreview(null);
    setError('');
  };

  const review = () => {
    if (invalidItem) {
      setError(`Choose a whole number from 0 to ${MAX_KIT_ITEM_COUNT} for ${invalidItem.assetId}.`);
      return;
    }
    try {
      const layout = composeKitLayout(kit.id, counts);
      const summary = venueKitCountSummary(kit.id, layout, counts);
      setPreview({ layout, counts: summary, source: currentLayout });
      setError('');
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'This venue kit could not be generated.');
    }
  };

  const confirm = () => {
    if (!preview) {
      return;
    }
    if (preview.source !== currentLayout) {
      setPreview(null);
      setError(
        'The editor layout changed after this review. Review the starter again before replacing it.',
      );
      return;
    }
    try {
      if (onGenerate(preview.layout) === false) {
        setError(
          'The generated layout could not be applied. Review the editor error and try again.',
        );
        return;
      }
      setPreview(null);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The starter could not be applied.');
    }
  };

  return (
    <section className="grid gap-3 rounded-lg border p-3" aria-label="Starter venue kit">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Starter venue kit
          <select
            aria-label="Starter venue kit"
            value={kit.id}
            onChange={(event) => chooseKit(event.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-xs"
            disabled={!!preview}
          >
            {VENUE_KITS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {!preview && (
          <Button type="button" variant="outline" onClick={review} disabled={!!invalidItem}>
            Review starter
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{kit.description}</p>
      <p className="text-xs text-muted-foreground">
        Kits are metric layout starters, not complete or code-reviewed buildings. The hospital kit's
        ramps are visual markers and do not provide slope traversal.
      </p>
      <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-xs font-medium">
          Choose items and quantities (0–{MAX_KIT_ITEM_COUNT} each)
        </legend>
        {items.map((item) => {
          const count = counts[item.assetId] ?? item.defaultCount;
          return (
            <div
              key={item.assetId}
              className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 rounded-md border px-2 py-2"
            >
              <label className="flex min-w-0 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={count > 0}
                  disabled={!!preview}
                  onChange={(event) =>
                    setItemCount(
                      item.assetId,
                      event.target.checked ? Math.max(1, item.defaultCount) : 0,
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.assetId}</span>
                  {item.note && <span className="block text-muted-foreground">{item.note}</span>}
                </span>
              </label>
              <input
                aria-label={`${item.assetId} quantity`}
                type="number"
                min={0}
                max={MAX_KIT_ITEM_COUNT}
                step={1}
                value={count}
                disabled={!!preview || count === 0}
                onChange={(event) => setItemCount(item.assetId, Number(event.target.value))}
                className="h-8 w-20 rounded-md border bg-background px-2 text-xs"
              />
            </div>
          );
        })}
      </fieldset>
      {invalidItem ? (
        <p role="alert" className="text-sm text-destructive">
          {invalidItem.assetId} quantity must be a whole number from 0 to {MAX_KIT_ITEM_COUNT}.
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {preview && (
        <div className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <h3 className="text-sm font-semibold">Review replacement</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              This will replace the editor layout ({currentLayout.floors.length} floors,{' '}
              {currentLayout.rooms.length} rooms, {existingInstances} authored instances) with a{' '}
              {preview.layout.floors.length}-floor starter ({preview.layout.rooms.length} booth
              rooms,{' '}
              {preview.layout.floors.reduce(
                (total, floor) => total + (floor.authoring?.instances.length ?? 0),
                0,
              )}{' '}
              authored instances). The current editor state stays in Undo history. Confirm applies
              an unpublished editor draft; it does not publish the venue.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The two-floor elevator connection and its landing fixtures are generated separately
              from authored item quantities.
            </p>
          </div>
          <div className="max-h-48 overflow-auto rounded-md border bg-background">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2">Item</th>
                  <th className="p-2">Selected</th>
                  <th className="p-2">Generated rooms</th>
                  <th className="p-2">Generated instances</th>
                </tr>
              </thead>
              <tbody>
                {preview.counts.map((item) => (
                  <tr key={item.assetId} className="border-t">
                    <td className="p-2">{item.assetId}</td>
                    <td className="p-2">{item.selected}</td>
                    <td className="p-2">{item.rooms}</td>
                    <td className="p-2">{item.instances}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={confirm}>
              Confirm and replace editor draft
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPreview(null);
                setError('');
              }}
            >
              Keep current layout
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
