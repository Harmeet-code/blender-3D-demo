import { z } from 'zod';

/** Wire DTOs for the order slice. */
export const orderSummarySchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['pending', 'paid', 'cancelled']),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;
