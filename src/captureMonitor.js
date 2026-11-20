// Opt-in, local-only telemetry. No media, device IDs or uploaded data.
export function monitorCapture(video, source, output, recorder, report) {
  const started = performance.now();
  let lastTick = started;
  let previousFrames = 0;
  let previousTime = video.currentTime;
  let lastProgress = started;
  let bytes = 0;
  let chunks = 0;
  let lastChunk = started;
  const samples = [];
  const events = [];
  const tracks = source.getTracks();
  const event = (e) => {
    events.push({ seconds: (performance.now() - started) / 1000, kind: e.target.kind, event: e.type });
    if (events.length > 40) events.shift();
  };
  for (const track of tracks) {
    for (const name of ["mute", "unmute", "ended"]) track.addEventListener(name, event);
  }
  const data = (e) => {
    if (e.data.size) {
      chunks++;
      bytes += e.data.size;
      lastChunk = performance.now();
    }
  };
  recorder.addEventListener("dataavailable", data);
  const timer = setInterval(() => {
    const now = performance.now();
    const quality = video.getVideoPlaybackQuality?.();
    const frames = quality?.totalVideoFrames ?? null;
    if ((frames != null && frames > previousFrames) || video.currentTime > previousTime) lastProgress = now;
    samples.push({
      seconds: Math.round((now - started) / 100) / 10,
      mainThreadDelayMs: Math.round(Math.max(0, now - lastTick - 1000)),
      cameraFrames: frames,
      droppedFrames: quality?.droppedVideoFrames ?? null,
      cameraTime: video.currentTime,
      cameraStallMs: Math.round(now - lastProgress),
      canvasFrames: output.framesDrawn ?? null,
      encoderState: recorder.state,
      chunks, bytes,
      chunkSilenceMs: Math.round(now - lastChunk),
      videoState: { paused: video.paused, readyState: video.readyState, visibility: document.visibilityState },
      tracks: tracks.map(t => ({ kind: t.kind, state: t.readyState, muted: t.muted, enabled: t.enabled })),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    });
    if (samples.length > 120) samples.shift();
    previousFrames = frames ?? 0;
    previousTime = video.currentTime;
    lastTick = now;
    report({ samples: [...samples], events: [...events] });
  }, 1000);
  return () => {
    clearInterval(timer);
    recorder.removeEventListener("dataavailable", data);
    for (const track of tracks) {
      for (const name of ["mute", "unmute", "ended"]) track.removeEventListener(name, event);
    }
  };
}
