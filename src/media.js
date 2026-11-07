export const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const busy = (state) =>
  ["countdown", "recording", "saving"].includes(state);
export function supportedMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder)
    throw new Error(
      "Video recording is not supported. Try current Chrome or Safari.",
    );
  return (
    [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/mp4",
      "video/webm",
    ].find((type) => Recorder.isTypeSupported(type)) || ""
  );
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
  try {
    return await resetCameraZoom(await devices.getUserMedia({
      audio: true,
      video: {
        ...selection,
        width: { ideal: longEdge },
        height: { ideal: longEdge },
        resizeMode: { exact: "none" },
        frameRate: { ideal: 30, max: 30 },
      },
    }));
  } catch (error) {
    if (error.name !== "OverconstrainedError") throw error;
    return resetCameraZoom(await devices.getUserMedia({
      audio: true,
      video: {
        facingMode: { ideal: settings.facing },
        width: { ideal: 1280 },
        height: { ideal: 1280 },
        resizeMode: { ideal: "none" },
      },
    }));
  }
}
async function resetCameraZoom(stream) {
  const track = stream.getVideoTracks?.()[0];
  try {
    const zoom = track?.getCapabilities?.().zoom;
    if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max)) {
      await track.applyConstraints({ advanced: [{ zoom: Math.max(zoom.min, Math.min(1, zoom.max)) }] });
    }
  } catch {
    // Zoom controls are optional. Keep the usable native stream if unsupported or denied.
  }
  return stream;
}
// Draw only camera pixels, with no CSS mirroring, text, or interface controls.
export function portraitStream(video, source, quality) {
  const sw = video.videoWidth,
    sh = video.videoHeight;
  if (!sw || !sh)
    throw new Error("Camera is warming up. Try recording again in a moment.");
  const canvas = document.createElement("canvas");
  if (!canvas.captureStream)
    return { stream: source, cleanup() {}, width: sw, height: sh };
  const height = Math.min(
    Math.round((Number(quality) * 16) / 9),
    Math.max(sh, Math.floor((sw * 16) / 9)),
  );
  // Even dimensions keep H.264 encoders compatible at fallback resolutions.
  canvas.height = Math.floor(height / 32) * 32;
  canvas.width = (canvas.height * 9) / 16;
  const context = canvas.getContext("2d", { alpha: false });
  let frame,
    last = 0;
  function draw(time) {
    if (time - last >= 1000 / 30 || !last) {
      // Fit the entire camera frame into the portrait export, rather than zooming
      // into its center. Recompute for cameras that rotate their native stream.
      const sourceWidth = video.videoWidth || sw, sourceHeight = video.videoHeight || sh;
      const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
      const width = sourceWidth * scale, height = sourceHeight * scale;
      context.fillStyle = "#000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        video,
        0,
        0,
        sourceWidth,
        sourceHeight,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      );
      last = time;
    }
    frame = requestAnimationFrame(draw);
  }
  draw(0);
  const stream = canvas.captureStream(30);
  source.getAudioTracks().forEach((track) => stream.addTrack(track));
  return {
    stream,
    width: canvas.width,
    height: canvas.height,
    cleanup() {
      cancelAnimationFrame(frame);
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
      done({ width: video.videoWidth, height: video.videoHeight, thumbnail });
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
