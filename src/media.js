import { sanitizeCapture, trackEvidence } from "./cameraEvidence.js";
export const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const busy = (state) =>
  ["countdown", "recording", "saving"].includes(state);
export function startRecorder(
  output,
  Recorder = globalThis.MediaRecorder,
  report,
) {
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
      report?.("encoder-attempt", {
        at: Date.now(),
        mimeType,
        width: output.width,
        height: output.height,
        ...options,
      });
      const recorder = new Recorder(output.stream, {
        ...options,
        ...(mimeType ? { mimeType } : {}),
      });
      // Recorder events are queued, so callers can attach handlers synchronously.
      report?.("phase", { at: Date.now(), name: "encoder-start" });
      recorder.start(1000);
      report?.("encoder-started", {
        at: Date.now(),
        state: recorder.state,
        mimeType: recorder.mimeType,
      });
      return recorder;
    } catch (error) {
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

// iOS Safari and iOS Chrome share WebKit camera behavior. Request a 3:4
// source for Zoomed Out instead of the square source used by other presets.
export function isAppleCamera(nav = globalThis.navigator) {
  return /iPhone|iPad|iPod/i.test(nav?.userAgent || "") ||
    (nav?.platform === "MacIntel" && (nav?.maxTouchPoints || 0) > 1);
}

export function wantsIOSThreeFour(settings, nav = globalThis.navigator) {
  return settings?.framing === "zoomed-out" && isAppleCamera(nav);
}

export function zoomedOutCrop(width, height, nav = globalThis.navigator) {
  // Some iPhone camera modes still return 1:1 despite ideal constraints.
  // Preserve a wider 3:4 picture instead of letterboxing the whole square.
  if (isAppleCamera(nav) && width / height > 3 / 4) {
    const cropWidth = (height * 3) / 4;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  return { x: 0, y: 0, width, height };
}

export async function requestCamera(
  settings,
  devices = navigator.mediaDevices,
  report,
) {
  if (!devices?.getUserMedia)
    throw new Error(
      "Camera access needs HTTPS and a supported browser. Use HTTPS or localhost.",
    );
  const acquire = async (constraints) => {
    report?.("camera-request", {
      at: Date.now(),
      constraints: sanitizeCapture(constraints),
    });
    const stream = await devices.getUserMedia(constraints);
    if (report)
      report("camera-acquired", {
        at: Date.now(),
        camera: trackEvidence(stream?.getVideoTracks?.()[0]),
        audio: trackEvidence(stream?.getAudioTracks?.()[0]),
      });
    return stream;
  };
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
  // Match the successful standalone Android camera test exactly.
  if (/Android/i.test(globalThis.navigator?.userAgent || "")) {
    return acquire({
      audio: true,
      video: settings.deviceId
        ? { deviceId: { exact: settings.deviceId } }
        : { facingMode: settings.facing || "user" },
    });
  }
  const frameRate = { ideal: 30, max: 30 };
  const threeFour = wantsIOSThreeFour(settings);
  try {
    return await resetCameraZoom(
      await acquire({
        audio,
        video: {
          ...selection,
          width: { ideal: threeFour ? Math.round(longEdge * 3 / 4) : longEdge },
          height: { ideal: longEdge },
          ...(threeFour ? { aspectRatio: { ideal: 3 / 4 } } : {}),
          resizeMode: { exact: "none" },
          frameRate,
        },
      }),
    );
  } catch (error) {
    if (error.name !== "OverconstrainedError") throw error;
    return resetCameraZoom(
      await acquire({
        audio,
        video: threeFour
          ? {
              ...selection,
              width: { ideal: 960 },
              height: { ideal: 1280 },
              aspectRatio: { ideal: 3 / 4 },
              resizeMode: { ideal: "none" },
              frameRate,
            }
          : {
              facingMode: { ideal: settings.facing },
              width: { ideal: 1280 },
              height: { ideal: 1280 },
              resizeMode: { ideal: "none" },
              frameRate,
            },
      }),
    );
  }
}
async function resetCameraZoom(stream) {
  const track = stream.getVideoTracks?.()[0];
  try {
    const zoom = track?.getCapabilities?.().zoom;
    if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max)) {
      const constraints = track.getConstraints?.() || {};
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
  return stream;
}
export const framingScale = (framing) => (framing === "close-up" ? 1.2 : 1);

// Fit the whole available camera feed inside a portrait frame without
// stretching pixels or asking the camera driver to switch lenses.
export function fitFullCameraFrame(sourceWidth, sourceHeight, width, height) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;
  return {
    x: (width - fittedWidth) / 2,
    y: (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

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
export function portraitStream(video, source, quality, framing, report) {
  const sw = video.videoWidth,
    sh = video.videoHeight;
  if (!sw || !sh)
    throw new Error("Camera is warming up. Try recording again in a moment.");
  const zoom = framingScale(framing);
  const fullView = framing === "zoomed-out";
  const crop = fullView
    ? zoomedOutCrop(sw, sh)
    : portraitCrop(sw, sh, zoom);
  // Keep the existing output resolution rules. A full-view preset changes
  // composition, not the selected video quality or the source camera.
  const available = Math.min(
    Number(quality),
    fullView ? portraitCrop(sw, sh, 1).width : crop.width,
  );
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
  const frameCallbacks = typeof video.requestVideoFrameCallback === "function";
  const manualFrames =
    frameCallbacks &&
    typeof window.CanvasCaptureMediaStreamTrack?.prototype.requestFrame ===
      "function";
  const stream = canvas.captureStream(manualFrames ? 0 : 30);
  const canvasTrack = stream.getVideoTracks()[0];
  source.getAudioTracks().forEach((track) => stream.addTrack(track));
  // RVFC can stop while the video still plays. Keep Android capture moving in
  // that independently reproducible case; this cannot revive a paused camera.
  const android = /Android/i.test(globalThis.navigator?.userAgent || "");
  const rate = Number(trackSettings.frameRate);
  const fallbackRate = Number.isFinite(rate) && rate > 0 ? rate : 30;
  let stopped = false,
    fallbackTimer,
    framesDrawn = 0,
    fallbackDraws = 0,
    lastDrawAt = null;
  let lastPrimaryDraw = performance.now();
  let frame;
  let previousTime = -1;
  function draw(trigger = "primary") {
    if (stopped || (android && video.paused)) return false;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight || video.readyState < 2) return;
    const {
      x,
      y,
      width: cropWidth,
      height: cropHeight,
    } = portraitCrop(sourceWidth, sourceHeight, zoom);
    if (fullView) {
      // The native camera may be wider than 9:16. Preserve its entire field
      // of view and fill the unused portrait space with a neutral border.
      // Use this same composition as the CSS object-fit: contain preview.
      const view = zoomedOutCrop(sourceWidth, sourceHeight);
      const fit = fitFullCameraFrame(view.width, view.height, width, height);
      context.fillStyle = "#141416";
      context.fillRect(0, 0, width, height);
      context.drawImage(
        video,
        view.x, view.y, view.width, view.height,
        fit.x, fit.y, fit.width, fit.height,
      );
    } else {
      context.drawImage(video, x, y, cropWidth, cropHeight, 0, 0, width, height);
    }
    if (manualFrames) canvasTrack.requestFrame();
    framesDrawn++;
    if (trigger === "timer") fallbackDraws++;
    lastDrawAt = Date.now();
    return true;
  }
  function next() {
    if (stopped) return;
    if (frameCallbacks || video.currentTime !== previousTime) {
      previousTime = video.currentTime;
      if (draw()) lastPrimaryDraw = performance.now();
    }
    frame = frameCallbacks
      ? video.requestVideoFrameCallback(next)
      : requestAnimationFrame(next);
  }
  next();
  function fallback() {
    if (stopped) return;
    if (performance.now() - lastPrimaryDraw >= 100) draw("timer");
    fallbackTimer = setTimeout(fallback, 1000 / fallbackRate);
  }
  if (android) fallbackTimer = setTimeout(fallback, 1000 / fallbackRate);
  const contextEvent = (event) =>
    report?.("canvas-lifecycle", { at: Date.now(), event: event.type });
  canvas.addEventListener("contextlost", contextEvent);
  canvas.addEventListener("contextrestored", contextEvent);
  return {
    stream,
    width,
    height,
    path: fullView ? "full view" : "center crop",
    crop,
    get framesDrawn() {
      return framesDrawn;
    },
    get drawDiagnostics() {
      return {
        framesDrawn,
        fallbackDraws,
        lastDrawAt,
        currentCrop: fullView
          ? zoomedOutCrop(video.videoWidth, video.videoHeight)
          : portraitCrop(video.videoWidth, video.videoHeight, zoom),
        fullViewFit: fullView && video.videoWidth && video.videoHeight
          ? (() => {
              const view = zoomedOutCrop(video.videoWidth, video.videoHeight);
              return fitFullCameraFrame(view.width, view.height, width, height);
            })()
          : null,
        width,
        height,
        manualFrames,
        callbackSupported: frameCallbacks,
        fallbackEnabled: android,
        contextLost: context.isContextLost?.() ?? null,
      };
    },
    cleanup() {
      if (stopped) return;
      stopped = true;
      clearTimeout(fallbackTimer);
      canvas.removeEventListener("contextlost", contextEvent);
      canvas.removeEventListener("contextrestored", contextEvent);
      if (frameCallbacks) video.cancelVideoFrameCallback(frame);
      else cancelAnimationFrame(frame);
      stream.getVideoTracks().forEach((track) => track.stop());
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
