// Opt-in observation of the visible camera preview. Never resumes, pauses or replaces media.
// Stream references are tagged with local labels rather than exposing device or track IDs.
export function tracePreviewLifecycle(video, report, getPhase = () => "unknown") {
  const elementId = crypto.randomUUID();
  const streams = new WeakMap();
  let nextStream = 0, stopped = false, lastCall = null;
  let lastStream = video.srcObject, lastPaused = video.paused;
  let lastConnected = video.isConnected, lastLayout = "";
  const restoredMethods = [];

  function streamLabel(stream) {
    if (!stream) return null;
    if (typeof stream !== "object") return typeof stream;
    if (!streams.has(stream)) streams.set(stream, "stream-" + (++nextStream));
    return streams.get(stream);
  }
  function snapshot() {
    let layout = null;
    try {
      const rect = video.getBoundingClientRect?.();
      const css = typeof getComputedStyle === "function" ? getComputedStyle(video) : null;
      layout = { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0),
        display: css?.display ?? null, visibility: css?.visibility ?? null };
    } catch { /* Layout may be unavailable during teardown. */ }
    return {
      at: Date.now(), elementId, phase: getPhase(), connected: Boolean(video.isConnected),
      paused: Boolean(video.paused), ended: Boolean(video.ended), readyState: video.readyState,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
      source: streamLabel(video.srcObject), videoWidth: video.videoWidth,
      videoHeight: video.videoHeight, layout,
      pageVisibility: typeof document === "undefined" ? "unknown" : document.visibilityState,
    };
  }
  function emit(section, details = {}) {
    if (stopped) return;
    try { report(section, { ...snapshot(), ...details }); }
    catch { /* Diagnostics must never block camera playback. */ }
  }
  function stack() {
    // JavaScript call sites only. No script contents, device IDs or recording data.
    try { return (new Error().stack || "").split("\n").slice(2, 9).join("\n").slice(0, 1200); }
    catch { return ""; }
  }
  for (const name of ["play", "pause", "load"]) {
    const original = video[name];
    if (typeof original !== "function") continue;
    const wrapped = function (...args) {
      const call = { action: name, at: Date.now(), elementId, phase: getPhase(), stack: stack() };
      lastCall = call;
      emit("preview-last-playback-call", call);
      let result;
      try { result = original.apply(this, args); }
      catch (error) {
        emit("preview-playback-error", { action: name, error: String(error?.message || error) });
        throw error;
      }
      if (result?.then) {
        // Attach side-effect listeners without changing the Promise returned to the caller.
        result.then(
          () => emit("preview-playback-result", { action: name, outcome: "fulfilled" }),
          error => emit("preview-playback-result", { action: name, outcome: "rejected", error: String(error?.name || error) }),
        );
      }
      return result;
    };
    try {
      video[name] = wrapped;
      if (video[name] === wrapped) restoredMethods.push([name, original, wrapped]);
    } catch { emit("preview-api-hook", { action: name, available: false }); }
  }
  const events = ["play", "playing", "pause", "waiting", "stalled", "suspend",
    "emptied", "loadedmetadata", "canplay", "ended", "error", "resize"];
  const onEvent = event => {
    emit("preview-media-event", { event: event.type,
      lastCallAction: lastCall?.action ?? null, lastCallAt: lastCall?.at ?? null });
    if (event.type === "pause") {
      emit("preview-paused", { trigger: "media-event", lastCall,
        explicitPauseRecently: lastCall?.action === "pause" && Date.now() - lastCall.at < 1500 });
    }
  };
  for (const name of events) video.addEventListener(name, onEvent);
  emit("preview-element", { event: "attached" });

  function poll() {
    if (stopped) return;
    const current = video.srcObject;
    if (current !== lastStream) {
      emit("preview-stream-change", { previousSource: streamLabel(lastStream),
        nextSource: streamLabel(current) });
      lastStream = current;
    }
    if (video.isConnected !== lastConnected) {
      emit("preview-element-connection", { wasConnected: lastConnected });
      lastConnected = video.isConnected;
    }
    if (video.paused !== lastPaused) {
      if (video.paused) emit("preview-paused", { trigger: "sample", lastCall,
        explicitPauseRecently: lastCall?.action === "pause" && Date.now() - lastCall.at < 1500 });
      else emit("preview-resumed", { trigger: "sample", lastCall });
      lastPaused = video.paused;
    }
    const view = snapshot().layout;
    const layout = JSON.stringify(view);
    if (layout !== lastLayout) {
      emit("preview-layout-change");
      lastLayout = layout;
    }
  }
  const interval = setInterval(poll, 500);
  return {
    elementId, snapshot, poll,
    stop() {
      if (stopped) return;
      emit("preview-element", { event: "detached" });
      stopped = true;
      clearInterval(interval);
      for (const name of events) video.removeEventListener(name, onEvent);
      for (const [name, original, wrapped] of restoredMethods) {
        if (video[name] === wrapped) {
          try { video[name] = original; } catch { /* Readonly browser APIs. */ }
        }
      }
    },
  };
}
