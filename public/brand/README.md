# Approved Mr. Prompterson artwork

`prompterson/approved-v1/` contains the definitive artwork supplied in `mr-prompterson-assets.zip` on November 25, 2026. The master, favicon and supplied size variants are preserved byte-for-byte. `scripts/approved-brand-assets.json` records their SHA-256 hashes.

The header uses the approved 192px image; welcome, pre-permission camera onboarding and About use the supplied 512px image. No branding is added to the live preview or recorded video. The existing tagline, layout and attribution are retained.

`generate-brand-icons.mjs`, run by dev/build, verifies approved hashes/dimensions and copies the supplied 180px icon to the Apple touch filename. It does not draw artwork. `render-brand-icons.mjs` only creates the committed 512px maskable derivative: the complete approved image is scaled proportionally to 280px and centered on black with 116px padding. The entire image, including its square corners, fits within Android's central 40%-radius safe circle. Nothing is cropped or redrawn.

The favicon uses the supplied ICO plus 16px/32px PNG variants. Social cards use the supplied 1024px image with square-card metadata. Asset URLs have a new `approved-v1` namespace. The existing content-hashed service-worker generation includes these files, precaches all used app/install assets and safely replaces only obsolete app-shell caches after activation. It does not delete IndexedDB, localStorage, scripts, recordings or preferences.

Existing users can close all app windows and reopen after the update-ready notice. OS launchers may refresh installed names/icons later than page assets. Do not uninstall or clear site data to force an icon refresh: this can lose locally stored recordings and scripts. No reinstall is required for the app update.
