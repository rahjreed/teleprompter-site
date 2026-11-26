# Approved borderless launcher update — November 26, 2026

Branch: `codex/approved-borderless-launcher`, based on main `07a3b1b`.

The attached `a_square_app_icon_style_graphic_a_sleek_cartoon.png` is copied byte-for-byte to `public/brand/prompterson/launcher-v4/approved-master.png`. SHA-256: `496cfadb6ab0a5340e6c8f52b89185a1f114727c4d0a99353dbf75bd40752b84`. Required 16/32/48/180/192/512/1024px PNGs and a multi-size ICO are resizes of that exact source. Colors, sunglasses, reflections, white smirk and red dot are not redrawn or recolored. Normal/Apple icons have no padding or added border.

The maskable icon places the complete artwork at 358px within a 512px canvas, using 77px of peripheral background extension on each side. This is the largest centered even scale that leaves the measured features 2px inside the 40%-radius safe circle. It is larger than the prior 280px treatment. Only surrounding charcoal background is extended; the central artwork stays intact. A simulated circular mask retained all 1,520 solid red-dot pixels.

Manifest, header product icon, Apple touch, favicon and social image URLs use a fresh `launcher-v4` namespace. The service worker precaches these icons and the existing human mascot; its content hash changes automatically (`3c94b2e584d2` for the local build). Its existing wait-for-safe-activation behavior is retained. User stores are not opened or cleared by this change. Social metadata's production image URL becomes available on the approved production release.

The previous `approved-v1` artwork and derivatives remain unchanged as a backup. The human `mascot.svg` and its welcome/About/pre-permission references are unchanged. Camera, recording, audio, script scrolling, MP4 exports, storage, versioning and user preferences are untouched from main, including main's latest Android camera correction.

Normal build/dev scripts now validate committed launcher hashes and dimensions; they cannot regenerate old launcher artwork. The explicit rendering script uses only the approved master and existing Playwright tooling. No dependencies or lockfile changes were added.

Verification:

- Production build passed, with the existing large-bundle warning.
- All branding-file hashes were identical before and after the build, including both icon sets and the human mascot.
- 17/17 unit/MP4 tests passed, including a new no-overwrite generator contract test.
- 29/29 existing Chromium browser tests passed in one run.
- 2/2 PWA tests passed: dimensions, PNG/ICO MIME types, maskable safe zone, installability, offline branding and existing script/video/preference preservation.
- Desktop Chromium, Android-size Chromium and iPhone-size WebKit presentation passed, including the new header icon and unchanged human mascot in welcome/About.
- Circular Android and rounded iOS masking were visually inspected as simulations. Physical Android/iOS launcher refresh and installation behavior remain unverified.

No merge or production deployment is authorized. Existing installations should close all windows and reopen after the update-ready notice; launchers may cache icons separately. Do not uninstall or clear site data to force an icon update, since that can lose local recordings/scripts.
