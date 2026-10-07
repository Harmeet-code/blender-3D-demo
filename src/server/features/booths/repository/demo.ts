import type { BoothSummary } from '../../../../frontend/entities/booth/api/dto.ts';
import type { BoothRepository } from '../repository.ts';

const DEMO_BOOTHS: readonly BoothSummary[] = [{ id: 'room-101', status: 'available' }];

export function createDemoBoothRepository(): BoothRepository {
  return {
    listForEvent: async (_eventId) => [...DEMO_BOOTHS],
    reserve: async (_eventId, boothId, addOns) => ({
      reserved: true,
      boothId,
      addOns: [...addOns],
      orderId: 'order-demo',
    }),
  };
}
