-- STEP 4 (optional) - daily email notifications
-- Run in Supabase SQL Editor

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE study_plan ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- Vercel env vars needed:
-- RESEND_API_KEY, NOTIFICATION_EMAIL, CRON_SECRET
-- Optional: RESEND_FROM, NEXT_PUBLIC_APP_URL, SUPABASE_SERVICE_ROLE_KEY
