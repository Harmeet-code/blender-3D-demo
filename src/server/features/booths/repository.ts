import type { BoothAddOnId } from '../../../frontend/entities/building/model/building-schema.ts';
import type { BoothSummary, Reservation } from '../../../frontend/entities/booth/api/dto.ts';

export type BoothRepository = {
  readonly listForEvent: (eventId: string) => Promise<BoothSummary[]>;
  readonly reserve: (
    eventId: string,
    boothId: string,
    addOns: readonly BoothAddOnId[],
  ) => Promise<Reservation | null>;
};
