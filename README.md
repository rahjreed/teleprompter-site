# Mr. Prompterson — Video Teleprompter

**Read it. Record it. Share it.** By Callista Digital.

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
- Requests a native camera frame at up to 30 FPS and resets zoom to 1× where supported. Standard uses the widest 9:16 view that fills the export. Close-Up crops 1.2× closer and can reduce the export resolution. The preview uses the same crop and mirrors only the selfie display.
- Records a matching native 9:16 stream directly. When framing or resolution needs adjustment, a single camera-only crop fills the frame without padding or stretching. Cropped exports target 1080 × 1920, then 720 × 1280, then an even lower resolution when the crop has fewer pixels. Original microphone tracks are passed directly to the recorder.
- Prefers H.264/AAC in MP4 and falls back to a browser-supported format. The encoder targets up to 12 Mbps video and 160 kbps audio. Natural requests minimal browser microphone processing. Voice Cleanup requests echo cancellation, noise suppression, and automatic gain control for comparison.
- When a browser lacks canvas capture, Standard can still record a compatible native portrait track. Other source sizes need a browser that can crop the track. Actual dimensions are read back from the exported blob and shown as verified only when decoded successfully.
- Countdown can be canceled. Scrolling can be paused independently. Recording stops and keeps available chunks when the app is backgrounded or a track disconnects. Screen wake lock is best-effort.
- Navigation is disabled during countdown, recording, and saving; browser unload is guarded. Browser/OS termination can still prevent final media delivery.
- A take is capped at approximately 400 MB to bound memory. Low-storage checks warn before recording and stop an active take. On quota failure the in-memory blob remains playable and downloadable for the current session.

## Local storage and PWA

Download important videos. Browser data deletion, storage eviction, private browsing, or a device change can remove local data. Persistent-storage requests are optional and browser-controlled. Device sharing falls back to download when file sharing is unavailable.

The production build registers a service worker that caches the complete app shell and built JS/CSS. New workers wait for existing tabs to close to avoid replacing a running studio. Development does not register the worker. Installation requires HTTPS (localhost works for development); iPhone installation uses Share → Add to Home Screen.

## Recording diagnostics

Open the app with `?recordingDiagnostics=1`, record a take, then open **Settings → Recording diagnostics**. The panel and browser console show capture-track settings, the decoded preview and export dimensions, crop size, codec identifiers reported by the recorder, encoder bitrate targets, and the export’s average combined bitrate. The optional level meter samples the microphone while recording and reports peak level, highest window RMS, and near-clipping windows. Use an external file inspector for measured per-stream bitrates and frame timing.

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

## Branding assets

The charcoal, silver, white, and red interface is defined in `src/brand.css` and `src/index.css`. The original mascot and icon live under `public/brand/prompterson/`. Use `node scripts/render-brand-icons.mjs` with Playwright Chromium installed to regenerate the four PNG icon sizes and variants from the SVG favicon. The maskable foreground fits within the central 40% radius. [Web App Manifest maskable safe zone](https://www.w3.org/TR/appmanifest/#icon-masks)

## Updating an existing installation

The rebrand uses the same site address, manifest identity, start URL, and IndexedDB database as before. Existing scripts, takes, and preferences stay on that origin. The new release uses fresh brand asset paths and versions the offline cache from the production files, including icons and the mascot.

After the updated build is published, finish any recording, close all app windows and browser tabs for the site, then reopen it online. This lets the new service worker take over. Launcher icon and name updates are handled separately by the browser and OS, so they can take longer than the in-app update. Chrome for Android can update an installed app in place. [Chrome manifest update behavior](https://web.dev/articles/manifest-updates)

Try the in-place update first. **Before uninstalling or clearing site data, copy any scripts you need and download your recordings.** A browser or operating system can remove locally stored data when an app is removed. Some browsers or Home Screen shortcuts may require a fresh install for a new launcher icon. Back up your work before replacing the old shortcut or app.

## Production releases

GitHub Actions publishes new commits on `main` to the existing Vercel production project. Set up the GitHub `production` environment with a `VERCEL_TOKEN` secret and `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` variables before merging this workflow. Confirm these IDs point to the project serving `teleprompter.callistadigital.com`. This repo disables Vercel Git deployments for `main` to leave production promotion to the workflow. Other branches retain their Vercel previews.

`package.json` supplies the original 1.3 baseline. The workflow stages a successful production build, records its commit with a `production/v1.4` tag (then `production/v1.5`, etc.), promotes it, and checks `/release.json` on the production domain. Treat these tags as immutable. Local and preview builds show the baseline and their build channel/commit and never allocate tags. The browser version and diagnostic endpoint are generated from the same metadata.

If promotion fails after the tag is pushed, rerun the original workflow to finish that release with the same version. Later releases wait for the pending release. After a dashboard rollback, restore the latest tagged deployment before publishing another version. Publish through this workflow so the live deployment and version tags remain in sync.

An installed PWA keeps its active app shell until all of its tabs and windows close. When the app reports an update, finish any recording, close all copies of the app, and reopen online. The update replaces app shell caches and preserves recordings, scripts, and preferences.
