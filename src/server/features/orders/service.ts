import type { Database } from '../../shared/db/postgres.ts';
import { orderSummarySchema, type OrderSummary } from '../../../frontend/entities/order/api/dto.ts';
import {
  err,
  fromRepository,
  notFoundError,
  type AppError,
  type Result,
} from '../../shared/result/errors.ts';
import { validateResponse } from '../../shared/result/validate.ts';
import { fetchOrder } from './repository.ts';

export async function getOrder(
  eventId: string,
  orderId: string,
  db: Database | null,
): Promise<Result<OrderSummary, AppError>> {
  const loaded = await fromRepository<OrderSummary | null>(
    () => fetchOrder(eventId, orderId, db),
    `Load order ${orderId} for event ${eventId}`,
  );
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  if (!loaded.value) {
    return err(notFoundError(`Order ${orderId} not found`));
  }
  return validateResponse(orderSummarySchema, loaded.value, `Order ${orderId}`);
}
