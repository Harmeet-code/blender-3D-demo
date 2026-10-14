import { queryOptions, useQuery } from '@tanstack/react-query';
import { unwrapQueryResult } from '@/api/query-result.ts';
import { listBooths } from '@/features/booths/api/booths-client.ts';

export const boothsQueryKey = (eventId: string) => ['events', eventId, 'booths'] as const;

export function boothsQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: boothsQueryKey(eventId),
    queryFn: async ({ signal }) => unwrapQueryResult(await listBooths(eventId, { signal })),
  });
}

export function useBoothsQuery(eventId: string) {
  return useQuery({ ...boothsQueryOptions(eventId), enabled: eventId.length > 0 });
}
