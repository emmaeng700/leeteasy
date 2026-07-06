-- STEP 4 (optional) - email reminders every 3 hours (Vercel cron + Resend)
-- Run in Supabase SQL Editor

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- Vercel env vars (required):
--   RESEND_API_KEY     - from resend.com
--   NOTIFICATION_EMAIL - your inbox
--   CRON_SECRET        - random string (cron auth)
-- Optional:
--   RESEND_FROM, NEXT_PUBLIC_APP_URL, SUPABASE_SERVICE_ROLE_KEY
-- Cron schedule is in vercel.json: 0 */3 * * * (every 3 hours)
