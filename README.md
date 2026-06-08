# Letter Quest (Android + iPhone Web App)

A JavaScript app where users visit 5 locations in order.

- Each location has a fixed letter configured in admin.
- Reaching the active location awards that location's letter.
- After **Confirm letter and next location**, the next target unlocks.
- Optional map tools (Google Maps/OpenStreetMap) help navigation.
- Anti-cheat checks filter low-quality GPS and unrealistic jumps.

## Requirements

- Node.js 18+
- Supabase project
- Browser/device with Geolocation API

## Supabase setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Enable Email/Password auth in Supabase (for admin login).
4. (Optional) Enable GitHub auth provider if you want **Sign in with GitHub** on admin.
5. Copy `.env.example` to `.env` and set:

```powershell
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Install and run

```powershell
npm install
npm run dev
```

## Pages

- Game: `/`
- Admin: `/admin.html`
- Language switch: both pages support `EN` and `NL` from the top selector.

## Admin page

- Sign in (email/password or GitHub if configured).
- Edit 5 locations: name, letter, latitude, longitude.
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
