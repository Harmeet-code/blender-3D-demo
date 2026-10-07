import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type {
  BuildingLayout,
  BoothStatus,
  PolygonPoint,
  Portal,
  RoomType,
} from '../../../frontend/entities/building/model/building-schema.ts';
import type { OrderSummary } from '../../../frontend/entities/order/api/dto.ts';

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const floors = pgTable(
  'floors',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    heightOffset: doublePrecision('height_offset').notNull().default(0),
    image: text('image').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    coordinateSystem: jsonb('coordinate_system').$type<
      BuildingLayout['floors'][number]['coordinateSystem'] | null
    >(),
    logisticsAnchors: jsonb('logistics_anchors').$type<
      BuildingLayout['floors'][number]['logisticsAnchors'] | null
    >(),
  },
  (table) => [index('idx_floors_event').on(table.eventId)],
);

export const rooms = pgTable(
  'rooms',
  {
    id: text('id').primaryKey(),
    floorId: text('floor_id')
      .notNull()
      .references(() => floors.id, { onDelete: 'cascade' }),
    type: text('type').$type<RoomType>().notNull().default('booth'),
    label: text('label'),
    priceCents: integer('price_cents').notNull().default(0),
    polygon: jsonb('polygon').$type<PolygonPoint[]>().notNull().default([]),
    status: text('status').$type<BoothStatus>().notNull().default('available'),
    entrance: jsonb('entrance').$type<BuildingLayout['rooms'][number]['entrance'] | null>(),
    boothAssetRef: jsonb('booth_asset_ref').$type<
      BuildingLayout['rooms'][number]['boothAssetRef'] | null
    >(),
  },
  (table) => [index('idx_rooms_floor').on(table.floorId)],
);

export const portals = pgTable(
  'portals',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    type: text('type').$type<Portal['type']>().notNull(),
    position: jsonb('position').$type<Portal['position'] | null>(),
    connects: jsonb('connects').$type<string[]>().notNull().default([]),
    entries: jsonb('entries').$type<Portal['entries'] | null>(),
  },
  (table) => [index('idx_portals_event').on(table.eventId)],
);

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    boothId: text('booth_id').notNull(),
    addOns: jsonb('add_ons').$type<string[]>().notNull().default([]),
    status: text('status').$type<OrderSummary['status']>().notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('idx_orders_event').on(table.eventId)],
);

export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
