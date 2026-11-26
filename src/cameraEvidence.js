// Read-only camera evidence. Device/group IDs are replaced by page-local aliases.
const ids = new Map();
export function sanitizeCapture(value, key = "") {
  if (value == null) return value;
  if (key === "deviceId" || key === "groupId") {
    if (typeof value === "string") {
      const token = `${key}:${value}`;
      if (!ids.has(token)) ids.set(token, `${key}-${ids.size + 1}`);
      return ids.get(token);
    }
    if (Array.isArray(value)) return value.map((v) => sanitizeCapture(v, key));
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeCapture(v, key)]),
    );
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeCapture(v));
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeCapture(v, k)]),
    );
  return value;
}
function read(track, method) {
  try {
    return sanitizeCapture(track?.[method]?.() ?? null);
  } catch (error) {
    return { unavailable: error.name };
  }
}
export function trackEvidence(track) {
  return {
    settings: read(track, "getSettings"),
    constraints: read(track, "getConstraints"),
    capabilities: read(track, "getCapabilities"),
    state: track?.readyState,
    muted: track?.muted,
  };
}
export function previewGeometry(video) {
  const style = getComputedStyle(video),
    box = video.getBoundingClientRect(),
    frame = video.parentElement?.getBoundingClientRect();
  const sw = video.videoWidth,
    sh = video.videoHeight,
    w = video.clientWidth,
    h = video.clientHeight;
  const cover = sw && sh && w && h ? Math.max(w / sw, h / sh) : null;
  return {
    intrinsic: { width: sw, height: sh },
    element: {
      width: w,
      height: h,
      boxWidth: box.width,
      boxHeight: box.height,
    },
    frame: frame ? { width: frame.width, height: frame.height } : null,
    css: {
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      transform: style.transform,
      framingScale: style.getPropertyValue("--framing-scale").trim(),
    },
    coverCrop: cover
      ? {
          x: (sw - w / cover) / 2,
          y: (sh - h / cover) / 2,
          width: w / cover,
          height: h / cover,
        }
      : null,
    viewport: {
      width: innerWidth,
      height: innerHeight,
      visualWidth: globalThis.visualViewport?.width,
      visualHeight: globalThis.visualViewport?.height,
    },
    screenOrientation: {
      type: screen.orientation?.type,
      angle: screen.orientation?.angle ?? window.orientation ?? null,
    },
  };
}

// Separate, explicit opt-in because a second frame consumer can affect a device driver.
// Never transfer or stop the original camera track; every observed VideoFrame is closed.
export function rawCameraProbe(track, enabled, report) {
  const state = {
    enabled,
    status: enabled ? "unavailable" : "disabled",
    frames: 0,
    lastAt: null,
    timestamp: null,
    width: null,
    height: null,
  };
  let clone,
    reader,
    stopped = false;
  if (enabled && typeof globalThis.MediaStreamTrackProcessor === "function") {
    try {
      clone = track.clone();
      reader = new MediaStreamTrackProcessor({
        track: clone,
        maxBufferSize: 1,
      }).readable.getReader();
      state.status = "reading";
      (async () => {
        try {
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            try {
              if (!stopped) {
                state.frames++;
                state.lastAt = Date.now();
                state.timestamp = value.timestamp;
                state.width = value.displayWidth;
                state.height = value.displayHeight;
              }
            } finally {
              value.close();
            }
          }
          if (!stopped) state.status = "ended";
        } catch (error) {
          if (!stopped) {
            state.status = "error";
            state.error = error.name;
            report("raw-probe-error", {
              name: error.name,
              message: error.message,
            });
          }
        }
      })();
    } catch (error) {
      state.status = "unavailable";
      state.error = error.name;
      clone?.stop();
    }
  }
  return {
    snapshot: () => ({ ...state }),
    stop() {
      if (stopped) return;
      stopped = true;
      reader?.cancel().catch(() => {});
      clone?.stop();
      state.status = enabled ? "stopped" : "disabled";
    },
  };
}
