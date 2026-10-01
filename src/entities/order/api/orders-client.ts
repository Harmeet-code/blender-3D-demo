import { apiFetch } from '../../../shared/api/http.ts';

export interface OrderSummary {
  orderId: string;
  status: 'pending' | 'paid' | 'cancelled';
}

export function getOrder(eventId: string, orderId: string): Promise<OrderSummary> {
  return apiFetch<OrderSummary>(`/api/events/${eventId}/orders/${orderId}`);
}
