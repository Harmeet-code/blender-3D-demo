-- A draft is independent from the published event document: first-time authors
-- may save calibrated or incomplete work before any event has been published.
CREATE TABLE IF NOT EXISTS layout_drafts (
  event_id text PRIMARY KEY,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
