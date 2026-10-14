import { z } from 'zod';
import { buildingLayoutSchema } from '../../building/model/building-schema.ts';

export const venueRoleSchema = z.enum(['admin', 'organizer', 'exhibitor', 'ops']);
export type VenueRole = z.infer<typeof venueRoleSchema>;
const id = z.string().trim().min(1).max(120);
const text = z.string().trim().max(2000);
const name = z.string().trim().min(1).max(120);
export const venueCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create-event'),
    name,
    layout: buildingLayoutSchema.optional(),
    templateEventId: id.optional(),
  }),
  z.object({
    type: z.literal('create-user'),
    name,
    password: z.string().min(12).max(200),
    role: venueRoleSchema,
    eventIds: z.array(id).max(100),
  }),
  z.object({
    type: z.literal('update-user'),
    userId: id,
    role: venueRoleSchema,
    eventIds: z.array(id).max(100),
    password: z.string().min(12).max(200).optional(),
  }),
  z.object({ type: z.literal('claim'), boothId: id }),
  z.object({ type: z.literal('approve-claim'), boothId: id, userId: id, approved: z.boolean() }),
  z.object({
    type: z.literal('branding'),
    boothId: id,
    displayName: name,
    logoUrl: z
      .string()
      .max(2000)
      .refine(
        (v) => v === '' || /^\/api\/media\/[a-f0-9]{64}\.(webp|png|jpg)$/.test(v),
        'Use an uploaded image URL',
      ),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  z.object({
    type: z.literal('availability'),
    boothId: id,
    priceCents: z.number().int().nonnegative().max(100000000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    available: z.boolean(),
  }),
  z.object({
    type: z.literal('hold'),
    boothId: id,
    minutes: z.number().int().min(1).max(30).default(10),
  }),
  z.object({ type: z.literal('release-hold'), holdId: id }),
  z.object({ type: z.literal('book'), holdId: id }),
  z.object({ type: z.literal('cancel-booking'), bookingId: id }),
  z.object({ type: z.literal('payment-checkout'), invoiceId: id }),
  z.object({
    type: z.literal('publish'),
    layout: buildingLayoutSchema,
    expectedVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('rollback'),
    versionId: id,
    expectedVersion: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('operation'),
    kind: z.enum(['incident', 'cleaning', 'occupancy']),
    floorId: id,
    position: z.tuple([z.number().finite(), z.number().finite()]),
    note: text,
    count: z.number().int().nonnegative().max(100000).optional(),
  }),
  z.object({ type: z.literal('resolve-operation'), operationId: id }),
  z.object({
    type: z.literal('signage'),
    signageId: id,
    title: name,
    body: text,
    destinationId: id.optional(),
  }),
  z.object({
    type: z.literal('analytics'),
    kind: z.enum(['search', 'route', 'dwell']),
    destinationId: id.optional(),
    durationSeconds: z.number().nonnegative().max(86400).optional(),
  }),
]);
export type VenueCommand = z.infer<typeof venueCommandSchema>;
export interface VenueUser {
  id: string;
  name: string;
  role: VenueRole;
  eventIds: string[];
}
export interface VenueSession {
  token: string;
  user: VenueUser;
}
export interface VenueEvent {
  id: string;
  name: string;
  createdAt: string;
  version: number;
}
export interface VenueBooth {
  id: string;
  floorId: string;
  label: string;
  priceCents: number;
  currency: string;
  available: boolean;
  status?: 'available' | 'unavailable' | 'held' | 'booked';
  ownerId?: string;
  claimUserIds: string[];
  branding?: { displayName: string; logoUrl: string; color: string };
}
export interface VenueHold {
  id: string;
  boothId: string;
  userId: string;
  expiresAt: string;
  status: 'active' | 'released' | 'expired' | 'converted';
  priceCents?: number;
  currency?: string;
}
export interface VenueBooking {
  id: string;
  boothId: string;
  userId: string;
  invoiceId: string;
  createdAt: string;
  status: 'confirmed' | 'cancelled';
}
export interface VenueInvoice {
  id: string;
  bookingId: string;
  userId: string;
  amountCents: number;
  currency: string;
  status: 'unpaid' | 'paid' | 'void';
  createdAt: string;
  paymentProvider: 'unconfigured';
}
export interface VenueVersion {
  id: string;
  number: number;
  createdAt: string;
  userId: string;
  restoredFrom?: string;
}
export interface VenueAudit {
  id: string;
  at: string;
  userId: string;
  action: string;
  subjectId?: string;
}
export interface VenueOperation {
  id: string;
  kind: 'incident' | 'cleaning' | 'occupancy';
  floorId: string;
  position: [number, number];
  note: string;
  count?: number;
  createdAt: string;
  resolvedAt?: string;
}
export interface VenueSignage {
  id: string;
  title: string;
  body: string;
  destinationId?: string;
  updatedAt: string;
}
export interface VenueSnapshot {
  event: VenueEvent;
  booths: VenueBooth[];
  holds: VenueHold[];
  bookings: VenueBooking[];
  invoices: VenueInvoice[];
  versions: VenueVersion[];
  audit: VenueAudit[];
  operations: VenueOperation[];
  signage: VenueSignage[];
  analytics: { searches: number; routes: number; dwellSeconds: number };
  users?: VenueUser[];
  paymentConfigured: false;
}
export interface VenuePublicView {
  eventId: string;
  version: number;
  booths: {
    id: string;
    floorId: string;
    label: string;
    priceCents: number;
    currency: string;
    status: 'available' | 'unavailable' | 'held' | 'booked';
    branding?: VenueBooth['branding'];
  }[];
  operations: Pick<
    VenueOperation,
    'id' | 'kind' | 'floorId' | 'position' | 'count' | 'createdAt'
  >[];
  signage: VenueSignage[];
}
