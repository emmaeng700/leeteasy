-- LeetEasy RLS ù run after schema.sql (included in bootstrap.sql)

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON progress;
CREATE POLICY "owner only" ON progress
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE study_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON study_plan;
CREATE POLICY "owner only" ON study_plan
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON user_settings;
CREATE POLICY "owner only" ON user_settings
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON activity_log;
CREATE POLICY "owner only" ON activity_log
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE daily_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON daily_log;
CREATE POLICY "owner only" ON daily_log
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE solved_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON solved_log;
CREATE POLICY "owner only" ON solved_log
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE ac_submit_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON ac_submit_counts;
CREATE POLICY "owner only" ON ac_submit_counts
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE wrong_submit_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON wrong_submit_counts;
CREATE POLICY "owner only" ON wrong_submit_counts
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON practice_sessions;
CREATE POLICY "owner only" ON practice_sessions
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE time_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON time_tracking;
CREATE POLICY "owner only" ON time_tracking
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');

ALTER TABLE clipboard_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner only" ON clipboard_items;
CREATE POLICY "owner only" ON clipboard_items
  FOR ALL USING (user_id = 'emmanuel') WITH CHECK (user_id = 'emmanuel');
