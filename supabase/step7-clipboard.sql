-- STEP 7 — Clipboard / token storage (cross-device). Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS clipboard_items (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL DEFAULT 'emmanuel',
  label      TEXT        NOT NULL DEFAULT '',
  content    TEXT        NOT NULL DEFAULT '',
  is_token   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ          DEFAULT NOW()
);

ALTER TABLE clipboard_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON clipboard_items;
CREATE POLICY "owner only" ON clipboard_items
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');
