import type { VenueInvoice } from '../../../features/venue/model/venue-contracts.ts';
import { VenueError } from './store.ts';

/** A real integration must also verify webhook signatures and atomically match amount/currency/invoice before recording payment. */
export interface VenuePaymentAdapter {
  readonly provider: string;
  createCheckout(
    invoice: Readonly<VenueInvoice>,
  ): Promise<{ url: string; providerReference: string }>;
}
export const unavailablePaymentAdapter: VenuePaymentAdapter = {
  provider: 'unconfigured',
  async createCheckout() {
    throw new VenueError(
      503,
      'Payment provider is not configured. No payment was collected or marked paid.',
    );
  },
};
