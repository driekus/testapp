# Letter Quest (Android + iPhone Web App)

A JavaScript app where users visit 5 locations in order.

- Each location has a fixed letter configured in admin.
- Reaching the active location awards that location's letter.
- After **Confirm letter and next location**, the next target unlocks.
- Optional map tools (Google Maps/OpenStreetMap) help navigation.
- Anti-cheat checks filter low-quality GPS and unrealistic jumps.

## Requirements

- Node.js 18+
- Supabase project + Supabase CLI (`npm install -g supabase`)
- Browser/device with Geolocation API

## Supabase setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Before opening `/admin.html`, bootstrap your first admin allowlist row via `supabase/admin-bootstrap.sql` (see `supabase/ADMIN_ROLLOUT_NOTES.md`).
4. Enable Email/Password auth in Supabase (for admin login).
5. (Optional) Enable GitHub auth provider if you want **Sign in with GitHub** on admin.
6. Copy `.env.example` to `.env.local` and fill in your values (find them in Supabase → Settings → API):

```powershell
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Edge Functions

The game uses Supabase Edge Functions for gameplay and payment:

- `get-game` — returns safe game metadata + first location only.
- `get-route-start` — returns first location of a route.
- `confirm-arrival` — returns the letter + next location when no question is required.
- `check-answer` — validates answer server-side and returns letter + next location only if correct.
- `create-payment` — creates a payment session (mock or real Tikkie).
- `check-payment` — checks payment status by request token or payment token.
- `tikkie-webhook` — confirms payment (called by mock page or real Tikkie webhook).
- `mark-played` — marks a paid session as consumed after finishing.
- `record-score-event` — stores score events and updates totals.
- `get-scoreboard` — returns top 3 overall plus up to 3 runs for the current player.
- `set-score-display-name` — updates scoreboard display name for a player's runs.

Shared edge helpers:

- `supabase/functions/_shared/paymentVerification.ts` — shared paid-token verification used by gameplay endpoints.

Leaderboard rules:

- Correct answer points: 10 (1st), 5 (2nd), 3 (3rd), 2 (4th), 1 (5th+).
- Answering within 60 seconds adds the remaining whole seconds as a bonus.
- Rankings are sorted by score descending, then total answer time ascending.
- The separate rankings page shows the top 3 overall plus up to 3 of the current player's own runs.

### Deploy Edge Functions

1. Log in to the Supabase CLI and link your project:

```powershell
supabase login
supabase link --project-ref your-project-ref
```

> Find your project ref in Supabase → Settings → General.

2. Set the service role key as a secret (find it in Supabase → Settings → API → `service_role`):

```powershell
supabase secrets set SERVICE_ROLE_KEY=your-service-role-key
```

3. Deploy functions:

```powershell
supabase functions deploy get-game
supabase functions deploy get-route-start
supabase functions deploy confirm-arrival
supabase functions deploy check-answer
supabase functions deploy create-payment
supabase functions deploy check-payment
supabase functions deploy tikkie-webhook
supabase functions deploy mark-played
supabase functions deploy record-score-event
supabase functions deploy get-scoreboard
supabase functions deploy set-score-display-name
```

Redeploy all functions in one command:

```powershell
npm run deploy:functions
```

Preview which functions would deploy without executing:

```powershell
npm run deploy:functions:dry
```

## Real Tikkie API setup (go live)

By default, payment flow can run in mock mode. To use the real ABN AMRO Tikkie API, do this:

1. Create/activate a Tikkie app in ABN AMRO Developer Portal and collect:
   - `TIKKIE_API_KEY`
   - `TIKKIE_APP_TOKEN`
2. Set Supabase Edge Function secrets:

```powershell
supabase secrets set TIKKIE_MOCK=false
supabase secrets set TIKKIE_API_KEY=your-tikkie-api-key
supabase secrets set TIKKIE_APP_TOKEN=your-tikkie-app-token
supabase secrets set TIKKIE_BASE_URL=https://api.abnamro.com/v2/tikkie
```

3. Register your webhook URL in ABN AMRO/Tikkie app settings:
   - `https://<your-project-ref>.supabase.co/functions/v1/tikkie-webhook`
4. Redeploy payment-related functions:

```powershell
supabase functions deploy create-payment
supabase functions deploy check-payment
supabase functions deploy tikkie-webhook
supabase functions deploy mark-played
```

5. (Optional hardening) enable strict paid-token checks in gameplay functions:

```powershell
supabase secrets set STRICT_PAYMENT_VERIFICATION=true
supabase functions deploy get-route-start
supabase functions deploy confirm-arrival
supabase functions deploy check-answer
```

### Use sandbox first

For ABN AMRO sandbox testing, use:

```powershell
supabase secrets set TIKKIE_BASE_URL=https://api-sandbox.abnamro.com/v2/tikkie
```

Keep `TIKKIE_MOCK=false` when testing real (sandbox) API calls.


## Install and run

```powershell
npm install
npm run dev
```

## Pages

- Game: `/`
- Rankings: `/rankings.html?slug=<game-slug>`
- Admin: `/admin.html`
- Language switch: both pages support `EN` and `NL` from the top selector.

## Admin page

- Sign in (email/password or GitHub if configured).
- Edit 5 locations: name, letter, latitude, longitude.
- Hint fields per location:
  - `description`: shown on the target card during the location phase.
  - `question_hint`: shown in the question hint panel during the question phase.
- Or click **Pick from map** and click on map to fill coordinates.
- Click **Save Settings** to save shared route config to Supabase.
- Game page `/` loads the shared route (players do not need sign-in).

## Upload to GitHub

Run these commands from the project root:

```powershell
git init
git add .
git commit -m "Initial Letter Quest app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

If `origin` already exists:

```powershell
git remote set-url origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploy (Vercel - quick)

1. Go to `https://vercel.com/new`
2. Import your GitHub repo.
3. Add project env vars in Vercel settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

> Edge Functions are deployed separately via the Supabase CLI (see above) and are independent of Vercel.

After deploy, open your HTTPS URL on phone and add to home screen.

## Deploy (Netlify alternative)

### Option A: Deploy from GitHub (recommended)

1. Push your project to GitHub.
2. Open Netlify -> **Add new site** -> **Import an existing project**.
3. Choose GitHub and select your repo.
4. Use these build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables in Netlify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Click **Deploy site**.

### Option B: Manual deploy (quick test)

```powershell
npm install
npm run build
```

Then in Netlify, open **Sites** and drag the local `dist` folder into the deploy area.

### After deploy: verify

1. Open `https://<your-site>.netlify.app/` (game page).
2. Open `https://<your-site>.netlify.app/admin.html` (admin page).
3. Sign in on admin and save one test location change.
4. Reload `/` and confirm the new shared config is visible.

### Netlify notes

- If you forgot env vars on first deploy, add them in **Site configuration -> Environment variables** and trigger a redeploy.
- Keep `.env` out of Git; only `.env.example` should be committed.
- Your app uses `admin.html` as a separate page, so no SPA redirect rule is required for this setup.

## Test logic

```powershell
npm run test:logic
```

## Linting

```powershell
npm run lint
```

Auto-fix lint issues (including missing semicolons):

```powershell
npm run lint:fix
```

## Build production assets

```powershell
npm run build
npm run preview
```

## Anti-cheat tuning

Adjust in `src/main.js`:

- `MIN_GPS_ACCURACY_METERS`
- `LETTER_COOLDOWN_MS`
- `MAX_SPEED_METERS_PER_SECOND`
- `MAX_JUMP_DISTANCE_METERS`

## Android/iPhone notes

- Android Chrome: **Add to Home screen**
- iPhone Safari: **Share -> Add to Home Screen**
- Geolocation needs HTTPS in production (localhost is fine for local dev)
