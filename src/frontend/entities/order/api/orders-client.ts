import type { Result } from 'neverthrow';
import type { ApiError } from '../../../shared/result/api-result.ts';
import { apiResultValidated } from '../../../shared/result/api-result.ts';
import { apiBaseUrl } from '../../../shared/api/http.ts';
import { orderSummarySchema, type OrderSummary } from './dto.ts';

export type { OrderSummary };

export function getOrder(
  eventId: string,
  orderId: string,
): Promise<Result<OrderSummary, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/orders/${orderId}`,
    orderSummarySchema,
  );
}
