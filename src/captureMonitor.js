// Counters are updated per frame; journal writes happen once per second or at lifecycle boundaries.
export function monitorCapture(video, source, getOutput, getRecorder, report, getEncoderProgress = () => null) {
  const started = performance.now();
  const cameraSessionId = crypto.randomUUID();
  let lastTick = started, lastProgress = started, previousFrames = 0, previousCallbacks = 0;
  let callbackCount = 0, callbackId, lastCallbackAt = null, mediaTime = null;
  let stopped = false;
  const hasCallbacks = typeof video.requestVideoFrameCallback === "function";
  const tracks = source.getTracks();
  function delivered(now, metadata) {
    if (stopped) return;
    callbackCount++;
    lastCallbackAt = Date.now();
    mediaTime = metadata.mediaTime;
    callbackId = video.requestVideoFrameCallback(delivered);
  }
  function sample() {
    const now = performance.now(), epoch = Date.now();
    const quality = video.getVideoPlaybackQuality?.();
    const frames = quality?.totalVideoFrames ?? null;
    if ((frames != null && frames > previousFrames) || callbackCount > previousCallbacks) lastProgress = now;
    const recorder = getRecorder(), output = getOutput();
    const encoder = getEncoderProgress();
    const canvas = output?.drawDiagnostics ?? null;
    report("health", {
      at: epoch, cameraSessionId, seconds: Math.round((now - started) / 100) / 10,
      mainThreadDelayMs: Math.round(Math.max(0, now - lastTick - 1000)),
      cameraFrames: frames, cameraCallbacks: hasCallbacks ? callbackCount : null,
      cameraCallbackAt: lastCallbackAt, cameraMediaTime: mediaTime,
      droppedFrames: quality?.droppedVideoFrames ?? null,
      cameraTime: video.currentTime,
      cameraStallMs: frames != null || hasCallbacks ? Math.round(now - lastProgress) : null,
      canvasFrames: output?.framesDrawn ?? null, canvas,
      canvasStallMs: canvas?.lastDrawAt ? epoch - canvas.lastDrawAt : null,
      encoderState: recorder?.state ?? "not-created",
      encoderOutput: recorder ? encoder : null,
      encoderOutputSilenceMs: recorder && encoder ? epoch - (encoder.lastOutputAt || encoder.startedAt) : null,
      videoState: { paused: video.paused, readyState: video.readyState, visibility: document.visibilityState },
      tracks: tracks.map(t => ({ kind: t.kind, state: t.readyState, muted: t.muted, enabled: t.enabled })),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    });
    previousFrames = frames ?? 0;
    previousCallbacks = callbackCount;
    lastTick = now;
  }
  const trackEvent = e => {
    report("track-event", { at: Date.now(), cameraSessionId, kind: e.target.kind, event: e.type });
    sample();
  };
  const videoEvent = e => {
    report("video-lifecycle", { at: Date.now(), cameraSessionId, event: e.type, paused: video.paused, readyState: video.readyState });
    sample();
  };
  const videoEvents = ["playing", "pause", "waiting", "stalled", "suspend", "resize", "emptied", "error"];
  for (const track of tracks) for (const name of ["mute", "unmute", "ended"]) track.addEventListener(name, trackEvent);
  for (const name of videoEvents) video.addEventListener(name, videoEvent);
  if (hasCallbacks) callbackId = video.requestVideoFrameCallback(delivered);
  sample();
  const timer = setInterval(sample, 1000);
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (callbackId != null) video.cancelVideoFrameCallback(callbackId);
    sample();
    for (const track of tracks) for (const name of ["mute", "unmute", "ended"]) track.removeEventListener(name, trackEvent);
    for (const name of videoEvents) video.removeEventListener(name, videoEvent);
  };
}
