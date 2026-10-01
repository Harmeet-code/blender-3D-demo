import type { Sql } from '../../shared/db/postgres.ts';
import { BOOTH_ADD_ONS } from '../../../frontend/entities/building/model/building-schema.ts';
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
  validationError,
  type AppError,
  type Result,
} from '../../shared/result/errors.ts';
import { parseRequest, validateResponse } from '../../shared/result/validate.ts';
import { createReservation, fetchBooths } from './repository.ts';

const KNOWN_ADD_ONS = new Set(BOOTH_ADD_ONS.map((a) => a.id));

export async function listBooths(
  eventId: string,
  sql: Sql | null,
): Promise<Result<BoothSummary[], AppError>> {
  const loaded = await fromRepository(
    () => fetchBooths(eventId, sql),
    `List booths for ${eventId}`,
  );
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  return validateResponse(boothSummarySchema.array(), loaded.value, `Booths ${eventId}`);
}

export async function reserveBooth(
  eventId: string,
  input: unknown,
  sql: Sql | null,
): Promise<Result<Reservation, AppError>> {
  const body = parseRequest(reserveBodySchema, input, 'reservation payload');
  if (body.isErr()) {
    return err(body.error);
  }
  const unknown = body.value.addOns.filter((id) => !KNOWN_ADD_ONS.has(id));
  if (unknown.length > 0) {
    return err(validationError(`Unknown add-on(s): ${unknown.join(', ')}`));
  }
  const created = await createReservation(eventId, body.value.boothId, body.value.addOns, sql);
  if (created.isErr()) {
    return err(created.error);
  }
  return validateResponse(reservationSchema, created.value, `Reservation ${body.value.boothId}`);
}
