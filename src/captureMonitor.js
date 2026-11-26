import { previewSnapshot } from "./previewLifecycle.js";
import {
  trackEvidence,
  previewGeometry,
  rawCameraProbe,
} from "./cameraEvidence.js";

export function monitorCapture(
  video,
  source,
  getOutput,
  getRecorder,
  report,
  getEncoder,
  getPreview,
) {
  const cameraSessionId = crypto.randomUUID(),
    track = source.getVideoTracks()[0];
  const raw = rawCameraProbe(
    track,
    new URLSearchParams(location.search).get("rawCameraProbe") === "1",
    report,
  );
  let stopped = false,
    frames = 0,
    callback,
    lastTick = performance.now(),
    lastFrameAt = null,
    mediaTime = null,
    tilt = null,
    previousConfiguration;
  const supported = typeof video.requestVideoFrameCallback === "function";
  function delivered(now, metadata) {
    if (stopped) return;
    frames++;
    lastFrameAt = Date.now();
    mediaTime = metadata.mediaTime;
    callback = video.requestVideoFrameCallback(delivered);
  }
  function sample(reason = "timer") {
    if (stopped) return;
    const now = performance.now(),
      at = Date.now(),
      output = getOutput(),
      recorder = getRecorder(),
      react = getPreview(),
      quality = video.getVideoPlaybackQuality?.();
    const camera = trackEvidence(track),
      geometry = previewGeometry(video);
    const configuration = JSON.stringify({ camera, geometry });
    if (configuration !== previousConfiguration) {
      report("camera-configuration", {
        at,
        cameraSessionId,
        reason,
        camera,
        geometry,
      });
      previousConfiguration = configuration;
    }
    const encoder = getEncoder();
    report("health", {
      at,
      cameraSessionId,
      reason,
      cameraFrames: quality?.totalVideoFrames ?? null,
      cameraCallbacks: supported ? frames : null,
      lastFrameAt,
      cameraTime: video.currentTime,
      cameraMediaTime: mediaTime,
      mainThreadDelayMs: Math.round(Math.max(0, now - lastTick - 1000)),
      raw: raw.snapshot(),
      tilt,
      preview: {
        ...previewSnapshot(video, source),
        reactElementId: react?.elementId,
        cameraState: react?.cameraState,
        cameraInstanceId: react?.cameraInstanceId,
        reactCommits: react?.reactCommits,
      },
      outputPath: output?.path ?? null,
      canvas: output?.drawDiagnostics ?? null,
      canvasFrames: output?.framesDrawn ?? null,
      encoderState: recorder?.state ?? "not-created",
      encoderOutput: recorder ? encoder : null,
      encoderOutputSilenceMs:
        recorder && encoder
          ? at - (encoder.lastOutputAt || encoder.startedAt)
          : null,
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    });
    lastTick = now;
  }
  const lifecycle = (e) => {
    report("capture-lifecycle", {
      at: Date.now(),
      cameraSessionId,
      event: e.type,
      target:
        e.target === video
          ? "visible-preview"
          : e.target === document
            ? "document"
            : e.target.kind || "viewport",
      preview: previewSnapshot(video, source),
    });
    sample(e.type);
  };
  const orientation = (e) => {
    tilt = {
      at: Date.now(),
      beta: e.beta == null ? null : Math.round(e.beta),
      gamma: e.gamma == null ? null : Math.round(e.gamma),
    };
  };
  const listeners = [];
  function listen(target, name, fn) {
    if (!target) return;
    target.addEventListener(name, fn);
    listeners.push(() => target.removeEventListener(name, fn));
  }
  for (const name of [
    "playing",
    "pause",
    "waiting",
    "stalled",
    "resize",
    "emptied",
    "error",
    "ended",
  ])
    listen(video, name, lifecycle);
  for (const t of source.getTracks())
    for (const name of ["mute", "unmute", "ended"]) listen(t, name, lifecycle);
  for (const name of ["visibilitychange", "freeze", "resume"])
    listen(document, name, lifecycle);
  for (const name of ["orientationchange", "pageshow", "pagehide"])
    listen(window, name, lifecycle);
  listen(navigator.mediaDevices, "devicechange", lifecycle);
  listen(window, "resize", lifecycle);
  listen(window, "deviceorientation", orientation);
  listen(screen.orientation, "change", lifecycle);
  listen(globalThis.visualViewport, "resize", lifecycle);
  if (supported) callback = video.requestVideoFrameCallback(delivered);
  report("capture-monitor", {
    at: Date.now(),
    cameraSessionId,
    event: "start",
    raw: raw.snapshot(),
  });
  sample("start");
  const timer = setInterval(() => sample(), 1000);
  return () => {
    if (stopped) return;
    sample("monitor-stop");
    stopped = true;
    clearInterval(timer);
    if (callback != null) video.cancelVideoFrameCallback(callback);
    listeners.forEach((fn) => fn());
    raw.stop();
    report("capture-monitor", {
      at: Date.now(),
      cameraSessionId,
      event: "stop",
    });
  };
}
