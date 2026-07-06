-- STEP 6 — LeetCode AC list sync (cross-device). Run in Supabase SQL Editor.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS lc_list_sync JSONB DEFAULT NULL;
