import type { Result } from 'neverthrow';
import type { ApiError } from '../../../shared/result/api-result.ts';
import { apiResultValidated } from '../../../shared/result/api-result.ts';
import { apiBaseUrl } from '../../../shared/api/http.ts';
import type { BuildingLayout } from '../model/building-schema.ts';
import { layoutResponseSchema, saveLayoutResponseSchema } from './dto.ts';

export function getLayout(eventId: string): Promise<Result<BuildingLayout, ApiError>> {
  return apiResultValidated(`${apiBaseUrl()}/api/events/${eventId}/layout`, layoutResponseSchema);
}

export function saveLayout(
  eventId: string,
  layout: BuildingLayout,
): Promise<Result<{ saved: boolean }, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/layout`,
    saveLayoutResponseSchema,
    { method: 'PUT', body: JSON.stringify(layout) },
  );
}
