-- LeetEasy schema (tables only). Prefer supabase/bootstrap.sql for a fresh project.
-- If you use this file, also run rls.sql afterward.

-- progress — daily reps, reviews, solved/starred
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

-- study_plan — daily queue
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

-- user_settings — LC session, review cap
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  lc_session TEXT DEFAULT '',
  lc_csrf TEXT DEFAULT '',
  revision_cap INTEGER DEFAULT 3,
  cycle_state TEXT DEFAULT NULL,
  user_cycles TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- activity_log — streak / day complete
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  date DATE NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- daily_log — random-mode daily quota
CREATE TABLE IF NOT EXISTS daily_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  date DATE NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- solved_log — daily solved counts
CREATE TABLE IF NOT EXISTS solved_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  date DATE NOT NULL,
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ac_submit_counts — LeetCode AC per question
CREATE TABLE IF NOT EXISTS ac_submit_counts (
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  question_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

-- wrong_submit_counts — WA per question
CREATE TABLE IF NOT EXISTS wrong_submit_counts (
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  question_id INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

-- practice_sessions — Grind saved code
CREATE TABLE IF NOT EXISTS practice_sessions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  question_id INTEGER NOT NULL,
  language TEXT DEFAULT 'python',
  code TEXT DEFAULT '',
  last_result JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id, language)
);

-- time_tracking — Grind time per question
CREATE TABLE IF NOT EXISTS time_tracking (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'emmanuel',
  question_id INTEGER NOT NULL,
  seconds INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);
