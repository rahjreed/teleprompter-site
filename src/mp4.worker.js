import { finalizeMp4 } from "./mp4Repair.js";

// A separate worker keeps the camera studio responsive while copying packets.
// The input Blob is immutable; the main thread retains it on any failure.
self.onmessage = async ({ data }) => {
  try {
    const result = await finalizeMp4(data.blob, data.expectedSeconds);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error?.message || "MP4 finalization failed." });
  }
};
