# Launcher artwork — November 26, 2026

`prompterson/launcher-v4/approved-master.png` is an exact copy of the new approved attachment. Standard launcher, favicon and Apple outputs are proportional, full-bleed resizes; no borders, frames, recoloring or new facial details are drawn. Sizes: 16, 32, 48, 180, 192, 512 and 1024 pixels, plus a multi-resolution ICO.

The Android maskable derivative uses the largest centered even image size that keeps the measured red, silver, white and eyewear features inside the 40%-radius safe circle with 2px clearance. This is 358px within 512px (77px per side), versus the previous 280px tile. Only peripheral charcoal background is extended to fill the canvas. The artwork remains complete and proportionally scaled; the normal/Apple icons have no padding.

The previous `prompterson/approved-v1/` files remain unchanged as a backup. The human `prompterson/mascot.svg` and all welcome, About and pre-permission onboarding mascot references remain unchanged. The header uses the new app icon.

Explicit asset regeneration uses `node scripts/render-brand-icons.mjs` with the existing Playwright dependency. It checks the approved master hash, writes the resized derivatives and records their SHA-256 hashes in `scripts/launcher-v4-assets.json`. Normal dev/build calls only validate the committed outputs and old approved backup: they never render old artwork or overwrite either set of files.

Manifest, Apple touch, favicon, header and social-image URLs now use `launcher-v4`. The existing content-hashed service worker includes the new icons and still precaches the same human mascot. Its existing safe update/activation behavior and all user data stores are unchanged. Social metadata uses the canonical production image URL, which will become available only after the approved production release.

Close all app windows and reopen after an update-ready notice. OS launchers may update installed icons later than browser assets. Do not clear site data or uninstall to force a refresh; this can erase local scripts and recordings. A reinstall is not required for the application update.
