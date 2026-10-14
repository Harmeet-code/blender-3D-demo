-- Additive: legacy rows retain their original meter coordinates and graph connections.
ALTER TABLE floors ADD COLUMN IF NOT EXISTS coordinate_system JSONB;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS logistics_anchors JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS entrance JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS booth_asset_ref JSONB;
ALTER TABLE portals ADD COLUMN IF NOT EXISTS entries JSONB;
