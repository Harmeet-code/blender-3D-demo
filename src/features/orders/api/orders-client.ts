import type { Result } from 'neverthrow';
import type { AxiosRequestConfig } from 'axios';
import type { ApiError } from '@/api/api-result.ts';
import { apiResultValidated } from '@/api/api-result.ts';
import { apiBaseUrl } from '@/api/base-url.ts';
import { orderSummarySchema, type OrderSummary } from '@/features/orders/api/dto.ts';

export type { OrderSummary };

export function getOrder(
  eventId: string,
  orderId: string,
  config?: AxiosRequestConfig,
): Promise<Result<OrderSummary, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/orders/${orderId}`,
    orderSummarySchema,
    config,
  );
}
