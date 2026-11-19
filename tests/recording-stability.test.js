import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeMp4InBackground } from "../src/mp4Background.js";
import { portraitStream, requestCamera } from "../src/media.js";

function mockWorker(reply) {
  return {
    terminated: false,
    postMessage(data) {
      this.sent = data;
      if (reply) queueMicrotask(() => reply(this, data));
    },
    terminate() { this.terminated = true; },
  };
}
const original = new Blob(["original"], { type: "video/mp4" });
test("background finalizer passes the complete Blob and terminates on success", async () => {
  const result = { blob: new Blob(["fixed"], { type: "video/mp4" }), duration: 40, repaired: true };
  const worker = mockWorker(w => w.onmessage({ data: { result } }));
  assert.deepEqual(await finalizeMp4InBackground(original, 40, { workerFactory: () => worker }), result);
  assert.equal(worker.sent.blob, original);
  assert.equal(worker.sent.expectedSeconds, 40);
  assert.equal(worker.terminated, true);
  assert.equal(await original.text(), "original");
});
test("stalled worker times out and releases memory without changing original", async () => {
  const worker = mockWorker();
  await assert.rejects(finalizeMp4InBackground(original, 40, { workerFactory: () => worker, timeoutMs: 20 }), /timed out/);
  assert.equal(worker.terminated, true);
  assert.equal(await original.text(), "original");
});
test("worker failure rejects instead of restarting conversion on the UI thread", async () => {
  const worker = mockWorker(w => w.onerror({ message: "worker failed" }));
  await assert.rejects(finalizeMp4InBackground(original, 40, { workerFactory: () => worker }), /worker failed/);
  assert.equal(worker.terminated, true);
});
test("non-MP4 skips the worker", async () => {
  const blob = new Blob(["webm"], { type: "video/webm" });
  assert.deepEqual(await finalizeMp4InBackground(blob, 40, { workerFactory: () => { throw Error("unused"); } }), { blob, duration: null, repaired: false });
});
test("cropped camera uses a timed 30fps canvas, keeps audio and releases capture surface", () => {
  const previousDocument = globalThis.document;
  let rate, frame, cancelled, stopped = false;
  const audio = { kind: "audio" };
  const added = [], drawings = [];
  const canvas = {
    getContext: () => ({ drawImage: (...args) => drawings.push(args) }),
    captureStream: fps => {
      rate = fps;
      return {
        getVideoTracks: () => [{ stop() { stopped = true; } }],
        addTrack: track => added.push(track),
      };
    },
  };
  const video = {
    videoWidth: 1080, videoHeight: 1440, readyState: 4,
    requestVideoFrameCallback: cb => { frame = cb; return 12; },
    cancelVideoFrameCallback: id => { cancelled = id; },
  };
  const source = {
    getVideoTracks: () => [{ getSettings: () => ({ width: 1080, height: 1440 }) }],
    getAudioTracks: () => [audio],
  };
  globalThis.document = { createElement: () => canvas };
  try {
    const take = portraitStream(video, source, "1080", "standard");
    assert.equal(rate, 30);
    assert.equal(take.width, 720);
    assert.equal(take.height, 1280);
    assert.deepEqual(added, [audio]);
    frame();
    assert.deepEqual(drawings[0], [video, 135, 0, 810, 1440, 0, 0, 720, 1280]);
    take.cleanup();
    assert.equal(cancelled, 12);
    assert.equal(stopped, true);
    assert.equal(canvas.width, 1);
    assert.equal(canvas.height, 1);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("Android Standard requests direct portrait capture with audio and avoids canvas for matching frames", async () => {
  const mic = { kind: "audio" };
  const source = {
    getVideoTracks: () => [{ getSettings: () => ({ width: 1080, height: 1920 }) }],
    getAudioTracks: () => [mic],
  };
  const requests = [];
  const devices = { getUserMedia: async c => { requests.push(c); return source; } };
  const result = await requestCamera(
    { quality: "1080", facing: "user", framing: "standard" },
    devices, { userAgent: "Mozilla/5.0 (Linux; Android 17)" },
  );
  assert.equal(result, source);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].video.width, { exact: 1080 });
  assert.deepEqual(requests[0].video.height, { exact: 1920 });
  assert.ok(requests[0].audio);
  const take = portraitStream({ videoWidth: 1080, videoHeight: 1920 }, source, "1080", "standard");
  assert.equal(take.path, "native");
  assert.equal(take.stream, source);
  assert.deepEqual(take.stream.getAudioTracks(), [mic]);
});

test("Android attempts native HD if native Full HD is unavailable", async () => {
  const requests = [];
  const stream = {};
  const devices = { getUserMedia: async c => {
    requests.push(c);
    if (requests.length === 1) throw Object.assign(new Error("camera mode unavailable"), { name: "OverconstrainedError" });
    return stream;
  } };
  assert.equal(await requestCamera({ quality: "1080", framing: "standard" }, devices, { userAgent: "Android" }), stream);
  assert.deepEqual(requests.map(c => c.video.width.exact), [1080, 720]);
  assert.deepEqual(requests.map(c => c.video.height.exact), [1920, 1280]);
});

test("Android falls back to original camera constraints if both portrait modes are unavailable", async () => {
  const requests = [];
  const stream = {};
  const devices = { getUserMedia: async c => {
    requests.push(c);
    if (requests.length < 3) throw Object.assign(new Error("camera mode unavailable"), { name: "OverconstrainedError" });
    return stream;
  } };
  assert.equal(await requestCamera({ quality: "1080", framing: "standard" }, devices, { userAgent: "Android" }), stream);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2].video.resizeMode, { exact: "none" });
});

test("Android denial is not retried; iPhone and Close-Up keep original capture constraints", async () => {
  let attempts = 0;
  await assert.rejects(requestCamera({ quality: "1080" }, { getUserMedia: async () => {
    attempts++;
    throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
  } }, { userAgent: "Android" }), /denied/);
  assert.equal(attempts, 1);
  for (const [userAgent, framing] of [["iPhone", "standard"], ["Android", "close-up"]]) {
    await requestCamera({ quality: "1080", framing }, { getUserMedia: async c => {
      assert.deepEqual(c.video.width, { ideal: 1920 });
      assert.deepEqual(c.video.resizeMode, { exact: "none" });
      return {};
    } }, { userAgent });
  }
});
