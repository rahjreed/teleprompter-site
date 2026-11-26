# Galaxy S23+ camera investigation

Base: production main `33c80f9968c27918f3c4d7daa1b132e2c7d73cc4`, Version 1.16.
Branch: `codex/s23-camera-lifecycle-investigation`. Production is not changed.

## Findings and boundaries

- The user confirmed zoom changes while tilting in portrait. Screen rotation alone cannot explain that observation.
- Production has one visible `.camera-preview` video. The portrait canvas reads that same element, not a hidden recording video. A live MediaStreamTrack does not prove that this element is playing or receiving fresh pictures.
- In a controlled test against the actual `33c80f9` media module, withholding video-frame callbacks after three seconds stops the manual canvas submissions. The MP4 retains its audio/file duration but decoded video pictures end around the callback stall. This confirms an application weakness, not the cause of the physical Samsung pause.
- Pausing the visible video while leaving its source live reproduces frozen video time with continued application operation. The independent cloned-track frame probe continues in Chromium. Instrumentation identifies the exact visible element, source identity, pause call stack and React instance. React transitions do not replace the preview in the tested countdown/recording path. No production `pause()` call on the camera was found.
- History: `07a3b1b` simplified Android acquisition to `audio: true` plus facing mode/device ID, bypassing non-Android resolution/zoom renegotiation to avoid initialization stalls. This remains unchanged. It also bypasses optional zoom reset. That is not evidence that Samsung zoom can safely be fixed with new constraints.
- Preview CSS remains `object-fit: cover`, a fixed 9:16 frame and the chosen Standard/Close-Up transform. There is no tilt-driven scale handler. Canvas crop is independently derived from intrinsic source dimensions each draw; changing those dimensions changes the crop even if CSS is unchanged. The new evidence distinguishes these cases.
- MP4 finalization starts only after Stop. Moving finalization or reducing bitrate does not address a preview that pauses during recording. Codec, bitrate, audio, export and finalization code are preserved.
- Samsung hardware/driver processing, lens selection and the precise trigger of the intermittent pause/portrait-tilt zoom remain unconfirmed. Browser settings do not expose every native camera adjustment. No claim is made that physical S23+ behavior is fixed.

## Implemented changes

1. Opt-in timestamped capture journal, immediate localStorage checkpoints plus a separate IndexedDB journal with strict transaction durability where supported. Retains 240 events and 120 health samples, recent configuration and pause provenance. Merges writers and previous diagnostic schema without deleting app data. No frame pixels, recordings, script text or device/group IDs are exported; device/group IDs become page-local aliases.
2. Instrument the actual visible video: stable element/session IDs, ref attach/detach, React state commits, play/pause/load/srcObject/src/muted operations and stack traces, media/DOM lifecycle events and source identity. No global media prototypes are patched, no automatic repeated play calls.
3. One-second health checkpoints include video time/decoded frames/callback age, canvas draws/crop, encoder state/chunks/bytes/timecodes, scheduling delay, optional heap size, visibility/orientation/tilt and configuration changes. Encoder chunk delivery is not an exact encoder-frame counter; browsers can buffer chunks. Quiet chunks alone do not prove failure.
4. Optional `rawCameraProbe=1` clones the track for MediaStreamTrackProcessor where available in the window, closes every VideoFrame immediately and stops only the clone. Unsupported/worker-only implementations report unavailable. This adds a consumer, so compare runs with and without it; it is off by default and not a hardware sensor probe.
5. Android only: a timer draws/submits frames if primary canvas callbacks have been absent for 100 ms while the video is playing. It uses the existing source frame rate (30 fallback). Native 9:16 passthrough is unchanged. This addresses the independently reproduced callback-starvation failure, cannot repair a genuinely paused/frozen source, and is not presented as a Samsung driver fix. A paused/mismatched preview cannot start an Android encoder; the existing Try again control acquires a fresh session.
6. Diagnostics no longer update React state on every capture checkpoint. Settings refreshes the diagnostic view once a second. Export reads fresh merged evidence, identifies the current exporter build separately, and tags evidence with its originating build/writer. This prevents retained older evidence from masquerading as the current Settings build.

## Earlier incomplete diagnostic exports

The `6cea6f2` page-level heartbeat can run without proving camera acquisition/recording occurred. Its export also spreads retained journal fields after current build metadata, permitting a stale build field to override the exporter. Earlier journal versions used session/local checkpoints without the new cross-tab/durable merge guarantees. Current production retains only the latest diagnostic sections in React memory and has no durable event history. A page-load-only export cannot by itself distinguish a wrong tab/build, a missing capture path or lost pre-crash writes. The new request/acquisition/preview/encoder checkpoints, writer/build labels and recovery tests make those distinctions observable. Do not treat the old export as proof that no camera activity occurred.

## Preservation

No changes to camera acquisition constraints, iPhone framing/zoom reset, quality targets, codec selection, canvas crop mathematics, audio processing preferences, finalization, Downloads/Share, app data stores, icons, branding, CSS, script movement/scrolling or production release logic. PR #21's playback X -> Home and keyed fresh Record Again sessions are preserved. Its test now explicitly grants simulated browser permission; fake UI acceptance alone returns to prompt after stopping tracks in headless Chromium.

## Reproducible automated checks

Install dependencies, provide FFmpeg and FFprobe on PATH, then run:

```
npm test
npm run build
npm run test:browser
npm run test:pwa
npm run test:webkit
```

`tests/browser/s23-motion.spec.js` decodes downloaded H.264/AAC MP4s at one image per second, verifies changing colors in each five-second interval, 1080x1920 output, full duration and non-silent decoded audio sampled across the take. Modes: production callback-fault baseline (9 seconds), normal capture after 10 seconds preview (65 seconds), callback stall (35 seconds), and absent RVFC (35 seconds). Baseline deliberately proves the old failure. These are synthetic camera/encoder tests, not Samsung hardware certification.

`tests/browser/s23-evidence.spec.js` covers fixed-portrait tilt, reported zoom vs unchanged geometry, intrinsic dimensions vs CSS crop, visible pause/live track/raw frames, paused-source rejection, track interruption, renderer-crash export and dedicated browser-process-crash IndexedDB recovery. The process test uses its own profile and fake devices on both launches; it never crashes the user's browser. Only completed checkpoints can be guaranteed recoverable; a crash can lose an in-flight transaction and storage remains subject to browser quotas/eviction.

WebKit UI tests cover script persistence, permission denial and responsive layouts. A 35-second synthetic recording test runs only where the runtime supports MediaRecorder and canvas capture. The Windows WebKit runtime lacks both (and native mediaDevices); that recording test is explicitly skipped, not counted as iPhone recording verification. Physical iPhone testing is required.

Test artifacts are in ignored `test-results/`: runner logs, diagnostic JSON, downloaded MP4s and decoded motion evidence. No recordings or diagnostic exports are uploaded automatically.

## Samsung preview acceptance procedure

Use the immutable preview origin, not the installed production icon. Test both Chrome and Samsung Internet. Record exact browser/Android versions alongside the export. Existing production scripts/videos are on their original origin and remain untouched.

1. Open `/?recordingDiagnostics=1`. Leave preview open at least 15 seconds, tilt while remaining portrait, and note the wall-clock time of any zoom/freeze.
2. Record immediately after startup for 65 seconds, moving a hand or clock in frame and speaking throughout. Stop, download, and check motion/audio near 5, 30 and 60 seconds and the end.
3. Close playback with X: confirm Home. Re-enter and wait 10 seconds before another 65-second recording. Use Record Again for at least three consecutive fresh sessions. Repeat portrait tilt during preview and capture. Test landscape rotation separately, without confusing it with portrait tilt.
4. If a freeze occurs, keep the app foregrounded several seconds so pre/post samples are retained. Stop if responsive. Go Home -> Settings -> Recording diagnostics -> Download diagnostics. If Chrome crashes, reopen this SAME preview origin and export; do not clear site data.
5. Repeat the failing sequence with `/?recordingDiagnostics=1&rawCameraProbe=1` to obtain independent track frames if supported. Compare against the normal probe-off run because the extra consumer may affect a device driver. Also compare `/?recordingDiagnostics=0` for observer overhead.
6. Interpret: raw frames advance + paused same visible element -> playback lifecycle; playing/time advances + canvas stops -> draw scheduling; canvas advances + buffered encoder output -> inspect downloaded motion/audio rather than assuming encoder failure; raw probe and video both stall -> upstream track delivery/browser/driver remains possible. Correlate configuration/geometry changes with the reported zoom time. Stable public settings cannot exclude native reframing.
7. Verify an iPhone preview capture/download with speech and wide selfie framing before production approval. Test installed-PWA lifecycle separately; synthetic desktop media is insufficient.

If API zoom control cannot be demonstrated safe, do not add it. The existing Camera selector can select a named front device where exposed, but a logical device ID does not guarantee a fixed physical lens. Keep current wide capture and 9:16 output until hardware evidence supports another change. Do not merge/release before S23+ preview approval.

## Executed results (2026-11-26)

- 26/26 Node tests passed, including sequential release reservations/retries, camera constraints, diagnostic export provenance, durable journal merging, icon idempotence, MP4 finalization and sharing.
- Production build passed. Existing bundle-size advisory remains; no new dependency was added.
- All 42 distinct Chromium scenarios passed across the full suite and targeted confirmations. The full 41-case run had 40 passes and one native-path playback-tail timing miss (0.313257 s against the unchanged 0.300 s limit) while WebKit was running concurrently. That original test passed in isolation; its threshold and application behavior were not weakened. The added Android three-take case also passed. Earlier harness issues (fake native permission grant, five-second chunk assumption, crash-event waiting and post-read durability metadata) were corrected in tests, not by changing camera behavior.
- Full downloaded normal take: 65.324340 s MP4, 65 decoded one-second picture samples with ongoing motion, H.264 video at 1080x1920 and AAC with non-silent audio across the take. Preview had run for 10 seconds before recording.
- Production callback-fault baseline: 9.125854 s file/audio but only 3 decoded picture samples. Android candidate with only RVFC withheld and animation callbacks still available: 35.333767 s, 35 changing picture samples and AAC audio. The no-RVFC path also passed a 35-second motion/audio test.
- Paused visible preview: same sampled/React element ID, track live, time frozen near 3.15 s, raw cloned-track frames continuing (98 versus 63 decoded preview frames in one saved sample). This is injected, not a new physical Samsung trace.
- Renderer crash followed by UI export passed. Dedicated browser-process crash followed by profile restart recovered previously committed recording health from IndexedDB and successfully wrote another strict checkpoint. Neither test asserts that an in-flight write or OS power loss is lossless.
- 2/2 production PWA/offline/data-preservation tests passed.
- WebKit: 3 UI tests passed; 1 recording test explicitly skipped because this Windows runtime exposes neither MediaRecorder nor canvas capture. Physical iPhone recording is unverified.
- PR #21 navigation/closeModal/recordAgain, Playback and VideoShareButton were compared byte-for-byte with production. No protected branding, storage, CSS, deployment/version scripts, or PWA source files changed. The existing service-worker build hashing automatically changes with the new bundle.

Changed files: `src/App.jsx`, `src/CameraView.jsx`, `src/media.js`, `src/cameraEvidence.js`, `src/captureMonitor.js`, `src/diagnosticExport.js`, `src/diagnosticJournal.js`, `src/previewLifecycle.js`, `tests/browser/app.spec.js`, `tests/browser/s23-evidence.spec.js`, `tests/browser/s23-motion.spec.js`, `tests/camera-evidence.test.js`, `tests/diagnostic-export.test.js`, `tests/diagnostic-journal.test.js`, `tests/webkit/recording.spec.js`, `playwright.webkit.config.js`, and this report.
