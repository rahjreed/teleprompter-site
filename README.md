# Callista Teleprompter

A local-first React + Vite portrait teleprompter and video studio. No account or backend. All scripts, settings, and recordings use IndexedDB on the current origin and device. No media is uploaded.

## Develop

```sh
npm ci
npm run dev
npm test
npm run test:browser
npm run test:pwa
npm run build
npm run preview
```

Browser tests require `npx playwright install chromium`. The browser suite uses fake camera and microphone devices. The original Vite configuration is preserved. No deployment has been performed.

Optional WebKit checks: `npx playwright install webkit`, then `npm run test:webkit`. This host initially ran the script and settings checks, but subsequent runs were blocked by a missing WebKit executable. Safari recording is unverified; physical Android and iPhone testing has not been performed.

## Recording behavior

- Requests camera and microphone after tapping Enable. Starts with the front camera; device selection follows permission grant.
- Negotiates a supported MediaRecorder MIME type or lets the browser select its default. Files use the actual container extension.
- Requests 1080 × 1920 (or 720 × 1280). A camera-only canvas center-crops to 9:16, capped at the available source resolution to avoid upscaling. Audio tracks are added directly from the microphone. Neither the text nor controls are drawn to the canvas. CSS mirrors only the preview.
- If canvas capture is unsupported, records the original camera stream and warns when portrait capture is unavailable. Actual dimensions are read back from the exported blob, shown as verified only when decoded successfully.
- Countdown can be canceled. Scrolling can be paused independently. Recording stops and keeps available chunks when the app is backgrounded or a track disconnects. Screen wake lock is best-effort.
- Navigation is disabled during countdown, recording, and saving; browser unload is guarded. Browser/OS termination can still prevent final media delivery.
- A take is capped at approximately 400 MB to bound memory. Low-storage checks warn before recording and stop an active take. On quota failure the in-memory blob remains playable and downloadable for the current session.

## Local storage and PWA

Download important videos. Browser data deletion, storage eviction, private browsing, or a device change can remove local data. Persistent-storage requests are optional and browser-controlled. Device sharing falls back to download when file sharing is unavailable.

The production build registers a service worker that caches the complete app shell and built JS/CSS. New workers wait for existing tabs to close to avoid replacing a running studio. Development does not register the worker. Installation requires HTTPS (localhost works for development); iPhone installation uses Share → Add to Home Screen.

## Device verification checklist

Automated browser tests are not physical phone testing. Before release, test current Android Chrome and iPhone Safari on HTTPS:

1. Allow and deny camera/microphone access; recover using site permissions.
2. Create/edit/tag/search scripts, close and reopen the installed app, verify persistence.
3. Select front/back/device cameras, test portrait framing, font size, opacity, panel drag, scroll speed, pause/resume, and safe areas.
4. Record with audible speech and a visible asymmetric object or written card. Confirm the downloaded file has microphone audio, remains unmirrored, contains no text overlay, and reports 9:16 dimensions in a media inspector.
5. Cancel countdown, stop normally, background/lock the device, disconnect hardware, and retry recording.
6. Play, rename, share, download, delete, and retrieve saved takes. Check downloads in the device Files app.
7. Test low-storage and private-browsing behavior. Install the PWA, reopen offline after one complete online load, and verify updates after all old tabs close.

Desktop automated tests exercise Chromium with synthetic camera/audio, recording transitions, local storage, quota failure, and permission denial. Safari hardware capture and native share sheets require real-device validation.

## Verification — November 6, 2026

- 8 core tests passed.
- All 8 Chromium end-to-end checks passed together after the brand styling update.
- Production build and production offline-reload test passed after the final changes.
- Decoded recording frames verified 9:16 dimensions, unmirrored left/right colors, microphone audio, and absence of text/interface pixels using synthetic media.
- WebKit reruns could not launch because `webkit-2388/Playwright.exe` was missing on this host. Initial script and settings checks passed; full WebKit verification remains incomplete.
- No physical-phone tests, push, or deployment were performed.

## Callista Digital brand styling

The app's brand tokens were measured from the rendered [Callista Digital website](https://www.callistadigital.com) on November 6, 2026: slate-950 (`#020617`), slate-900 (`#0F172A`), amber-500 (`#F59E0B`), white, and slate text colors. It uses the identical system sans-serif font stack, 900-weight uppercase headings, tightly tracked titles, widely tracked labels, pill navigation and buttons, rounded cards, and the site's gold border/glow treatment.

`src/brand.css` contains the shared brand presentation. The original site logo is stored locally in `public/brand` and included in the offline shell. PWA icons are derived from the same logo.
