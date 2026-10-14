import type { Result } from 'neverthrow';
import type { AxiosRequestConfig } from 'axios';
import type { ApiError } from '@/api/api-result.ts';
import { apiResultValidated } from '@/api/api-result.ts';
import { apiBaseUrl } from '@/api/base-url.ts';
import {
  boothSummarySchema,
  reservationSchema,
  type BoothSummary,
  type Reservation,
} from '@/features/booths/api/dto.ts';

export type { BoothSummary, Reservation };

export function listBooths(
  eventId: string,
  config?: AxiosRequestConfig,
): Promise<Result<BoothSummary[], ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/booths`,
    boothSummarySchema.array(),
    config,
  );
}

export function reserveBooth(
  eventId: string,
  input: { boothId: string; addOns: string[] },
): Promise<Result<Reservation, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/booths/reserve`,
    reservationSchema,
    { method: 'POST', data: input },
  );
}
