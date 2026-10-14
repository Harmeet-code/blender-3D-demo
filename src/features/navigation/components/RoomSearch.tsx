import { useEffect, useState } from 'react';
import { SearchIcon, StarIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import {
  getNavigationDestinations,
  resolveNavigationDestination,
} from '../model/navigation-destinations.ts';
import {
  useWayfindingPreferences,
  wayfindingScope,
  rememberDestination,
} from '../model/wayfinding-preferences.ts';
import {
  destinationHaystack,
  normalizeSearchText,
} from '@/features/assets/model/amenity-keywords.ts';
import { AmenityIcon, AMENITIES } from './AmenityIcon.tsx';
import { useConfiguredEventId } from '@/app/config/constants.ts';
import { reportTelemetry } from '@/features/venue/model/venue-client.ts';

export function RoomSearch() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [tab, setTab] = useState<'all' | 'recent' | 'saved'>('all');
  const layout = useActiveLayout();
  const eventId = useConfiguredEventId();
  const scope = wayfindingScope(layout);
  const preferences = useWayfindingPreferences((state) => state.records[scope]);
  useEffect(() => {
    useWayfindingPreferences.getState().hydrate(scope);
    setQuery('');
    setCategory('');
  }, [scope]);
  const autopilot = useWorldStore((state) => state.autopilot);
  const routeStatus = useWorldStore((state) => state.routeStatus);
  const routeError = useWorldStore((state) => state.routeError);
  const needle = normalizeSearchText(query);
  const matches = getNavigationDestinations(layout)
    .filter(
      (destination) =>
        (!category || destination.category === category) &&
        (tab === 'all' ||
          preferences?.[tab === 'recent' ? 'recent' : 'saved'].includes(destination.id)) &&
        destinationHaystack(destination).includes(needle),
    )
    .sort((a, b) =>
      tab === 'recent'
        ? (preferences?.recent.indexOf(a.id) ?? 0) - (preferences?.recent.indexOf(b.id) ?? 0)
        : Number(normalizeSearchText(b.label).startsWith(needle)) -
            Number(normalizeSearchText(a.label).startsWith(needle)) ||
          a.label.localeCompare(b.label),
    );
  const active = autopilot
    ? resolveNavigationDestination(layout, autopilot.destinationId)
    : undefined;
  return (
    <details className="absolute bottom-3 left-3 z-10 w-[calc(100%-11rem)] max-w-80 rounded-xl border bg-background/90 shadow-lg backdrop-blur-md">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-3 text-sm">
        <SearchIcon className="size-4" />
        Find a place
      </summary>
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto border-t p-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Booth, coffee, exit…"
          aria-label="Search booths and amenities"
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-xs"
          aria-label="Amenity category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All places</option>
          {AMENITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1">
          {(['all', 'recent', 'saved'] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={tab === item ? 'default' : 'ghost'}
              aria-pressed={tab === item}
              onClick={() => setTab(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        {(autopilot || routeStatus === 'computing') && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => useWorldStore.getState().cancelAutopilot()}
          >
            <XIcon className="size-4" />
            {autopilot ? `Stop ${active?.label ?? 'walking'}` : 'Cancel route'}
          </Button>
        )}
        {routeError && (
          <p role="status" className="text-xs text-destructive">
            {routeError}
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {matches.slice(0, 50).map((destination) => (
            <li key={destination.id} className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-w-0 flex-1 justify-start"
                disabled={routeStatus === 'computing'}
                onClick={() => {
                  const world = useWorldStore.getState();
                  world.selectBooth(destination.roomId ?? null);
                  void world
                    .startAutopilot(
                      destination.id,
                      preferences?.stepFree ? { enabledPortalTypes: ['elevator'] } : undefined,
                    )
                    .then((started) => {
                      if (started) {
                        rememberDestination(layout, destination.id);
                        reportTelemetry(eventId, [
                          ...(query.trim() ? [{ kind: 'search' as const }] : []),
                          { kind: 'route' as const },
                        ]);
                        setQuery('');
                      } else {
                        const error = useWorldStore.getState().routeError;
                        if (error) {
                          toast.error(error);
                        }
                      }
                    });
                }}
              >
                <AmenityIcon category={destination.amenity} />
                <span className="truncate">{destination.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {destination.floorId}
                </span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`${preferences?.saved.includes(destination.id) ? 'Unsave' : 'Save'} ${destination.label}`}
                aria-pressed={preferences?.saved.includes(destination.id) ?? false}
                onClick={() =>
                  useWayfindingPreferences.getState().update(scope, (previous) => ({
                    ...previous,
                    saved: previous.saved.includes(destination.id)
                      ? previous.saved.filter((id) => id !== destination.id)
                      : [destination.id, ...previous.saved].slice(0, 30),
                  }))
                }
              >
                <StarIcon
                  className={`size-4 ${preferences?.saved.includes(destination.id) ? 'fill-amber-400 text-amber-500' : ''}`}
                />
              </Button>
            </li>
          ))}
        </ul>
        {!matches.length && (
          <p className="text-xs text-muted-foreground">
            No matching places. An organizer can add amenities in the floor builder.
          </p>
        )}
        {matches.length > 50 && (
          <p className="text-xs text-muted-foreground">
            Showing 50 of {matches.length}; refine your search.
          </p>
        )}
      </div>
    </details>
  );
}
