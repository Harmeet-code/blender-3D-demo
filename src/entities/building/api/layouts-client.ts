import { apiFetch } from '../../../shared/api/http.ts';
import type { BuildingLayout } from '../model/building-schema.ts';

export function getLayout(eventId: string): Promise<BuildingLayout> {
  return apiFetch<BuildingLayout>(`/api/events/${eventId}/layout`);
}

export function saveLayout(eventId: string, layout: BuildingLayout): Promise<{ saved: boolean }> {
  return apiFetch<{ saved: boolean }>(`/api/events/${eventId}/layout`, {
    method: 'PUT',
    body: JSON.stringify(layout),
  });
}
