-- STEP 3 (optional) - flexible daily plan columns
-- Run in Supabase SQL Editor if you want plan settings stored in DB (not just localStorage)

ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS plan_start_index INTEGER DEFAULT 0;
ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS claimed_day_index INTEGER DEFAULT 0;
