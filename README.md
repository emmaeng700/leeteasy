# LeetEasy

Minimal mobile LeetCode companion. Solve on the LeetCode app; LeetEasy tracks daily goals, makeup, and reviews via LeetCode API sync. **Grind** works fully offline (same UI as LeetMastery).

## Supabase — do you need to create anything?

**No new database.** LeetEasy uses the **same Supabase project** as LeetMastery.

1. Copy env vars from LeetMastery into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Deploy on Vercel with the same two variables.

Tables already used (created by LeetMastery):

| Table | Used for |
|-------|----------|
| `progress` | Daily reps, review schedule, solved state |
| `study_plan` | Daily question order + per_day |
| `daily_log` | Random-mode daily count |
| `activity_log` | Streak |
| `user_settings` | LeetCode session (`lc_session`, `lc_csrf`), review cap |

If LeetMastery already works, LeetEasy works — no SQL migrations, no new project.

**Grind offline** does **not** need Supabase. Drafts live in `localStorage` (`lm_grind_*` keys), same as LeetMastery.

## Email and cron

**Not required for LeetEasy.** No new Resend setup, no new Vercel cron.

LeetMastery already sends daily emails via `/api/notify-daily` + `vercel.json` cron. That reads the **same Supabase** tables, so streak/daily status stays in sync. Keep that cron on your LeetMastery Vercel project.

Only add email to LeetEasy if you want reminders from the LeetEasy domain (copy `notify-daily` route + `RESEND_API_KEY` later).


```bash
cp .env.example .env.local
# Paste Supabase URL + anon key from LeetMastery
npm install
npm run dev
```

Paste LeetCode session cookie in **Settings** (for Daily/Review sync).

## Offline Grind

Copied from LeetMastery:

- `public/grind-offline.html` — standalone editor (~727 questions)
- `public/grind_questions.json`, `questions_data_all.json`, `playbook_data_all.json`
- `public/grind-offline-editor.js` (CodeMirror)
- `public/description-images/` (~445 diagrams)
- `public/sw.js` + `public/sw-v26.js` (service worker)

**First visit online (production):** one-time warmup downloads ~25 MB, then Grind works offline.

**Dev (localhost):** service worker is disabled; open `/grind-offline.html` directly while online to test.

Nav **Grind** → `/grind-offline.html` (works online and offline after cache).

## Deploy (Vercel)

1. Push to GitHub
2. Import in Vercel (large `public/` assets are included in deploy)
3. Add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

## Sync flow (Daily / Reviews)

1. Tap problem → opens LeetCode (app on phone if installed)
2. Get **Accepted** on LeetCode
3. Return to LeetEasy → auto-sync on focus, or tap **Sync**
4. First time: open **LeetCode** page and **Sync** once to seed AC baseline

## Refreshing Grind data from LeetMastery

If question data changes in LeetMastery, re-copy:

```bash
rsync -a ../leetcodemr/public/grind-offline.html \
  ../leetcodemr/public/grind-offline-editor.js \
  ../leetcodemr/public/grind_questions.json \
  ../leetcodemr/public/questions_data_all.json \
  ../leetcodemr/public/description-images-manifest.json \
  public/
rsync -a ../leetcodemr/public/description-images/ public/description-images/
```

Or run `npm run grind:questions && npm run grind:editor` in LeetMastery and copy outputs.
