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
  const width = Number(settings.quality),
    height = Math.round((width * 16) / 9);
  const selection = settings.deviceId
    ? { deviceId: { exact: settings.deviceId } }
    : { facingMode: { ideal: settings.facing } };
  try {
    return await devices.getUserMedia({
      audio: true,
      video: {
        ...selection,
        width: { ideal: width },
        height: { ideal: height },
        aspectRatio: { ideal: 9 / 16 },
        frameRate: { ideal: 30, max: 30 },
      },
    });
  } catch (error) {
    if (error.name !== "OverconstrainedError") throw error;
    return devices.getUserMedia({
      audio: true,
      video: {
        facingMode: { ideal: settings.facing },
        width: { ideal: 720 },
        height: { ideal: 1280 },
      },
    });
  }
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
    sh,
    Math.floor((sw * 16) / 9),
  );
  canvas.height = Math.floor(height / 16) * 16;
  canvas.width = (canvas.height * 9) / 16;
  const context = canvas.getContext("2d", { alpha: false });
  const cropW = Math.min(sw, (sh * 9) / 16),
    cropH = (cropW * 16) / 9;
  let frame,
    last = 0;
  function draw(time) {
    if (time - last >= 1000 / 30 || !last) {
      context.drawImage(
        video,
        (sw - cropW) / 2,
        (sh - cropH) / 2,
        cropW,
        cropH,
        0,
        0,
        canvas.width,
        canvas.height,
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
