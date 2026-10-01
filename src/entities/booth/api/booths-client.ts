import { apiFetch } from '../../../shared/api/http.ts';

export interface BoothSummary {
  id: string;
  status: 'available' | 'reserved' | 'occupied';
}

export function listBooths(eventId: string): Promise<BoothSummary[]> {
  return apiFetch<BoothSummary[]>(`/api/events/${eventId}/booths`);
}

export function reserveBooth(
  eventId: string,
  input: { boothId: string; addOns: string[] },
): Promise<{ reserved: boolean; boothId: string; addOns: string[] }> {
  return apiFetch(`/api/events/${eventId}/booths/reserve`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
