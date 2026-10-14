import { and, eq } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/postgres.ts';
import { orders } from '../../infrastructure/database/schema.ts';
import type { OrderSummary } from '../../../features/orders/api/dto.ts';

/** Fetch an order by id. Null when unknown (route maps to 404). */
export async function fetchOrder(
  eventId: string,
  orderId: string,
  db: Database | null,
): Promise<OrderSummary | null> {
  if (!db) {
    return { orderId, status: 'pending' };
  }
  const rows = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.id, orderId)))
    .limit(1);
  const [row] = rows;
  return row ? { orderId: row.id, status: row.status } : null;
}
