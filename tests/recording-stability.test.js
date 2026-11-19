import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeMp4InBackground } from "../src/mp4Background.js";
import { portraitStream } from "../src/media.js";

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
