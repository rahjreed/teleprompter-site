# Approved artwork integration — November 25, 2026

Branch: `codex/approved-mr-prompterson-branding`, based on production/main `69085f6` (Version 1.11). This branch is for preview approval; no production deployment or merge is authorized.

## Changes

- The nine supplied files from `mr-prompterson-assets.zip` are stored unchanged under `public/brand/prompterson/approved-v1/`, including the definitive master. SHA-256 comparisons against the ZIP confirm byte-for-byte identity.
- The header uses the approved 192px icon. Welcome, existing pre-permission onboarding and About use the supplied 512px artwork. The tagline, current Travel Pro X attribution, interface layout and visual styling remain unchanged. No artwork is introduced into live camera capture or exports.
- Manifest icons use the approved 192px/512px files and a padded 512px maskable derivative. The complete icon fits inside the 40%-radius maskable safe circle, with no cropping/redrawing. Apple touch uses an exact copy of the supplied 180px PNG. ICO and 16px/32px PNG favicon references are updated.
- Open Graph/Twitter square-card imagery references the supplied 1024px icon. Metadata uses the canonical production image URL; that public social-image URL becomes available with the approved production release. The identical path is available on the preview origin for review.
- The build-time generator validates approved hashes/dimensions and copies the Apple alias; it cannot regenerate the former artwork. The optional render script only produces the maskable padding derivative using existing Playwright tooling. No dependencies or lockfile changes were introduced.
- Superseded SVG/PNG product assets and unreferenced legacy Callista logo files are removed. The new URL namespace prevents accidental reuse of old artwork URLs. The existing content-hashed service-worker build includes the new assets and precaches all used branding/install images. Activation still waits safely; only old app-shell caches are retired. User databases and preferences are untouched.

## Verification

- Production build passed, including approved-file validation and generated service-worker cache revision `62e94dec9db7` for the local build. The existing large-bundle warning remains.
- 16/16 unit/MP4 tests passed.
- Both PWA tests passed: image dimensions/MIME types, maskable safe zone, installability, offline assets and preservation of existing scripts, recordings and preferences.
- Desktop, Android-sized and iPhone-sized Chromium presentation checks passed for welcome/header, About and pre-permission onboarding: images loaded at their intended sizes, used contain-fit, no horizontal overflow, no page errors, and no camera header. WebKit at iPhone dimensions also passed header, welcome and About rendering checks.
- The first Chromium suite passed 27/29: an existing attribution assertion still expected Callista Digital despite current main using Travel Pro X, and one 1.5-second synthetic native recording exceeded the 0.3-second tail threshold (0.366 seconds). Branding/alt-text assertions were aligned to the current product. The recording test passed all three isolated repeats with its assertions and recording code unchanged.
- CameraView, media/encoder code, MP4 repair, scripts/storage, preferences, recording controls, audio, scrolling and application versioning are unchanged from main. Physical Samsung/iPhone recording reliability is outside this branding-only change.

Physical Android/iOS installation and OS launcher icon refresh have not been verified on devices. Installed launchers and sharing crawlers may retain their own icon/card caches. Existing users should close all app windows and reopen after the update notice. Do not clear site data or uninstall to force an icon refresh; doing so may lose locally stored footage/scripts. The update does not require reinstallation.

Final complete Chromium run: 29/29 passed after the branding assertions were aligned. The recording tail assertion was unchanged and passed both three isolated repeats and the full final run. No recording workaround or threshold relaxation was introduced.
