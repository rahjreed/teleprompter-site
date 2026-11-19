function createWorker() {
  return new Worker(new URL("./mp4.worker.js", import.meta.url), { type: "module" });
}

// Use a fresh worker for each conversion, terminating on success, failure or
// timeout. Never retry a stalled conversion on the camera/UI thread.
export async function finalizeMp4InBackground(
  blob,
  expectedSeconds = null,
  { workerFactory = createWorker, timeoutMs = 45000 } = {},
) {
  if (!/^video\/mp4(?:;|$)/i.test(blob.type))
    return { blob, duration: null, repaired: false };
  return new Promise((resolve, reject) => {
    let worker;
    let timer;
    let settled = false;
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
      }
      if (error) reject(error);
      else resolve(result);
    }
    try {
      worker = workerFactory();
      timer = setTimeout(() => finish(new Error("Video processing timed out. Keep the original and try Repair.")), timeoutMs);
      worker.onmessage = ({ data }) => {
        if (data?.error) finish(new Error(data.error));
        else if (data?.result?.blob?.size && data.result.repaired && Number.isFinite(data.result.duration) && data.result.duration > 0)
          finish(null, data.result);
        else finish(new Error("The video processor returned an invalid result."));
      };
      worker.onerror = (event) => finish(new Error(event.message || "The video processor stopped unexpectedly."));
      worker.onmessageerror = () => finish(new Error("The video processor could not return the file."));
      worker.postMessage({ blob, expectedSeconds });
    } catch (error) {
      finish(error);
    }
  });
}
