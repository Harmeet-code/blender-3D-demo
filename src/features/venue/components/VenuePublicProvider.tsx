import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useConfiguredEventId } from '@/app/config/constants.ts';
import { apiBaseUrl } from '@/api/base-url.ts';
import type { VenuePublicView } from '../model/venue-contracts.ts';
import { Button } from '@/components/ui/button';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';

const PublicVenue = createContext<{
  data?: VenuePublicView;
  heatmap: boolean;
  operations: boolean;
}>({ heatmap: false, operations: false });
export const usePublicVenue = () => useContext(PublicVenue);
export function VenuePublicProvider({ children }: { children: ReactNode }) {
  const eventId = useConfiguredEventId();
  const [heatmap, setHeatmap] = useState(false);
  const [operations, setOperations] = useState(false);
  const floorId = useWorldStore((state) => state.currentFloorId);
  const query = useQuery({
    queryKey: ['venue-public', eventId],
    queryFn: async ({ signal }): Promise<VenuePublicView> => {
      const response = await fetch(
        `${apiBaseUrl()}/api/venue/events/${encodeURIComponent(eventId)}/public`,
        { signal, cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('Live venue information is unavailable.');
      }
      return response.json();
    },
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const data = query.data?.eventId === eventId ? query.data : undefined;
  return (
    <PublicVenue.Provider value={{ data, heatmap, operations }}>
      {children}
      <details className="absolute top-3 right-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border bg-background/90 shadow-lg backdrop-blur-md">
        <summary className="cursor-pointer px-3 py-3 text-sm">Venue layers</summary>
        <div className="flex max-h-[50vh] w-64 max-w-full flex-col gap-3 overflow-y-auto border-t p-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={heatmap}
              onChange={(event) => setHeatmap(event.target.checked)}
            />
            Booth availability
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={operations}
              onChange={(event) => setOperations(event.target.checked)}
            />
            Operations / occupancy
          </label>
          {query.isError && (
            <p role="status">
              Live venue information is unavailable. Floor navigation remains available.
            </p>
          )}
          {heatmap && (
            <p>
              <span className="text-green-500">Green: available</span> ·{' '}
              <span className="text-amber-500">amber: held</span> ·{' '}
              <span className="text-blue-500">blue: booked</span> · grey: unavailable
            </p>
          )}
          {data && (
            <p className="text-muted-foreground">
              Venue revision {data.version}. Refreshes every 15 seconds while visible.
            </p>
          )}
          {operations &&
            data?.operations
              .filter((item) => item.floorId === floorId)
              .map((item) => (
                <p key={item.id}>
                  {item.kind} · ({item.position[0].toFixed(1)}, {item.position[1].toFixed(1)}) m
                  {item.count !== undefined ? ` · ${item.count} people` : ''}
                </p>
              ))}
          {data?.signage.map((item) => (
            <div key={item.id} className="rounded-md border p-2">
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
              {item.destinationId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    void useWorldStore.getState().startAutopilot(item.destinationId!);
                  }}
                >
                  Directions
                </Button>
              )}
            </div>
          ))}
        </div>
      </details>
    </PublicVenue.Provider>
  );
}
