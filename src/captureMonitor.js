// Observe the camera as soon as a stream exists, including encoder startup.
export function monitorCapture(video, source, getOutput, getRecorder, report) {
  const started = performance.now();
  let lastTick = started;
  let previousFrames = 0;
  let previousTime = video.currentTime;
  let lastProgress = started;
  const tracks = source.getTracks();
  const event = (e) => {
    report("track-event", { kind: e.target.kind, event: e.type });
    sample();
  };
  function sample() {
    const now = performance.now();
    const quality = video.getVideoPlaybackQuality?.();
    const frames = quality?.totalVideoFrames ?? null;
    if ((frames != null && frames > previousFrames) || video.currentTime > previousTime) lastProgress = now;
    const recorder = getRecorder();
    const output = getOutput();
    report("health", {
      seconds: Math.round((now - started) / 100) / 10,
      mainThreadDelayMs: Math.round(Math.max(0, now - lastTick - 1000)),
      cameraFrames: frames,
      droppedFrames: quality?.droppedVideoFrames ?? null,
      cameraTime: video.currentTime,
      cameraStallMs: Math.round(now - lastProgress),
      canvasFrames: output?.framesDrawn ?? null,
      encoderState: recorder?.state ?? "not-created",
      videoState: { paused: video.paused, readyState: video.readyState, visibility: document.visibilityState },
      tracks: tracks.map(t => ({ kind: t.kind, state: t.readyState, muted: t.muted, enabled: t.enabled })),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    });
    previousFrames = frames ?? 0;
    previousTime = video.currentTime;
    lastTick = now;
  }
  for (const track of tracks) {
    for (const name of ["mute", "unmute", "ended"]) track.addEventListener(name, event);
  }
  sample();
  const timer = setInterval(sample, 1000);
  return () => {
    clearInterval(timer);
    sample();
    for (const track of tracks) {
      for (const name of ["mute", "unmute", "ended"]) track.removeEventListener(name, event);
    }
  };
}
