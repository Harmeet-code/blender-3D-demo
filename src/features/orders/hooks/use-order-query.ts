import { queryOptions, useQuery } from '@tanstack/react-query';
import { unwrapQueryResult } from '@/api/query-result.ts';
import { getOrder } from '@/features/orders/api/orders-client.ts';

export const orderQueryKey = (eventId: string, orderId: string) =>
  ['events', eventId, 'orders', orderId] as const;

export function orderQueryOptions(eventId: string, orderId: string) {
  return queryOptions({
    queryKey: orderQueryKey(eventId, orderId),
    queryFn: async ({ signal }) => unwrapQueryResult(await getOrder(eventId, orderId, { signal })),
  });
}

export function useOrderQuery(eventId: string, orderId: string) {
  return useQuery({
    ...orderQueryOptions(eventId, orderId),
    enabled: eventId.length > 0 && orderId.length > 0,
  });
}
