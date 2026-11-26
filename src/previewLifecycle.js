// Observe only the camera element; never patch global media prototypes or resume playback.
const elementIds = new WeakMap();
export function previewElementId(video) {
  if (!video) return null;
  if (!elementIds.has(video)) elementIds.set(video, crypto.randomUUID());
  return elementIds.get(video);
}

export function previewSnapshot(video, expectedSource) {
  const stream = video.srcObject;
  return {
    elementId: previewElementId(video),
    role: "visible-camera-preview",
    connected: video.isConnected,
    matchesVisiblePreview: document.querySelector(".camera-preview") === video,
    sourceMatchesCamera: stream === expectedSource,
    streamId: stream?.id ?? null,
    tracks:
      stream
        ?.getTracks?.()
        .map((t) => ({
          id: t.id,
          kind: t.kind,
          state: t.readyState,
          muted: t.muted,
          enabled: t.enabled,
        })) ?? [],
    paused: video.paused,
    ended: video.ended,
    currentTime: video.currentTime,
    readyState: video.readyState,
    networkState: video.networkState,
    muted: video.muted,
    defaultMuted: video.defaultMuted,
    autoplay: video.autoplay,
    playsInline: video.playsInline,
    visibility: document.visibilityState,
    error: video.error
      ? { code: video.error.code, message: video.error.message }
      : null,
  };
}

function descriptorFor(object, property) {
  for (let target = object; target; target = Object.getPrototypeOf(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, property);
    if (descriptor) return descriptor;
  }
}

export function observePreview(
  video,
  { report, getSource, getState, cameraInstanceId },
) {
  const restore = [];
  let stopped = false,
    commits = 0,
    lastState,
    lastOperation = null,
    lastSourceChange = null;
  const snapshot = () => ({
    ...previewSnapshot(video, getSource()),
    cameraState: getState(),
    cameraInstanceId,
    reactCommits: commits,
  });
  const emit = (action, details = {}) => {
    if (stopped) return;
    const at = Date.now();
    if (action.startsWith("call:")) lastOperation = { at, action, ...details };
    if (action === "set:srcObject" || action === "set:src")
      lastSourceChange = { at, action, ...details };
    const entry = { at, action, ...details, preview: snapshot() };
    report("preview-lifecycle", entry);
    // Preserve pause provenance separately when subsequent telemetry ages out the event ring.
    if (action === "event:pause")
      report("preview-pause", { ...entry, lastOperation, lastSourceChange });
  };
  const stack = () =>
    new Error("Preview media operation").stack
      ?.split("\n")
      .slice(2, 10)
      .join("\n");
  function replace(property, descriptor) {
    const own = Object.getOwnPropertyDescriptor(video, property);
    try {
      Object.defineProperty(video, property, {
        configurable: true,
        ...descriptor,
      });
    } catch (error) {
      emit("instrumentation-unavailable", { property, error: error.name });
      return;
    }
    restore.push(() =>
      own
        ? Object.defineProperty(video, property, own)
        : delete video[property],
    );
  }
  for (const method of ["play", "pause", "load"]) {
    const original = video[method];
    replace(method, {
      writable: true,
      value: function (...args) {
        emit(`call:${method}`, { stack: stack() });
        const result = original.apply(this, args);
        if (method === "play")
          result?.then(
            () => emit("play-resolved"),
            (error) =>
              emit("play-rejected", {
                error: { name: error.name, message: error.message },
              }),
          );
        return result;
      },
    });
  }
  for (const property of ["srcObject", "src", "muted", "defaultMuted"]) {
    const descriptor = descriptorFor(video, property);
    if (!descriptor?.get || !descriptor.set) continue;
    replace(property, {
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        emit(`set:${property}`, {
          stack: stack(),
          next:
            property === "srcObject"
              ? { streamId: value?.id ?? null }
              : property === "src"
                ? { present: Boolean(value) }
                : value,
        });
        descriptor.set.call(this, value);
      },
    });
  }
  const names = [
    "loadstart",
    "loadedmetadata",
    "loadeddata",
    "play",
    "playing",
    "pause",
    "waiting",
    "stalled",
    "suspend",
    "emptied",
    "ended",
    "error",
    "volumechange",
    "abort",
  ];
  const event = (e) => emit(`event:${e.type}`, { isTrusted: e.isTrusted });
  for (const name of names) video.addEventListener(name, event);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target === video)
        emit("attribute-change", {
          attribute: record.attributeName,
          oldValue: record.oldValue,
          value: video.getAttribute(record.attributeName),
        });
    }
    const current = snapshot();
    if (
      current.connected !== connected ||
      current.matchesVisiblePreview !== visibleMatch
    ) {
      connected = current.connected;
      visibleMatch = current.matchesVisiblePreview;
      emit("dom-membership-change");
    }
  });
  let connected = video.isConnected,
    visibleMatch = document.querySelector(".camera-preview") === video;
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["src", "muted", "autoplay", "playsinline"],
  });
  emit("ref-attach");
  return {
    snapshot,
    commit(state) {
      commits++;
      if (state !== lastState) {
        lastState = state;
        emit("react-state-commit", { state });
      }
    },
    stop(reason) {
      if (stopped) return;
      emit("ref-detach", { reason });
      stopped = true;
      observer.disconnect();
      for (const name of names) video.removeEventListener(name, event);
      for (const undo of restore.reverse()) undo();
    },
  };
}
