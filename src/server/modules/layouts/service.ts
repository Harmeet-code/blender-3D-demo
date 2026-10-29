import type { Database } from '../../infrastructure/database/postgres.ts';
import {
  buildingLayoutSchema,
  type BuildingLayout,
} from '../../../features/building/model/building-schema.ts';
import {
  layoutResponseSchema,
  draftLayoutResponseSchema,
  saveLayoutResponseSchema,
} from '../../../features/building/api/dto.ts';
import {
  err,
  fromRepository,
  validationError,
  notFoundError,
  type AppError,
  type Result,
} from '../../shared/result/errors.ts';
import { parseRequest, validateResponse } from '../../shared/result/validate.ts';
import { fetchLayout, storeLayout, fetchLayoutDraft, storeLayoutDraft } from './repository.ts';
import { publishReadiness } from '../../../features/building/model/layout-readiness.ts';

export async function getLayout(
  eventId: string,
  db: Database | null,
  fallback = true,
): Promise<Result<BuildingLayout, AppError>> {
  const loaded = await fromRepository(() => fetchLayout(eventId, db, fallback), `Load layout ${eventId}`);
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  if (!loaded.value) {return err(notFoundError('Published layout not found.'));}
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
  const issues = publishReadiness(layout.value);
  if (issues.length) {
    return err(validationError('Layout is not ready to publish', issues));
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

export async function getLayoutDraft(
  eventId: string,
  db: Database | null,
): Promise<Result<BuildingLayout | null, AppError>> {
  const loaded = await fromRepository(() => fetchLayoutDraft(eventId, db), `Load draft ${eventId}`);
  if (loaded.isErr()) {
    return err(loaded.error);
  }
  return validateResponse(draftLayoutResponseSchema, loaded.value, `Layout draft ${eventId}`);
}

/** Structural validity is mandatory; calibration/portal readiness belongs only to publication. */
export async function saveLayoutDraft(
  eventId: string,
  input: unknown,
  db: Database | null,
): Promise<Result<{ saved: boolean }, AppError>> {
  const layout = parseRequest(buildingLayoutSchema, input, 'layout draft payload');
  if (layout.isErr()) {
    return err(layout.error);
  }
  const stored = await fromRepository(
    () => storeLayoutDraft(eventId, layout.value, db),
    `Save draft ${eventId}`,
  );
  if (stored.isErr()) {
    return err(stored.error);
  }
  return validateResponse(saveLayoutResponseSchema, stored.value, `Save draft ${eventId}`);
}
