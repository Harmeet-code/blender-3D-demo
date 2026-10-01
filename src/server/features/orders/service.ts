import type { Sql } from '../../shared/db/postgres.ts';
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
  orderId: string,
  sql: Sql | null,
): Promise<Result<OrderSummary, AppError>> {
  const loaded = await fromRepository<OrderSummary | null>(
    () => fetchOrder(orderId, sql),
    `Load order ${orderId}`,
  );
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  if (!loaded.value) {
    return err(notFoundError(`Order ${orderId} not found`));
  }
  return validateResponse(orderSummarySchema, loaded.value, `Order ${orderId}`);
}
