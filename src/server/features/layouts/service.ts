import type { Sql } from '../../shared/db/postgres.ts';
import {
  buildingLayoutSchema,
  type BuildingLayout,
} from '../../../frontend/entities/building/model/building-schema.ts';
import {
  layoutResponseSchema,
  saveLayoutResponseSchema,
} from '../../../frontend/entities/building/api/dto.ts';
import { err, fromRepository, type AppError, type Result } from '../../shared/result/errors.ts';
import { parseRequest, validateResponse } from '../../shared/result/validate.ts';
import { fetchLayout, storeLayout } from './repository.ts';

export async function getLayout(
  eventId: string,
  sql: Sql | null,
): Promise<Result<BuildingLayout, AppError>> {
  const loaded = await fromRepository(() => fetchLayout(eventId, sql), `Load layout ${eventId}`);
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  return validateResponse(layoutResponseSchema, loaded.value, `Layout ${eventId}`);
}

export async function saveLayout(
  eventId: string,
  input: unknown,
  sql: Sql | null,
): Promise<Result<{ saved: boolean }, AppError>> {
  const layout = parseRequest(buildingLayoutSchema, input, 'layout payload');
  if (layout.isErr()) {
    return err(layout.error);
  }
  const stored = await fromRepository(
    () => storeLayout(eventId, layout.value, sql),
    `Save layout ${eventId}`,
  );
  if (stored.isErr()) {
    return err(stored.error);
  }
  return validateResponse(saveLayoutResponseSchema, stored.value, `Save layout ${eventId}`);
}
