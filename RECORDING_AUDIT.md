# Recording stability audit

The audit starts from production 1.9, commit 4e185fe, on the isolated branch codex/samsung-recording-audit. The original worktree and its uncommitted production-script correction remain separate.

## Findings established from history and code

- The core src/media.js file in production 1.9 is byte-identical to the Version 1.4 sharing-fix commit 1e4890a. Camera constraints, encoder bitrate and the crop/capture loop did not change across those endpoints.
- Version 1.8 (cea08ab) introduced iPhone full-view framing. Version 1.9 (4e185fe) reverted it. The report of failures on both releases rules out attributing every freeze to that framing experiment alone.
- Commit dd7de20 added MP4 finalization to the recording-stop handler. It does not run when the first recording starts. It can affect saving time, retained memory, and later takes.
- Production waits for navigator.storage.estimate() before starting countdown. Fault injection confirms that an estimate that never resolves can prevent recording from starting.
- The production crop pipeline draws its first frame, then depends on requestVideoFrameCallback and manual canvas requestFrame delivery. Fault injection confirms that withholding the optional video callbacks leaves its canvas at one frame. The candidate pipeline continues drawing while decoded camera time advances.
- The MP4 parser inputs were not explicitly disposed. The candidate releases both parser inputs on success and failure. Clearing assembled chunk references and shrinking stopped canvas surfaces also shortens resource retention.
- The downloaded recording remains separate from the HTML preview and teleprompter overlay. Camera tracks are kept for another take. Canvas cleanup stops its own video tracks and leaves the original microphone alive.

## PR 14 review

PR 14 at c102237 was reviewed but was not merged into this branch. Its Android exact-portrait request, lower bitrate, smaller memory limit, worker, smoothing changes and service worker edits were not adopted. The candidate independently uses timed canvas capture and makes storage estimation advisory, with targeted regression coverage. Camera field-of-view constraints, 12 Mbps Full HD encoder target, resolution selection, MP4 full-timeline verification, normal visual design, production versioning and storage schema retain production behavior.

## Candidate changes

The canvas crop remains edge-to-edge 9:16 and uses the same centered crop and optional Close-Up scale. A bounded animation-frame draw loop follows decoded camera time, with timed capture at 30 fps. It no longer depends on the optional video-frame callback/requestFrame pair. This is a defensive fix for the demonstrated callback dependency, not proof that this was the S23+ trigger.

An opt-in journal records the most recent 120 diagnostic events and 60 camera health samples. It reports decoded/dropped camera frames, canvas draws, encoder state, delivered chunks/bytes, chunk silence, main-thread scheduling delay, track mute/end state, page visibility and optional Chromium heap size. Data stays in localStorage in this preview origin and can be downloaded through Settings. It contains no recording bytes, scripts or device IDs. It cannot capture telemetry while the entire browser thread is hung, cannot measure GPU utilization directly, and cannot diagnose an OS-killed process conclusively.

## Verification and limits

Untouched production and the audit candidate both completed three consecutive 3/60/3-second captures in desktop Chromium with simulated camera and microphone. The production baseline's long recording decoded as 60.56 seconds. The endurance test additionally checks downloaded MP4 duration and H.264/AAC streams with FFprobe, playback near the end, 9:16 dimensions and source camera/microphone liveness.

The simulated landscape camera produces a 594x1056 crop in that endurance case. Separate synthetic portrait/framing regression cases exercise native 1080x1920 and cropped paths. These are not physical Samsung or iPhone camera tests.

The first broad Chromium run passed 31/32 tests, with a very short Close-Up take missing a usable media track. Three isolated repeats of that case passed. A subsequent broad run hit an initial camera-opening timeout at five seconds. These intermittent test observations are recorded rather than treated as a confirmed reproduction of the reported phone freeze.

The production build and 16 unit/MP4 tests passed. Offline and existing-data PWA regressions passed. Final browser results are reported with the preview delivery.

## Galaxy S23+ validation

The affected device is a Galaxy S23+, in both Chrome and Samsung Internet. Android version, browser versions and the precise freeze stage remain unconfirmed.

1. Open the Vercel preview in each browser and test with ordinary settings first. Keep the production site available separately.
2. Open the preview with ?recordingDiagnostics=1 for the diagnostic run. Record three takes, including one lasting at least 60 seconds. Try Standard 1080p first, then HD and Close-Up.
3. If a freeze occurs, record whether it began before countdown, during capture, or after Stop. When controls respond, stop normally. Open Settings, expand Recording diagnostics, and select Download diagnostics. The previous snapshot remains available after reloading the same tab if browser storage survives.
4. Compare cameraFrames/cameraTime, canvasFrames, bytes/chunks, mainThreadDelayMs and phase. Camera advancing while canvas stops points to drawing/scheduling. Canvas advancing while chunks stop points toward the encoder, though timeslice delivery is not guaranteed. Both camera and canvas stopping can involve camera delivery, visibility, browser scheduling or GPU resources. A large main-thread delay identifies scheduling blockage but does not identify its cause by itself.
5. Download the full take and verify its duration, final seconds, edge-to-edge framing, normal field of view and sound in an external player. Repeat switching cameras and returning from the video library.
6. Test current iPhone Safari and its installed PWA before production approval.

A device/browser/driver cause and the exact Galaxy S23+ trigger remain unconfirmed. If both browsers still freeze, the diagnostic export plus Android and browser version numbers should guide the next change. No production merge is justified solely by desktop success.

### Final local run results

- 16/16 unit and MP4 tests passed, including the 35-second finalized H.264/AAC timeline fixture.
- The production build passed. Vite reported the existing large main-bundle warning (the MP4 library remains on the main bundle).
- Both PWA tests passed, including existing scripts, recordings and preference preservation.
- The latest broad Chromium run passed 31/32. Its camera-opening test exceeded a five-second assertion deadline. That complete record/download/retrieval scenario then passed all three isolated repeats. Every Chromium case passed in at least one completed run, but a single clean 32/32 run was not obtained.
- Close-Up capture passed all three isolated repeats and in the latest broad run after one earlier short synthetic capture produced missing media.
- Untouched production completed the repeated 3/60/3-second test. The candidate completed it twice, with the latest run checking each downloaded MP4 through FFprobe for full duration and H.264/AAC tracks.
- The callback-stall and storage-estimate fault-injection cases passed.
- WebKit could launch a process but failed to create a page for all three cases with browserContext.newPage: Target page, context or browser has been closed. No WebKit application assertions ran. Physical iPhone testing remains required.
- The once-per-second diagnostic history is not sent to console, to avoid retaining historical snapshot arrays in DevTools. Its bounded localStorage snapshot is optional and local.

## Diagnostic retention correction

The original preview could export browser/build information alone because collection was enabled only by a URL flag, frame monitoring began after MediaRecorder startup, and React effects deferred writes to tab-scoped sessionStorage. A freeze during permission acquisition, zoom constraints, preview playback, recorder construction or start could prevent collection or persistence. An export in a fresh tab could also lack the previous tab's evidence.

The corrected preview persists a bounded journal directly in each diagnostic handler before publishing React state. It keeps the opt-in across reloads and query removal, records page startup and performance immediately, checkpoints permission/camera/zoom/playback/encoder operations before calls, starts camera monitoring before preview playback, records encoder chunk/error and lifecycle events immediately, and exports directly from the journal. Existing legacy diagnostic session data is imported when available. A persistence status explicitly reports unavailable/full browser storage instead of silently pretending that it was saved.

This provides evidence from before a stall and recovery after tested renderer crashes. A total main-thread freeze cannot execute a new JavaScript sample, and a hard OS/browser crash can lose the most recent browser disk write. Browser storage clearing, eviction, private-mode shutdown and changing preview origins can remove or separate evidence. The diagnostic system does not clear application databases or require deleting recordings.
### Durable browser-crash recovery

A forced full Chromium process crash demonstrated that a newly returned localStorage write can still be lost. Diagnostics now also use a separate IndexedDB database (prompterson-capture-diagnostics) with strict-durability write transactions where supported. Startup restores that journal before queuing new writes. Critical camera/zoom/encoder checkpoints await a commit barrier, with a two-second deadline and explicit pending status if storage stalls. This deadline avoids introducing an indefinite diagnostic storage wait into camera startup. The original application database is never opened or changed by the journal.

The retention tests passed for a renderer crash followed by export in a fresh tab, live frame/encoder data saved before Stop, and a separate full browser process crash followed by restart of its persistent test profile. They verify previously committed evidence survives, not that a browser can execute logging during a completely blocked thread. The export identifies durability as strict, browser-default, unavailable, failed or pending. Reopen the same diagnostic URL after a crash so collection and recovery are explicitly enabled.

Final verification for the retention correction passed 19 unit/MP4 tests, all three diagnostic browser tests (including a full crash during active capture), the existing recording/storage browser cases, both PWA tests, and a 3/60/3-second capture with downloaded H.264/AAC MP4 validation. The recording timer starts after diagnostic checkpoint waits so journal commit latency is excluded from capture duration. Use recordingDiagnostics=0 to disable diagnostic collection without clearing its saved journal. Production remains unchanged.

## Three-second freeze investigation (2026-11-21, based on 6cea6f2)

The reported stage is now confirmed by the user: capture begins, then the image freezes after approximately three seconds on Galaxy S23+ in Chrome and Samsung Internet. No diagnostic export containing that device's active capture evidence was supplied in this run. The phone's exact stopping layer therefore remains unconfirmed.

### Confirmed diagnostic defect

Two tabs shared one whole-journal snapshot. An idle tab's page/performance writes could replace the recording tab's camera and encoder evidence, and export could read the idle tab's stale in-memory journal. A regression test reproduced this loss before the correction. Journal v3 assigns unique event and writer IDs, merges bounded histories in an atomic IndexedDB read/merge/write transaction, merges immediate localStorage checkpoints, and reads shared durable evidence again before export. A separate v3 record prevents an already-open older preview from overwriting the corrected journal. Legacy evidence is imported; no application scripts, recordings or preference stores are changed.

Camera monitoring independently counts video-frame callbacks and playback-quality frames. Timestamped samples include camera callback/media time, canvas draw count and trigger, fallback draws, context/track state, MediaRecorder chunk count/bytes/timecode and output silence. Track, video, canvas, recorder and page lifecycle events are checkpointed. Counters update in memory per frame; health is persisted once per second, and lifecycle events immediately. Routine telemetry no longer re-renders the camera React tree. Camera media-clock advancement alone is no longer treated as proof that a new image arrived.

### Confirmed capture failure mode and correction

In diagnostic commit 6cea6f2, canvas drawing required both requestAnimationFrame delivery and a change in video.currentTime. A controlled moving-color camera source and real MediaRecorder reproduced an image freeze when compositor callbacks were withheld after three seconds. The MP4 container/audio lasted 9.148 seconds, but decoding the video at one sample per second yielded only three image samples. Container duration and live encoder output alone were insufficient validation.

The corrected existing canvas pipeline prefers requestVideoFrameCallback, uses requestAnimationFrame on older browsers, and has an independent timer fallback after 100 ms without callback delivery. Drawing remains capped at 30 fps with timed canvas capture. It does not gate on currentTime. Callback cancellation and generated-track cleanup are idempotent. Camera constraints, field of view, centered 9:16 crop, 1080p target, 12 Mbps target, audio configuration and MP4 finalization remain unchanged. No UI or branding changes were made.

This fixes the reproduced scheduling dependency. It does not prove the physical S23+ has the same browser/compositor trigger, and a JavaScript timer cannot recover a stopped camera driver, GPU context or entirely hung browser thread. Frame counters measure delivery/draw operations rather than pixel identity; the saved-file motion tests below separately inspect decoded image content.

### Current verification

- 20 unit/MP4 tests and the production build passed. The existing main-bundle size warning remains.
- 33/33 broad Chromium regression tests passed in one completed run: scripts, permissions, recording/download/retrieval, framing, touch dragging, lifecycle cleanup, sharing, installation and four diagnostic retention tests.
- Retention checks include a renderer crash, full separate-browser process crash, live encoder/frame data before Stop, and export from a competing idle tab.
- Four additional decoded-motion tests passed: the 6cea6f2 injected-failure reproduction, plus 40-second candidate captures in normal, stalled-callback and no-video-callback modes. Each candidate file decoded to 40 one-second image samples, with changing dominant colors in every five-second window; all were H.264/AAC at 1080x1920 with durations 40.152, 40.265 and 40.161 seconds respectively. This verifies changing content across the timeline, not every encoded frame or physical camera image quality.
- Both PWA checks passed on rerun, including offline assets and preservation of existing script/video/preferences data. The first attempt timed out waiting for service-worker readiness; no service-worker/application change was made for that retry.
- The local WebKit process failed at browser.newPage before any app assertion. Physical iPhone Safari/PWA compatibility is still a release gate.

Use the same preview origin with ?recordingDiagnostics=1 in each affected S23+ browser. Record at least 35 seconds, then export Settings > Recording diagnostics. After a freeze/crash, reopen the same origin and export; do not clear site storage. The last committed samples can show whether camera delivery, canvas draws or encoder output stopped first. A complete browser hang cannot execute further logging, and storage eviction or the very latest uncommitted disk write cannot be guaranteed against an OS kill. Validate the complete downloaded take's motion and sound on the phone before approving production.

The final repeated-capture suite also passed all three cases: consecutive 3/60/3-second recordings with full downloaded H.264/AAC timelines and live source tracks, withheld optional video callbacks, and a hung storage-estimate request. Across the separate current Chromium suites, all 40 cases passed (33 broad, four decoded-motion, three endurance/fault cases).
