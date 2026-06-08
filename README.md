# Letter Quest (Android + iPhone Web App)

A JavaScript app where each user must visit 5 locations in order.

- Each location has a fixed letter configured by the admin.
- When the user reaches the active location, that configured letter is awarded.
- After pressing **Confirm letter and next location**, the next target is unlocked.
- Optional map tools can be turned on to navigate with Google Maps or OpenStreetMap.
- Anti-cheat checks block low-accuracy GPS readings, enforce a cooldown, and reject unrealistic jumps.
- A separate admin page lets signed-in users set names, letters, and coordinates (input or map click).

## Requirements

- Node.js 18+
- Supabase project (for per-user cloud config)
- A browser/device that supports Geolocation API

## Supabase setup (required for per-user config)

1. Create a Supabase project.
2. Run SQL in `supabase/schema.sql` in the Supabase SQL editor.
3. In Supabase Auth settings, enable Email/Password sign-in.
4. Copy `.env.example` to `.env` and set:

```powershell
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Install and run

```powershell
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Pages

- Game: `/`
- Admin: `/admin.html`

## Admin page

- Sign in with your Supabase user.
- Edit all 5 locations: name, letter, latitude, longitude.
- Or click **Pick from map**, then click on the OpenStreetMap map to fill lat/lng.
- Click **Save Settings** to store route config in Supabase for the signed-in user.
- Return to `/` and click **Reload cloud config** if needed.

## Test the core game logic

```powershell
npm run test:logic
```

## Build production assets

```powershell
npm run build
npm run preview
```

## Anti-cheat checks

You can tune thresholds in `src/main.js`:

- `MIN_GPS_ACCURACY_METERS`
- `LETTER_COOLDOWN_MS`
- `MAX_SPEED_METERS_PER_SECOND`
- `MAX_JUMP_DISTANCE_METERS`

## Notes for Android and iPhone

- Android Chrome: open the app and choose **Add to Home screen**.
- iPhone Safari: use **Share -> Add to Home Screen**.
- Geolocation needs HTTPS in production (localhost works for development).
