import { z } from 'zod';

/** Wire DTOs for the booth slice (requests + responses). */
export const boothStatusSchema = z.enum(['available', 'reserved', 'occupied']);
export type BoothStatus = z.infer<typeof boothStatusSchema>;

export const boothSummarySchema = z.object({
  id: z.string().min(1),
  status: boothStatusSchema,
});
export type BoothSummary = z.infer<typeof boothSummarySchema>;

export const reserveBodySchema = z.object({
  boothId: z.string().min(1),
  addOns: z.array(z.string().min(1)).default([]),
});
export type ReserveBody = z.infer<typeof reserveBodySchema>;

export const reservationSchema = z.object({
  reserved: z.literal(true),
  boothId: z.string().min(1),
  addOns: z.array(z.string()),
  orderId: z.string().min(1),
});
export type Reservation = z.infer<typeof reservationSchema>;
