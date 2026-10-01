import type { Sql } from '../../shared/db/postgres.ts';
import type { OrderSummary } from '../../../frontend/entities/order/api/dto.ts';

/** Fetch an order by id. Null when unknown (route maps to 404). */
export async function fetchOrder(orderId: string, sql: Sql | null): Promise<OrderSummary | null> {
  if (!sql) {
    return { orderId, status: 'pending' };
  }
  const rows = await sql`select id, status from orders where id = ${orderId}`;
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0] as unknown as { id: string; status: OrderSummary['status'] };
  return { orderId: row.id, status: row.status };
}
