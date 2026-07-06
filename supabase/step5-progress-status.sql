-- STEP 5 (optional) - legacy LeetMastery column on progress
-- Only needed if you use tools that expect progress.status; LeetEasy does not require this.

ALTER TABLE progress ADD COLUMN IF NOT EXISTS status TEXT;
