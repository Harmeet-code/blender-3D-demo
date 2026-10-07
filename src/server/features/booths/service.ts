import {
  BOOTH_ADD_ONS,
  type BoothAddOnId,
} from '../../../frontend/entities/building/model/building-schema.ts';
import {
  boothSummarySchema,
  reservationSchema,
  reserveBodySchema,
  type BoothSummary,
  type Reservation,
} from '../../../frontend/entities/booth/api/dto.ts';
import {
  err,
  fromRepository,
  conflictError,
  validationError,
  type AppError,
  type Result,
} from '../../shared/result/errors.ts';
import { parseRequest, validateResponse } from '../../shared/result/validate.ts';
import type { BoothRepository } from './repository.ts';

const KNOWN_ADD_ONS: ReadonlySet<string> = new Set(BOOTH_ADD_ONS.map((addOn) => addOn.id));

function isBoothAddOnId(id: string): id is BoothAddOnId {
  return KNOWN_ADD_ONS.has(id);
}

export function createBoothService(repository: BoothRepository) {
  return {
    async listBooths(eventId: string): Promise<Result<BoothSummary[], AppError>> {
      const loaded = await fromRepository(
        () => repository.listForEvent(eventId),
        `List booths for ${eventId}`,
      );
      if (loaded.isErr()) {
        return err(loaded.error);
      }
      return validateResponse(boothSummarySchema.array(), loaded.value, `Booths ${eventId}`);
    },

    async reserveBooth(eventId: string, input: unknown): Promise<Result<Reservation, AppError>> {
      const body = parseRequest(reserveBodySchema, input, 'reservation payload');
      if (body.isErr()) {
        return err(body.error);
      }
      const unknown = body.value.addOns.filter((id) => !isBoothAddOnId(id));
      if (unknown.length > 0) {
        return err(validationError(`Unknown add-on(s): ${unknown.join(', ')}`));
      }
      const addOns = body.value.addOns.filter(isBoothAddOnId);
      const created = await fromRepository(
        () => repository.reserve(eventId, body.value.boothId, addOns),
        `Reserve booth ${body.value.boothId}`,
      );
      if (created.isErr()) {
        return err(created.error);
      }
      if (!created.value) {
        return err(conflictError(`Booth ${body.value.boothId} is not available`));
      }
      return validateResponse(
        reservationSchema,
        created.value,
        `Reservation ${body.value.boothId}`,
      );
    },
  };
}
