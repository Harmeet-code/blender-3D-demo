import { queryOptions, useQuery } from '@tanstack/react-query';
import { unwrapQueryResult } from '@/api/query-result.ts';
import { getLayout } from '@/features/building/api/layouts-client.ts';

export const layoutQueryKey = (eventId: string) => ['events', eventId, 'layout'] as const;

export function layoutQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: layoutQueryKey(eventId),
    // Authoring owns the live draft; background refetches must not erase unsaved placements.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }) => unwrapQueryResult(await getLayout(eventId, { signal })),
  });
}

export function useLayoutQuery(eventId: string) {
  return useQuery({ ...layoutQueryOptions(eventId), enabled: eventId.length > 0 });
}
