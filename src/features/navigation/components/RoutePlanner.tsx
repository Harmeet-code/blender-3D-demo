import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowDownUpIcon, RouteIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import {
  getNavigationDestinations,
  currentAvatarDestination,
  type NavigationDestination,
} from '../model/navigation-destinations.ts';
import { useRoutePlanner } from '../model/route-planner.ts';
import { avatarRuntime } from '@/features/viewer/model/avatar-runtime.ts';
import { useRouteGuidance } from '../model/route-guidance.ts';
import { RouteGuidance } from './RouteGuidance.tsx';
import { useRoutePointSelection } from '../model/route-point-selection.ts';
import { RoutePointInput } from './RoutePointInput.tsx';
import { useWayfindingPreferences, wayfindingScope } from '../model/wayfinding-preferences.ts';
import { useConfiguredEventId } from '@/app/config/constants.ts';
import {
  destinationHaystack,
  normalizeSearchText,
} from '@/features/assets/model/amenity-keywords.ts';

function DestinationPicker({
  label,
  value,
  destinations,
  onChange,
}: {
  label: string;
  value: string;
  destinations: readonly NavigationDestination[];
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const needle = normalizeSearchText(query);
  const matches = destinations.filter((destination) =>
    destinationHaystack(destination).includes(needle),
  );
  const options = matches.slice(0, 100);
  const selected = destinations.find((destination) => destination.id === value);
  if (selected && !options.includes(selected)) {
    options.unshift(selected);
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <Input
        aria-label={`Filter ${label.toLowerCase()} destinations`}
        placeholder="Search a booth, place or start…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        id={id}
        aria-label={`${label} destination`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border bg-background px-2 text-xs"
      >
        <option value="">Choose a destination</option>
        <option value="__pick_floor_point__">Pick point on floor…</option>
        {options.map((destination) => (
          <option key={destination.id} value={destination.id}>
            {destination.label} · {destination.floorId} · {destination.category}
          </option>
        ))}
      </select>
      {matches.length > 100 && (
        <p className="text-[11px] text-muted-foreground">
          Showing 100 of {matches.length}. Refine your search.
        </p>
      )}
      {matches.length === 0 && (
        <p className="text-[11px] text-muted-foreground">No matching destinations.</p>
      )}
    </div>
  );
}

/** Accessible route planning is independent of avatar movement and teleport commands. */
export function RoutePlanner({
  className = 'absolute top-16 left-3 w-80 max-w-[calc(100%-1.5rem)]',
}: {
  className?: string;
}) {
  const layout = useActiveLayout();
  const eventId = useConfiguredEventId();
  const knownDestinations = getNavigationDestinations(layout);
  const currentFloor = useWorldStore((state) => state.currentFloorId);
  const pointLayout = useRoutePointSelection((state) => state.layout);
  const fromPoint = useRoutePointSelection((state) => state.from);
  const toPoint = useRoutePointSelection((state) => state.to);
  const pickSlot = useRoutePointSelection((state) => state.pickSlot);
  const pointError = useRoutePointSelection((state) => state.error);
  const pointDestinations = useMemo(
    () =>
      pointLayout === layout
        ? [fromPoint, toPoint].filter((point): point is NavigationDestination => !!point)
        : [],
    [layout, pointLayout, fromPoint, toPoint],
  );
  const fixedDestinations = useMemo(
    () => [...knownDestinations, ...pointDestinations],
    [knownDestinations, pointDestinations],
  );
  const routeStatus = useWorldStore((state) => state.routeStatus);
  const destinations = useMemo(
    () => [
      currentAvatarDestination(
        layout,
        avatarRuntime.snapshot(useWorldStore.getState().localAvatar),
      ),
      ...fixedDestinations,
    ],
    [layout, fixedDestinations, currentFloor],
  );
  const currentOriginId = destinations[0]!.id;
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const scope = wayfindingScope(layout);
  const stepFree = useWayfindingPreferences((state) => state.records[scope]?.stepFree ?? false);
  useEffect(() => useWayfindingPreferences.getState().hydrate(scope), [scope]);
  const status = useRoutePlanner((state) => state.status);
  const error = useRoutePlanner((state) => state.error);
  const plan = useRoutePlanner((state) => state.plan);
  const clear = useRoutePlanner((state) => state.clear);
  useEffect(() => {
    if (
      plan?.layout === layout &&
      knownDestinations.some((destination) => destination.id === plan.to.id)
    ) {
      setToId(plan.to.id);
    }
  }, [plan, layout, knownDestinations]);
  useEffect(() => {
    useRoutePointSelection.getState().syncLayout(layout);
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        useRoutePointSelection.getState().cancel();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => {
      window.removeEventListener('keydown', cancel);
      useRoutePointSelection.getState().cancel();
    };
  }, [layout]);
  useEffect(() => {
    if (pointLayout !== layout) {
      return;
    }
    if (fromPoint) {
      clear();
      setFromId(fromPoint.id);
    }
  }, [layout, pointLayout, fromPoint, clear]);
  useEffect(() => {
    if (pointLayout !== layout) {
      return;
    }
    if (toPoint) {
      clear();
      setToId(toPoint.id);
    }
  }, [layout, pointLayout, toPoint, clear]);
  useEffect(() => {
    clear();
    setFromId((current) =>
      current === currentOriginId ||
      knownDestinations.some((destination) => destination.id === current)
        ? current
        : currentOriginId,
    );
    setToId((current) =>
      knownDestinations.some((destination) => destination.id === current) ? current : '',
    );
    return () => {
      clear();
      useRouteGuidance.getState().dismiss();
    };
  }, [layout, knownDestinations, currentOriginId, clear]);
  const chooseFrom = (id: string) => {
    clear();
    if (id === '__pick_floor_point__') {
      useRoutePointSelection.getState().begin(layout, 'from');
      return;
    }
    useRoutePointSelection.getState().cancel();
    setFromId(id);
  };
  const chooseTo = (id: string) => {
    clear();
    if (id === '__pick_floor_point__') {
      useRoutePointSelection.getState().begin(layout, 'to');
      return;
    }
    useRoutePointSelection.getState().cancel();
    setToId(id);
  };
  return (
    <details
      className={`${className} z-10 rounded-xl border bg-background/90 shadow-lg backdrop-blur-md`}
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          useRoutePointSelection.getState().cancel();
        }
      }}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
        <RouteIcon className="size-4" />
        Directions
      </summary>
      <div className="max-h-[55vh] overflow-y-auto border-t px-4 py-3 sm:max-h-[65vh]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void useRoutePlanner.getState().preview(layout, fromId, toId, {
              stepFree,
              eventId,
              fromPoint: pointDestinations.find((point) => point.id === fromId),
              toPoint: pointDestinations.find((point) => point.id === toId),
              ...(fromId === currentOriginId
                ? { currentAvatar: avatarRuntime.snapshot(useWorldStore.getState().localAvatar) }
                : {}),
            });
          }}
          className="flex flex-col gap-3"
        >
          <DestinationPicker
            label="From"
            value={fromId}
            destinations={destinations}
            onChange={chooseFrom}
          />
          <RoutePointInput layout={layout} slot="from" floorId={currentFloor} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Swap start and destination"
            disabled={fromId === currentOriginId}
            title={
              fromId === currentOriginId
                ? 'Choose a fixed origin to swap destinations.'
                : 'Swap start and destination'
            }
            onClick={() => {
              clear();
              useRoutePointSelection.setState({
                from: pointDestinations.find((point) => point.id === toId) ?? null,
                to: pointDestinations.find((point) => point.id === fromId) ?? null,
                pickSlot: null,
                error: null,
              });
              setFromId(toId);
              setToId(fromId);
            }}
          >
            <ArrowDownUpIcon className="size-4" />
            Swap
          </Button>
          <DestinationPicker
            label="To"
            value={toId}
            destinations={fixedDestinations}
            onChange={chooseTo}
          />
          <div className="flex flex-wrap gap-2">
            {(['exit', 'washroom', 'food', 'information', 'atm', 'coffee'] as const).map(
              (category) => (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={status === 'computing'}
                  onClick={() => {
                    setFromId(currentOriginId);
                    void useRoutePlanner
                      .getState()
                      .nearest(
                        layout,
                        category,
                        avatarRuntime.snapshot(useWorldStore.getState().localAvatar),
                        stepFree,
                        eventId,
                      );
                  }}
                >
                  Nearest {category}
                </Button>
              ),
            )}
          </div>
          <RoutePointInput layout={layout} slot="to" floorId={currentFloor} />
          {(pickSlot || pointError) && (
            <div role="status" className="rounded-md border p-2 text-xs">
              {pickSlot && (
                <p>Click a clear point on the floor for {pickSlot}. Press Escape to cancel.</p>
              )}
              {pointError && <p className="text-destructive">{pointError}</p>}
              {pickSlot && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => useRoutePointSelection.getState().cancel()}
                >
                  Cancel point selection
                </Button>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={stepFree}
              onChange={(event) => {
                clear();
                useWayfindingPreferences
                  .getState()
                  .update(scope, (previous) => ({ ...previous, stepFree: event.target.checked }));
              }}
            />
            Step-free · elevators only
          </label>
          <p className="text-xs text-muted-foreground">
            Preview a route between any two places. Your avatar stays where it is.
          </p>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!fromId || !toId || fromId === toId || !!pickSlot || status === 'computing'}
            >
              <RouteIcon className="size-4" />
              {status === 'computing' ? 'Finding route…' : 'Preview route'}
            </Button>
            {status === 'computing' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => useRoutePlanner.getState().cancel()}
              >
                <XIcon className="size-4" />
                Cancel
              </Button>
            ) : (
              (plan || error) && (
                <Button type="button" size="sm" variant="outline" onClick={clear}>
                  Clear
                </Button>
              )
            )}
          </div>
        </form>
        <div aria-live="polite" className="mt-3 text-xs">
          {status === 'computing' && <p>Finding a walkable route across the venue…</p>}
          {error && (
            <p className={status === 'cancelled' ? 'text-muted-foreground' : 'text-destructive'}>
              {error}
            </p>
          )}
          {plan && plan.layout === layout && (
            <>
              <p className="font-medium">
                {Math.round(plan.distanceMetres)} m · about{' '}
                {Math.max(1, Math.ceil(plan.walkingSeconds / 60))} min · {plan.transferCount} floor
                transfer{plan.transferCount === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-muted-foreground">
                Estimate at 1.3 m/s excludes elevator queues and door waits.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={plan.from.kind !== 'avatar' || routeStatus === 'computing'}
                onClick={() => {
                  clear();
                  void useRouteGuidance.getState().start(plan);
                }}
              >
                {routeStatus === 'computing' ? 'Starting…' : 'Go'}
              </Button>
              {plan.from.kind !== 'avatar' && (
                <p className="mt-1 text-muted-foreground">
                  This route starts at another place. Choose “Your current location” as From to
                  start walking.
                </p>
              )}
              {plan.transferCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    const world = useWorldStore.getState();
                    if (!world.dollhouse) {
                      world.toggleDollhouse();
                    }
                  }}
                >
                  Show all route floors
                </Button>
              )}
              <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4">
                {plan.steps.map((step, index) => (
                  <li key={`${index}:${step.floorId}`}>{step.label}</li>
                ))}
              </ol>
            </>
          )}
        </div>
        <RouteGuidance />
      </div>
    </details>
  );
}
