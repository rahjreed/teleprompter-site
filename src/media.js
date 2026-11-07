export const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const busy = (state) =>
  ["countdown", "recording", "saving"].includes(state);
export function startRecorder(output, Recorder = globalThis.MediaRecorder) {
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
      const recorder = new Recorder(output.stream, {
        ...options,
        ...(mimeType ? { mimeType } : {}),
      });
      // Recorder events are queued, so callers can attach handlers synchronously.
      recorder.start(1000);
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
export async function requestCamera(
  settings,
  devices = navigator.mediaDevices,
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
export function portraitStream(video, source, quality, framing) {
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
  const frameCallbacks = typeof video.requestVideoFrameCallback === "function";
  const manualFrames =
    frameCallbacks &&
    typeof window.CanvasCaptureMediaStreamTrack?.prototype.requestFrame ===
      "function";
  const stream = canvas.captureStream(manualFrames ? 0 : 30);
  const canvasTrack = stream.getVideoTracks()[0];
  source.getAudioTracks().forEach((track) => stream.addTrack(track));
  let frame;
  let previousTime = -1;
  function draw() {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight || video.readyState < 2) return;
    const {
      x,
      y,
      width: cropWidth,
      height: cropHeight,
    } = portraitCrop(sourceWidth, sourceHeight, zoom);
    context.drawImage(video, x, y, cropWidth, cropHeight, 0, 0, width, height);
    if (manualFrames) canvasTrack.requestFrame();
  }
  function next() {
    if (frameCallbacks || video.currentTime !== previousTime) {
      previousTime = video.currentTime;
      draw();
    }
    frame = frameCallbacks
      ? video.requestVideoFrameCallback(next)
      : requestAnimationFrame(next);
  }
  next();
  return {
    stream,
    width,
    height,
    path: "center crop",
    crop,
    cleanup() {
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
  return `${recording.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "Callista recording"}.${recording.blob.type.includes("mp4") ? "mp4" : "webm"}`;
}
