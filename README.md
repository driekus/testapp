# Letter Quest (Android + iPhone Web App)

A small JavaScript app where the player must visit 5 locations in order.

- When the user enters the active location radius, the app gives one random letter.
- After pressing **Confirm letter and next location**, the next target location is unlocked.
- Optional map tools can be turned on to navigate with Google Maps or OpenStreetMap.
- Built as a PWA-style web app so it can run in mobile browsers and be added to home screen.

## Requirements

- Node.js 18+
- A browser/device that supports Geolocation API

## Install and run

```powershell
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Test the core game logic

```powershell
npm run test:logic
```

## Build production assets

```powershell
npm run build
npm run preview
```

## Configure your own 5 locations

Edit the `route` array in `src/main.js`:

```js
const route = [
  { name: 'Start Gate', lat: 52.3676, lng: 4.9041 },
  // ...4 more
]
```

Keep exactly 5 entries to match the quest flow.

## Optional map view

- Turn on **Show map tools (Google Maps/OpenStreetMap)** in the app.
- Use **Open in Google Maps** or **Open in OpenStreetMap** to navigate to the active target.
- The embedded OpenStreetMap preview stays optional and hidden by default.

## Notes for Android and iPhone

- Android Chrome: open the app and choose **Add to Home screen**.
- iPhone Safari: use **Share -> Add to Home Screen**.
- Geolocation needs HTTPS in production (localhost works for development).


