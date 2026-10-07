import type { Database } from '../../shared/db/postgres.ts';
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
  db: Database | null,
): Promise<Result<BuildingLayout, AppError>> {
  const loaded = await fromRepository(() => fetchLayout(eventId, db), `Load layout ${eventId}`);
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  return validateResponse(layoutResponseSchema, loaded.value, `Layout ${eventId}`);
}

export async function saveLayout(
  eventId: string,
  input: unknown,
  db: Database | null,
): Promise<Result<{ saved: boolean }, AppError>> {
  const layout = parseRequest(buildingLayoutSchema, input, 'layout payload');
  if (layout.isErr()) {
    return err(layout.error);
  }
  const stored = await fromRepository(
    () => storeLayout(eventId, layout.value, db),
    `Save layout ${eventId}`,
  );
  if (stored.isErr()) {
    return err(stored.error);
  }
  return validateResponse(saveLayoutResponseSchema, stored.value, `Save layout ${eventId}`);
}
