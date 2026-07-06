-- Run if "Next plan day" wrongly says you're on the last day (stale claimed_day_index).
-- Safe to run anytime — resets plan day counter to day 1 in DB. Local app state resets on next Get Latest.

UPDATE study_plan
SET claimed_day_index = 0,
    plan_start_index = COALESCE(plan_start_index, 0)
WHERE user_id = 'emmanuel';
