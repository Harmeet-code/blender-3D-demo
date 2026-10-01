import type { Sql } from '../../shared/db/postgres.ts';
import type { BoothSummary, Reservation } from '../../../frontend/entities/booth/api/dto.ts';
import {
  conflictError,
  dbError,
  err,
  ok,
  type AppError,
  type Result,
} from '../../shared/result/errors.ts';

const DEMO_BOOTHS: BoothSummary[] = [{ id: 'room-101', status: 'available' }];

/** List booths for an event. Demo fixture when unconfigured. */
export async function fetchBooths(eventId: string, sql: Sql | null): Promise<BoothSummary[]> {
  if (!sql) {
    return DEMO_BOOTHS;
  }
  const rows = await sql`
    select r.id, r.status from rooms r
    join floors f on f.id = r.floor_id
    where f.event_id = ${eventId} and r.type = 'booth'`;
  return rows.map((r) => {
    const row = r as unknown as { id: string; status: BoothSummary['status'] };
    return { id: row.id, status: row.status };
  });
}

/**
 * Reserve a booth: mark reserved + open a pending order. Typed CONFLICT when
 * the booth is gone, typed INTERNAL on persistence failure. Stub order when
 * unconfigured. Never throws.
 */
export async function createReservation(
  eventId: string,
  boothId: string,
  addOns: string[],
  sql: Sql | null,
): Promise<Result<Reservation, AppError>> {
  if (!sql) {
    return ok({ reserved: true, boothId, addOns, orderId: 'order-demo' });
  }
  const orderId = crypto.randomUUID();
  let reserved = false;
  try {
    await sql.begin(async (tx) => {
      const updated = await tx`update rooms set status = 'reserved'
        where id = ${boothId} and status = 'available' returning id`;
      if (updated.length === 0) {
        return;
      }
      reserved = true;
      await tx`insert into orders (id, event_id, booth_id, add_ons, status)
        values (${orderId}, ${eventId}, ${boothId}, ${tx.json(addOns)}, 'pending')`;
    });
  } catch (cause) {
    return err(dbError(`Reserve booth ${boothId}`, cause));
  }
  if (!reserved) {
    return err(conflictError(`Booth ${boothId} is not available`));
  }
  return ok({ reserved: true, boothId, addOns, orderId });
}
