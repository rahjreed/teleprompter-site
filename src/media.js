export const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const busy = (state) =>
  ["countdown", "recording", "saving"].includes(state);
export function startRecorder(output, Recorder = globalThis.MediaRecorder, report = () => {}) {
  if (!Recorder)
    throw new Error(
      "Video recording is not supported. Try current Chrome or Safari.",
    );
  const formats = [
    "video/mp4;codecs=avc1.42E028,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  const options = {
    videoBitsPerSecond: Math.max(
      3_000_000,
      Math.round((12_000_000 * output.width * output.height) / (1080 * 1920)),
    ),
    audioBitsPerSecond: 160_000,
  };
  let lastError;
  for (const mimeType of [
    ...formats.filter((type) => Recorder.isTypeSupported(type)),
    "",
  ]) {
    try {
      report("encoder-attempt", { mimeType: mimeType || "browser-default", width: output.width, height: output.height, ...options });
      const recorder = new Recorder(output.stream, {
        ...options,
        ...(mimeType ? { mimeType } : {}),
      });
      // Recorder events are queued, so callers can attach handlers synchronously.
      report("encoder-created", { mimeType: recorder.mimeType, state: recorder.state });
      report("phase", { name: "encoder-start", time: Date.now() });
      recorder.start(1000);
      report("encoder-started", { mimeType: recorder.mimeType, state: recorder.state });
      return recorder;
    } catch (error) {
      report("error", { stage: "encoder-attempt", message: error.message, name: error.name });
      lastError = error;
    }
  }
  throw lastError;
}
export function mediaError(error) {
  return (
    {
      NotAllowedError:
        "Camera or microphone permission was denied. Allow both in your browser’s site settings, then try again.",
      NotFoundError:
        "No camera or microphone was found. Connect a device and try again.",
      NotReadableError:
        "The camera is busy. Close other apps using it, then try again.",
      OverconstrainedError:
        "This camera cannot use those settings. Try a lower quality or another camera.",
      SecurityError: "Camera access requires HTTPS or localhost.",
    }[error.name] ||
    error.message ||
    "The camera could not start."
  );
}
export async function cameraPermission(permissions = globalThis.navigator?.permissions) {
  const states = await Promise.all(["camera", "microphone"].map(async (name) => {
    try {
      return (await permissions?.query({ name }))?.state;
    } catch {
      return undefined;
    }
  }));
  if (states.includes("denied")) return "denied";
  if (states.includes("prompt")) return "prompt";
  return states.every((state) => state === "granted") ? "granted" : "unknown";
}

export async function requestCamera(
  settings,
  devices = navigator.mediaDevices,
  report = () => {},
) {
  if (!devices?.getUserMedia)
    throw new Error(
      "Camera access needs HTTPS and a supported browser. Use HTTPS or localhost.",
    );
  // Ask for detail without imposing an aspect ratio on the camera sensor.
  // A forced 9:16 track can be a severe digital crop of a native 4:3/16:9 camera.
  const longEdge = Math.round((Number(settings.quality) * 16) / 9);
  const selection = settings.deviceId
    ? { deviceId: { exact: settings.deviceId } }
    : { facingMode: { ideal: settings.facing } };
  const voiceCleanup = settings.microphone === "voice";
  const audio = {
    echoCancellation: { ideal: voiceCleanup },
    noiseSuppression: { ideal: voiceCleanup },
    autoGainControl: { ideal: voiceCleanup },
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
  };
  const frameRate = { ideal: 30, max: 30 };
  try {
    return await resetCameraZoom(
      await devices.getUserMedia({
        audio,
        video: {
          ...selection,
          width: { ideal: longEdge },
          height: { ideal: longEdge },
          resizeMode: { exact: "none" },
          frameRate,
        },
      }),
      report,
    );
  } catch (error) {
    if (error.name !== "OverconstrainedError") throw error;
    return resetCameraZoom(
      await devices.getUserMedia({
        audio,
        video: {
          facingMode: { ideal: settings.facing },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          resizeMode: { ideal: "none" },
          frameRate,
        },
      }),
      report,
    );
  }
}
async function resetCameraZoom(stream, report = () => {}) {
  const track = stream.getVideoTracks?.()[0];
  const { width, height, frameRate, facingMode } = track?.getSettings?.() || {};
  await report("camera-acquired", { width, height, frameRate, facingMode, state: track?.readyState });
  try {
    const zoom = track?.getCapabilities?.().zoom;
    if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max)) {
      const constraints = track.getConstraints?.() || {};
      await report("phase", { name: "camera-zoom-reset", time: Date.now() });
      await track.applyConstraints({
        ...constraints,
        advanced: [
          ...(constraints.advanced || []),
          { zoom: Math.max(zoom.min, Math.min(1, zoom.max)) },
        ],
      });
    }
  } catch {
    // Zoom controls are optional. Keep the usable native stream if unsupported or denied.
  }
  report("phase", { name: "camera-constraints-complete", time: Date.now() });
  return stream;
}
export const framingScale = (framing) => (framing === "close-up" ? 1.2 : 1);

function portraitCrop(width, height, zoom) {
  const cropWidth = Math.min(width, (height * 9) / 16) / zoom;
  const cropHeight = (cropWidth * 16) / 9;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

// Record a compatible native frame directly. Otherwise encode one camera-only crop.
export function portraitStream(video, source, quality, framing, report = () => {}) {
  const sw = video.videoWidth,
    sh = video.videoHeight;
  if (!sw || !sh)
    throw new Error("Camera is warming up. Try recording again in a moment.");
  const zoom = framingScale(framing);
  const crop = portraitCrop(sw, sh, zoom);
  // Prefer Full HD, then HD, then the largest even 9:16 frame the crop supports.
  const available = Math.min(Number(quality), crop.width);
  const width =
    available >= 1080
      ? 1080
      : available >= 720
        ? 720
        : Math.floor(available / 18) * 18;
  const height = (width * 16) / 9;
  if (!width)
    throw new Error("The camera frame is too small for portrait recording.");
  const trackSettings = source.getVideoTracks()[0].getSettings();
  if (
    zoom === 1 &&
    sw * 16 === sh * 9 &&
    sw % 2 === 0 &&
    sh % 2 === 0 &&
    sw <= Number(quality) &&
    (!trackSettings.width || trackSettings.width === sw) &&
    (!trackSettings.height || trackSettings.height === sh)
  ) {
    return {
      stream: source,
      width: sw,
      height: sh,
      path: "native",
      crop,
      cleanup() {},
    };
  }

  const canvas = document.createElement("canvas");
  if (!canvas.captureStream) {
    throw new Error(
      "This browser cannot crop the camera to 9:16. Try Standard framing with a portrait camera, or use a current Chrome or Safari browser.",
    );
  }
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context)
    throw new Error("Could not prepare the portrait recording frame.");
  context.imageSmoothingQuality = "high";
  // Timed capture keeps frame delivery independent of optional requestFrame support.
  const stream = canvas.captureStream(30);
  source.getAudioTracks().forEach((track) => stream.addTrack(track));
  let framesDrawn = 0, cameraCallbacks = 0, timerFallbackDraws = 0;
  let animationFrame, cameraFrame, fallbackTimer;
  let lastDraw = -Infinity, lastDrawAt = null, lastTrigger = null;
  let lastDrivenAt = performance.now();
  let lastCameraCallbackAt = null, cameraMediaTime = null, lastError = null;
  let stopped = false;
  const cameraCallbacksSupported = typeof video.requestVideoFrameCallback === "function";
  function paint(now, trigger) {
    if (stopped || now - lastDraw < 1000 / 30 - 1 || video.readyState < 2) return;
    const sourceWidth = video.videoWidth, sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return;
    try {
      const region = portraitCrop(sourceWidth, sourceHeight, zoom);
      context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, width, height);
      framesDrawn++;
      if (trigger === "timer") timerFallbackDraws++;
      lastDraw = now;
      lastDrawAt = Date.now();
      lastTrigger = trigger;
      lastError = null;
    } catch (error) {
      if (!lastError) report("canvas-error", { name: error.name, message: error.message, time: Date.now() });
      lastError = { name: error.name, message: error.message };
    }
  }
  function delivered(now, metadata) {
    if (stopped) return;
    lastDrivenAt = now;
    cameraCallbacks++;
    lastCameraCallbackAt = Date.now();
    cameraMediaTime = metadata.mediaTime;
    paint(now, "camera-frame");
    cameraFrame = video.requestVideoFrameCallback(delivered);
  }
  function animate(now) {
    if (stopped) return;
    lastDrivenAt = now;
    paint(now, "animation-frame");
    animationFrame = requestAnimationFrame(animate);
  }
  function fallback() {
    if (stopped) return;
    const now = performance.now();
    // Independent of compositor callbacks and video.currentTime reporting.
    if (now - lastDrivenAt >= 100) paint(now, "timer");
    fallbackTimer = setTimeout(fallback, 1000 / 30);
  }
  function contextEvent(event) {
    report("canvas-lifecycle", { event: event.type, time: Date.now() });
  }
  canvas.addEventListener("contextlost", contextEvent);
  canvas.addEventListener("contextrestored", contextEvent);
  paint(performance.now(), "initial");
  if (cameraCallbacksSupported) cameraFrame = video.requestVideoFrameCallback(delivered);
  else animationFrame = requestAnimationFrame(animate);
  fallbackTimer = setTimeout(fallback, 1000 / 30);
  return {
    stream, width, height, path: "center crop", crop,
    get framesDrawn() { return framesDrawn; },
    get drawDiagnostics() {
      return { framesDrawn, cameraCallbacks, timerFallbackDraws, lastDrawAt, lastTrigger,
        lastCameraCallbackAt, cameraMediaTime, lastError,
        contextLost: context.isContextLost?.() ?? null,
        canvasTrackState: stream.getVideoTracks()[0]?.readyState };
    },
    cleanup() {
      if (stopped) return;
      stopped = true;
      if (cameraFrame != null) video.cancelVideoFrameCallback(cameraFrame);
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
      clearTimeout(fallbackTimer);
      canvas.removeEventListener("contextlost", contextEvent);
      canvas.removeEventListener("contextrestored", contextEvent);
      stream.getVideoTracks().forEach(track => track.stop());
      canvas.width = canvas.height = 1;
    },
  };
}
export function inspectRecording(blob) {
  return new Promise((resolve) => {
    const video = document.createElement("video"),
      url = URL.createObjectURL(blob);
    let timer,
      completed = false;
    function done(value) {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      video.onloadeddata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    }
    video.muted = true;
    video.preload = "auto";
    video.onloadeddata = () => {
      let thumbnail = "";
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 180;
        canvas.height = Math.round(
          (180 * video.videoHeight) / video.videoWidth,
        );
        canvas
          .getContext("2d")
          .drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnail = canvas.toDataURL("image/jpeg", 0.7);
      } catch {
        /* Keep footage if thumbnail fails. */
      }
      done({
        width: video.videoWidth,
        height: video.videoHeight,
        thumbnail,
        mediaDuration: Number.isFinite(video.duration)
          ? video.duration
          : undefined,
      });
    };
    video.onerror = () => done({});
    timer = setTimeout(() => done({}), 8000);
    video.src = url;
    video.load();
  });
}
export function fileName(recording) {
  return `${recording.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "Mr Prompterson recording"}.${videoMimeType(recording) === "video/mp4" ? "mp4" : "webm"}`;
}

export function videoMimeType(recording) {
  return /^(?:video|application)\/mp4(?:;|$)/i.test(recording.blob.type || recording.mimeType || "")
    ? "video/mp4"
    : "video/webm";
}
