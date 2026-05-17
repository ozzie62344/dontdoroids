# FitTracker

A small Next.js app where you can:

- 📸 **Photo food log** — upload a picture of a meal, Claude estimates calories + macros.
- 🔥 **Workout streak** — Duolingo-style daily streak with a 3-month calendar.
- ⚖️ **Weekly weight / height tracking** — log measurements, see a trend chart.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (auth + Postgres + storage) · Anthropic Claude vision (`claude-sonnet-4-6`) · Recharts.

---

## 1. Install Node.js

You don't have Node installed yet. Two easy options on Windows:

- Download the LTS installer from <https://nodejs.org> (pick "LTS")
- …or with winget: `winget install OpenJS.NodeJS.LTS`

After installing, open a new terminal and verify:

```pwsh
node --version
npm --version
```

## 2. Set up Supabase

1. Sign up at <https://supabase.com> and create a new project.
2. Once the project is ready, go to **SQL Editor → New query**, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates the three tables, row-level security, and the private
   `food-photos` storage bucket.
3. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon` public key
4. (Optional) Disable email confirmation under **Authentication → Providers
   → Email** if you'd rather log in immediately after sign-up.

## 3. Set up Anthropic

1. Get an API key at <https://console.anthropic.com>.
2. The app uses model `claude-sonnet-4-6` for food vision by default — change
   it in [`src/app/api/analyze-food/route.ts`](src/app/api/analyze-food/route.ts)
   if you want Opus or Haiku.

## 4. Configure environment

Copy the example file and fill it in:

```pwsh
Copy-Item .env.local.example .env.local
notepad .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

## 5. Install and run locally

```pwsh
npm install
npm run dev
```

Open <http://localhost:3000> → you'll be redirected to `/login`. Click
"Sign up" to create an account, then start logging.

---

## 6. Deploy to Vercel (use it from your phone)

This is the easiest way to get a permanent URL that works from any phone,
on any network.

### One-time setup

1. **Push the repo to GitHub.** If you haven't already:
   ```pwsh
   git add .
   git commit -m "Initial FitTracker"
   ```
   Then create a new repo on github.com and push:
   ```pwsh
   git remote add origin https://github.com/YOUR_USERNAME/fittracker.git
   git branch -M main
   git push -u origin main
   ```
   (Or, if you have the GitHub CLI: `gh repo create fittracker --source=. --private --push`.)

2. **Connect Vercel.** Go to <https://vercel.com/new>, sign in with GitHub,
   pick the `fittracker` repo. Vercel auto-detects Next.js — leave the
   defaults.

3. **Add environment variables.** Before clicking Deploy, expand
   "Environment Variables" and add the same three from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`

4. Click **Deploy**. After ~1 minute you'll get a URL like
   `https://fittracker-yourname.vercel.app`.

5. **Tell Supabase about the new URL.** In Supabase →
   **Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel URL.
   - Add your Vercel URL (and `http://localhost:3000` for dev) under
     **Redirect URLs**.

### Updating

Push to `main` → Vercel redeploys automatically. That's it.

---

## 7. Install on your phone (Add to Home Screen)

The app ships with a PWA manifest, a brand icon, and runs in **standalone
mode** — no browser chrome, just your app.

**iPhone (Safari):**
1. Open your Vercel URL in Safari.
2. Tap the Share button → **Add to Home Screen** → **Add**.
3. The "FT" icon appears on your home screen. Tap it — full-screen app,
   camera permission prompt the first time you photo a meal.

**Android (Chrome):**
1. Open your Vercel URL in Chrome.
2. Tap the ⋮ menu → **Install app** (or **Add to Home Screen**).
3. Same deal — app icon, full-screen.

The photo uploader prefers the rear camera (`capture="environment"`) and
client-side resizes images to 1536px max before uploading, so cellular
uploads are fast and the AI call stays cheap.

---

## Local testing on phone (alternative to Vercel)

If you'd rather skip Vercel for now and test from your phone over Wi-Fi:

```pwsh
# Start dev server bound to all interfaces
npm run dev -- -H 0.0.0.0
# Find your PC's LAN IP
ipconfig | findstr IPv4
```

Then on your phone (same Wi-Fi): `http://<your-pc-ip>:3000`. Note: PWA
install + camera both require HTTPS, so for the full mobile experience
deploy to Vercel — LAN testing over HTTP works but feels stripped down.

---

## How the streak works

A workout entry is **one row per day** (enforced by a unique constraint on
`(user_id, day)`), so multiple logs in the same day don't inflate the
streak. The current streak counts back from today; if today isn't logged
yet, it counts back from yesterday (so the streak doesn't show as broken
until you've actually missed a full day).

## How calorie estimation works

1. Photo uploads to a private Supabase storage bucket at
   `<user_id>/<uuid>.jpg`.
2. The `/api/analyze-food` route downloads the image server-side using
   the user's session, base64-encodes it, and sends it to Claude.
3. Claude returns strict JSON: `{ label, calories, protein_g, carbs_g,
   fat_g, confidence, notes }`. We parse, validate, and insert it.

Estimates are approximations — the model can't see grams, so confidence
varies with portion clarity. The `notes` field tells you what assumptions
it made.

## Project layout

```
src/
  app/
    api/
      analyze-food/route.ts    # Claude vision + insert
      food-thumb/route.ts      # signed-URL photo proxy
    auth/signout/route.ts
    dashboard/page.tsx         # overview cards
    food/page.tsx              # daily totals + upload + history
    workout/page.tsx           # streak + calendar + form
    weight/page.tsx            # chart + form + history
    login/page.tsx
    signup/page.tsx
    layout.tsx, page.tsx, globals.css
  components/
    Nav.tsx
    StreakCalendar.tsx
    WeightChart.tsx
  lib/
    dates.ts                   # streak math + local-date helpers
    supabase/{client,server,middleware}.ts
  middleware.ts                # protects routes, refreshes session
supabase/schema.sql
```

## What's intentionally NOT here

- No daily calorie target / goals UI — easy to add later (a row in a
  `goals` table, displayed as a progress ring on the dashboard).
- No "share my streak" social stuff.
- No mobile app — but it's a responsive web app, works fine as a PWA
  if you "Add to Home Screen" on iOS / Android.
