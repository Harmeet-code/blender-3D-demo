import { boothSummarySchema } from '../../../../frontend/entities/booth/api/dto.ts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../shared/db/postgres.ts';
import { floors, orders, rooms } from '../../../shared/db/schema.ts';
import type { BoothRepository } from '../repository.ts';

export function createSqlBoothRepository(db: Database): BoothRepository {
  return {
    listForEvent: async (eventId) => {
      const rows = await db
        .select({ id: rooms.id, status: rooms.status })
        .from(rooms)
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .where(and(eq(floors.eventId, eventId), eq(rooms.type, 'booth')));
      return rows.map((row) => boothSummarySchema.parse(row));
    },

    reserve: async (eventId, boothId, addOns) => {
      const orderId = crypto.randomUUID();
      return db.transaction(async (tx) => {
        const updated = await tx
          .update(rooms)
          .set({ status: 'reserved' })
          .where(
            and(
              eq(rooms.id, boothId),
              eq(rooms.status, 'available'),
              inArray(
                rooms.floorId,
                tx.select({ id: floors.id }).from(floors).where(eq(floors.eventId, eventId)),
              ),
            ),
          )
          .returning({ id: rooms.id });
        if (updated.length === 0) {
          return null;
        }
        await tx.insert(orders).values({
          id: orderId,
          eventId,
          boothId,
          addOns: [...addOns],
          status: 'pending',
        });
        return { reserved: true, boothId, addOns: [...addOns], orderId };
      });
    },
  };
}
