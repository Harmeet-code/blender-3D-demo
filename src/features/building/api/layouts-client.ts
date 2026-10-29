import type { Result } from 'neverthrow';
import type { AxiosRequestConfig } from 'axios';
import type { ApiError } from '@/api/api-result.ts';
import { apiResultValidated } from '@/api/api-result.ts';
import { apiBaseUrl } from '@/api/base-url.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { venueAuthorizationHeaders } from '@/features/venue/model/venue-client.ts';
import { floorPlanBuilderHeaders } from './builder-layout-policy.ts';
const loadedVersions = new Map<string, number>();
const layoutLoadGenerations = new Map<string, number>();
const responseVersions = new WeakMap<BuildingLayout, { eventId: string; version: number }>();
export function acceptedLayoutVersion(eventId: string) {
  return loadedVersions.get(eventId) ?? 0;
}
/** Only an accepted editor document advances its expected revision. Dirty drafts may ignore fetched data. */
export function acceptLayoutVersion(eventId: string, layout: BuildingLayout) {
  const received = responseVersions.get(layout);
  if (received?.eventId === eventId) {
    loadedVersions.set(eventId, received.version);
  }
}
import {
  layoutResponseSchema,
  draftLayoutResponseSchema,
  saveLayoutResponseSchema,
} from '@/features/building/api/dto.ts';

export async function getLayout(
  eventId: string,
  config?: AxiosRequestConfig,
): Promise<Result<BuildingLayout, ApiError>> {
  return loadLayout(eventId, config);
}

/** Public layout read used by the active builder's implicit local-admin session. */
export function getBuilderLayout(
  eventId: string,
  config?: AxiosRequestConfig,
): Promise<Result<BuildingLayout | null, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/layout`,
    draftLayoutResponseSchema,
    { ...config, headers: { ...config?.headers, ...floorPlanBuilderHeaders() } },
  );
}

async function loadLayout(
  eventId: string,
  config?: AxiosRequestConfig,
): Promise<Result<BuildingLayout, ApiError>> {
  const generation = (layoutLoadGenerations.get(eventId) ?? 0) + 1;
  layoutLoadGenerations.set(eventId, generation);
  let responseVersion: number | undefined;
  const result = await apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/layout`,
    layoutResponseSchema,
    config,
    (response) => {
      const header = response.headers['x-venue-version'];
      if (typeof header === 'string' && /^\d+$/.test(header)) {
        const version = Number(header);
        if (Number.isSafeInteger(version)) {
          responseVersion = version;
        }
      }
    },
  );
  if (
    result.isOk() &&
    responseVersion !== undefined &&
    layoutLoadGenerations.get(eventId) === generation
  ) {
    responseVersions.set(result.value, { eventId, version: responseVersion });
  }
  return result;
}

export async function saveLayout(
  eventId: string,
  layout: BuildingLayout,
): Promise<Result<{ saved: boolean }, ApiError>> {
  const version = loadedVersions.get(eventId) ?? 0;
  const result = await apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/layout`,
    saveLayoutResponseSchema,
    {
      method: 'PUT',
      data: layout,
      headers: { ...venueAuthorizationHeaders(), 'X-Venue-Version': String(version) },
    },
  );
  if (result.isOk() && Object.keys(venueAuthorizationHeaders()).length) {
    loadedVersions.set(eventId, Math.max(loadedVersions.get(eventId) ?? version, version + 1));
    layoutLoadGenerations.set(eventId, (layoutLoadGenerations.get(eventId) ?? 0) + 1);
  }
  return result;
}

/** Save the active builder's published snapshot without Venue OS session credentials. */
export async function saveBuilderLayout(
  eventId: string,
  layout: BuildingLayout,
): Promise<Result<{ saved: boolean }, ApiError>> {
  const version = loadedVersions.get(eventId) ?? 0;
  const result = await apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/layout`,
    saveLayoutResponseSchema,
    {
      method: 'PUT',
      data: layout,
      headers: { ...floorPlanBuilderHeaders(), 'X-Venue-Version': String(version) },
    },
  );
  if (result.isOk()) {
    loadedVersions.set(eventId, Math.max(loadedVersions.get(eventId) ?? version, version + 1));
    layoutLoadGenerations.set(eventId, (layoutLoadGenerations.get(eventId) ?? 0) + 1);
  }
  return result;
}

export function getLayoutDraft(
  eventId: string,
  config?: AxiosRequestConfig,
): Promise<Result<BuildingLayout | null, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/layout/draft`,
    draftLayoutResponseSchema,
    { ...config, headers: { ...config?.headers, ...venueAuthorizationHeaders() } },
  );
}

export function getBuilderLayoutDraft(
  eventId: string,
  config?: AxiosRequestConfig,
): Promise<Result<BuildingLayout | null, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/layout/draft`,
    draftLayoutResponseSchema,
    { ...config, headers: { ...config?.headers, ...floorPlanBuilderHeaders() } },
  );
}

export function saveLayoutDraft(
  eventId: string,
  layout: BuildingLayout,
): Promise<Result<{ saved: boolean }, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/layout/draft`,
    saveLayoutResponseSchema,
    { method: 'PUT', data: layout, headers: venueAuthorizationHeaders() },
  );
}

export function saveBuilderLayoutDraft(
  eventId: string,
  layout: BuildingLayout,
): Promise<Result<{ saved: boolean }, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${encodeURIComponent(eventId)}/layout/draft`,
    saveLayoutResponseSchema,
    { method: 'PUT', data: layout, headers: floorPlanBuilderHeaders() },
  );
}
