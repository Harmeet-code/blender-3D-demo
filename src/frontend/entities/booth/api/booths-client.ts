import type { Result } from 'neverthrow';
import type { ApiError } from '../../../shared/result/api-result.ts';
import { apiResultValidated } from '../../../shared/result/api-result.ts';
import { apiBaseUrl } from '../../../shared/api/http.ts';
import {
  boothSummarySchema,
  reservationSchema,
  type BoothSummary,
  type Reservation,
} from './dto.ts';

export type { BoothSummary, Reservation };

export function listBooths(eventId: string): Promise<Result<BoothSummary[], ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/booths`,
    boothSummarySchema.array(),
  );
}

export function reserveBooth(
  eventId: string,
  input: { boothId: string; addOns: string[] },
): Promise<Result<Reservation, ApiError>> {
  return apiResultValidated(
    `${apiBaseUrl()}/api/events/${eventId}/booths/reserve`,
    reservationSchema,
    { method: 'POST', body: JSON.stringify(input) },
  );
}
