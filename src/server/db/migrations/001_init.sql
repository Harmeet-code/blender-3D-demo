-- 001_init: core venue domain (events -> floors -> rooms/portals, booths, orders).
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS floors (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  height_offset DOUBLE PRECISION NOT NULL DEFAULT 0,
  image TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  floor_id TEXT NOT NULL REFERENCES floors (id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'booth'
    CHECK (type IN ('booth', 'hall', 'walkable', 'service')),
  label TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  polygon JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'occupied'))
);

CREATE TABLE IF NOT EXISTS portals (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('elevator', 'escalator', 'stairs')),
  position JSONB,
  connects JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  booth_id TEXT NOT NULL,
  add_ons JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_floors_event ON floors (event_id);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms (floor_id);
CREATE INDEX IF NOT EXISTS idx_portals_event ON portals (event_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders (event_id);
