-- STEP 1 of 2 - paste ALL of this in Supabase SQL Editor, click Run

CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  question_id INTEGER NOT NULL,
  solved BOOLEAN DEFAULT FALSE,
  starred BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  review_count INTEGER DEFAULT 0,
  next_review DATE,
  review_carry_date DATE,
  last_reviewed DATE,
  last_daily_done DATE,
  daily_rep_count INTEGER DEFAULT 0,
  daily_rep_date DATE,
  status TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

CREATE TABLE IF NOT EXISTS study_plan (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  start_date DATE NOT NULL,
  per_day INTEGER DEFAULT 2,
  question_order INTEGER[] NOT NULL,
  lock_code TEXT DEFAULT '',
  mode TEXT DEFAULT 'strict',
  review_start_days INTEGER DEFAULT 14,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  lc_session TEXT DEFAULT '',
  lc_csrf TEXT DEFAULT '',
  revision_cap INTEGER DEFAULT 3,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  date DATE NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS daily_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  date DATE NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON progress;
CREATE POLICY "owner only" ON progress FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE study_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON study_plan;
CREATE POLICY "owner only" ON study_plan FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON user_settings;
CREATE POLICY "owner only" ON user_settings FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON activity_log;
CREATE POLICY "owner only" ON activity_log FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE daily_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON daily_log;
CREATE POLICY "owner only" ON daily_log FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

INSERT INTO user_settings (user_id, revision_cap)
VALUES ('emmanuel', 3)
ON CONFLICT (user_id) DO NOTHING;
