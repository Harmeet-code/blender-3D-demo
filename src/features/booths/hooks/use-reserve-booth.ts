import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrapQueryResult } from '@/api/query-result.ts';
import { reserveBooth } from '@/features/booths/api/booths-client.ts';
import { boothsQueryKey } from './use-booths-query.ts';

export function useReserveBooth(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['events', eventId, 'booths', 'reserve'],
    mutationFn: async (input: { boothId: string; addOns: string[] }) =>
      unwrapQueryResult(await reserveBooth(eventId, input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boothsQueryKey(eventId) }),
  });
}
