import { test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { list, put, remove, filterScripts } from "../src/storage.js";
import {
  busy,
  fileName,
  formatTime,
  mediaError,
  requestCamera,
  portraitFit,
  startRecorder,
} from "../src/media.js";

test("scripts round-trip through IndexedDB, including edits, tags and deletion", async () => {
  const script = {
    id: "test-script",
    title: "A real idea",
    content: "Persistent words",
    tags: ["Work"],
  };
  await put("scripts", script);
  assert.deepEqual(
    (await list("scripts")).find((s) => s.id === script.id),
    script,
  );
  await put("scripts", { ...script, content: "Edited words" });
  assert.equal(
    (await list("scripts")).find((s) => s.id === script.id).content,
    "Edited words",
  );
  await remove("scripts", script.id);
  assert.equal(
    (await list("scripts")).some((s) => s.id === script.id),
    false,
  );
});
test("search matches title and body and composes with tags", () => {
  const items = [
    { title: "Hello", content: "World", tags: ["Work"] },
    { title: "Elsewhere", content: "Hello again", tags: [] },
  ];
  assert.equal(filterScripts(items, " HELLO ", "").length, 2);
  assert.equal(filterScripts(items, "world", "Work").length, 1);
  assert.equal(filterScripts(items, "world", "Personal").length, 0);
});
test("recording busy states protect navigation", () => {
  for (const state of ["countdown", "recording", "saving"])
    assert.equal(busy(state), true);
  for (const state of ["idle", "ready", "error"])
    assert.equal(busy(state), false);
});
test("recorder prefers MP4, then retries a supported format if the encoder fails", () => {
  const attempts = [];
  class TestRecorder {
    static isTypeSupported(type) {
      return type === "video/mp4" || type === "video/webm;codecs=vp8,opus";
    }
    constructor(stream, options) {
      this.options = options;
      attempts.push(options.mimeType);
    }
    start() {
      if (this.options.mimeType === "video/mp4")
        throw new Error("Encoder busy");
    }
  }
  const output = { width: 1080, height: 1920, stream: {} };
  const recorder = startRecorder(output, TestRecorder);
  assert.deepEqual(attempts, ["video/mp4", "video/webm;codecs=vp8,opus"]);
  assert.equal(recorder.options.videoBitsPerSecond, 12_000_000);
  assert.equal(recorder.options.audioBitsPerSecond, 160_000);
  assert.throws(() => startRecorder(output, null), /not supported/);
});
test("camera requests retain the native field of view and microphone audio", async () => {
  let constraints;
  const result = await requestCamera(
    { quality: "1080", facing: "user" },
    {
      getUserMedia: async (c) => {
        constraints = c;
        return "stream";
      },
    },
  );
  assert.equal(result, "stream");
  assert.equal(constraints.audio.echoCancellation.ideal, false);
  assert.equal(constraints.audio.noiseSuppression.ideal, false);
  assert.equal(constraints.audio.autoGainControl.ideal, false);
  assert.equal(constraints.video.height.ideal, 1920);
  assert.equal(constraints.video.width.ideal, 1920);
  assert.equal(constraints.video.aspectRatio, undefined);
  assert.deepEqual(constraints.video.resizeMode, { exact: "none" });
  assert.equal(constraints.video.facingMode.ideal, "user");
  await requestCamera(
    { quality: "1080", facing: "environment", microphone: "voice" },
    {
      getUserMedia: async (c) => {
        constraints = c;
        return "stream";
      },
    },
  );
  assert.equal(constraints.audio.echoCancellation.ideal, true);
  assert.equal(constraints.audio.noiseSuppression.ideal, true);
  assert.equal(constraints.audio.autoGainControl.ideal, true);
  assert.equal(constraints.video.facingMode.ideal, "environment");
});
test("iPhone front camera prefers uncropped 4:3 sensor dimensions", async () => {
  let constraints;
  await requestCamera(
    { quality: "1080", facing: "user" },
    { getUserMedia: async (next) => { constraints = next; return "stream"; } },
    { preferWideSelfie: true },
  );
  assert.equal(constraints.video.width.ideal, 1920);
  assert.equal(constraints.video.height.ideal, 1440);
  assert.deepEqual(constraints.video.resizeMode, { exact: "none" });
  assert.equal(constraints.video.facingMode.ideal, "user");
  assert.equal(constraints.video.aspectRatio, undefined);
});

test("iPhone front camera fallback still prefers an uncropped 4:3 sensor", async () => {
  let requests = [];
  await requestCamera(
    { quality: "1080", facing: "user" },
    { getUserMedia: async (next) => {
      requests.push(next);
      if (requests.length === 1)
        throw Object.assign(new Error("Unsupported"), { name: "OverconstrainedError" });
      return "stream";
    } },
    { preferWideSelfie: true },
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[1].video.width.ideal, 1280);
  assert.equal(requests[1].video.height.ideal, 960);
});

test("wide selfie portrait fit preserves full frame rather than cutting off sides", () => {
  assert.deepEqual(portraitFit(1080, 1440, 720, 1280), {
    x: 0, y: 160, width: 720, height: 960,
  });
  assert.deepEqual(portraitFit(1080, 1920, 720, 1280), {
    x: 0, y: 0, width: 720, height: 1280,
  });
  const landscape = portraitFit(1920, 1080, 720, 1280);
  assert.equal(landscape.x, 0);
  assert.equal(landscape.y, 437.5);
  assert.equal(landscape.width, 720);
  assert.equal(landscape.height, 405);
});

test("camera zoom resets to 1x when supported and tolerates unsupported zoom", async () => {
  const applied = [];
  const track = {
    getCapabilities: () => ({ zoom: { min: 1, max: 8 } }),
    applyConstraints: async (constraints) => applied.push(constraints),
  };
  const stream = { getVideoTracks: () => [track] };
  assert.equal(
    await requestCamera(
      { quality: "1080", facing: "user" },
      { getUserMedia: async () => stream },
    ),
    stream,
  );
  assert.deepEqual(applied, [{ advanced: [{ zoom: 1 }] }]);
  track.applyConstraints = async () => {
    throw new DOMException("Unsupported", "NotSupportedError");
  };
  assert.equal(
    await requestCamera(
      { quality: "1080", facing: "user" },
      { getUserMedia: async () => stream },
    ),
    stream,
  );
});
test("constraint failure retries lower quality but permission denial does not retry", async () => {
  let calls = 0;
  await requestCamera(
    { quality: "1080", facing: "user" },
    {
      getUserMedia: async () => {
        if (++calls === 1) throw { name: "OverconstrainedError" };
        return {};
      },
    },
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    requestCamera(
      {},
      {
        getUserMedia: async () => {
          calls++;
          throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
        },
      },
    ),
  );
  assert.equal(calls, 1);
  assert.match(
    mediaError({ name: "NotAllowedError" }),
    /permission was denied/,
  );
});
test("filenames use actual container and timers remain readable", () => {
  assert.equal(
    fileName({ title: "Take/one", blob: { type: "video/mp4" } }),
    "Takeone.mp4",
  );
  assert.equal(formatTime(125.9), "02:05");
});
test("recording blobs survive IndexedDB storage", async () => {
  await put("videos", {
    id: "blob-test",
    blob: new Blob(["footage"], { type: "video/webm" }),
  });
  const result = (await list("videos")).find((v) => v.id === "blob-test");
  assert.equal(await result.blob.text(), "footage");
  await remove("videos", result.id);
});

test("production releases are sequential and retries reuse the reserved version", async () => {
  const { planRelease } = await import("../scripts/release-version.mjs");
  const first = planRelease(null, null, null, "first");
  assert.deepEqual(first, { version: "1.4", commit: "first", published: false });
  assert.deepEqual(planRelease(first, first, null, "first"), first);
  assert.throws(() => planRelease(first, null, null, "second"), /pending release/);
  assert.equal(planRelease(first, first, first, "first").published, true);

  const second = planRelease(first, null, first, "second");
  assert.equal(second.version, "1.5");
  assert.deepEqual(planRelease(second, second, first, "second"), second);
  assert.throws(() => planRelease(second, first, second, "first"), /older release/);
  assert.throws(() => planRelease(second, second, { ...second, commit: "wrong" }, "second"), /does not match/);
});

test("iPhone saves a recording through the native file share sheet", async () => {
  const { saveRecordingToDevice, isAppleMobile } = await import("../src/videoSave.js");
  const video = { title: "Hello", blob: new Blob(["video"], { type: "video/mp4" }) };
  const shared = [];
  const nav = {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X)",
    canShare: (data) => data.files[0].type === "video/mp4",
    share: async (data) => { shared.push(data); },
  };
  let anchorClicks = 0;
  const documentRef = {
    createElement: () => ({ style: {}, click: () => anchorClicks++, remove: () => {} }),
    body: { appendChild: () => {} },
  };
  assert.equal(isAppleMobile(nav), true);
  assert.equal(await saveRecordingToDevice(video, { nav, documentRef }), "shared");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].name, "Hello.mp4");
  assert.equal(anchorClicks, 0);
});

test("iPhone canceled save leaves the recording untouched", async () => {
  const { saveRecordingToDevice } = await import("../src/videoSave.js");
  const blob = new Blob(["video"], { type: "video/mp4" });
  const video = { title: "Recording", blob };
  const nav = {
    userAgent: "iPhone",
    canShare: () => true,
    share: async () => { throw Object.assign(new Error("Canceled"), { name: "AbortError" }); },
  };
  assert.equal(await saveRecordingToDevice(video, { nav }), "cancelled");
  assert.equal(video.blob, blob);
});

test("Android keeps the direct-download behavior", async () => {
  const { saveRecordingToDevice } = await import("../src/videoSave.js");
  const video = { title: "Test take", blob: new Blob(["video"], { type: "video/mp4" }) };
  let clicks = 0;
  let downloadedName;
  const anchor = {
    style: {},
    click: () => { clicks++; downloadedName = anchor.download; },
    remove: () => {},
  };
  const nav = { userAgent: "Mozilla/5.0 (Linux; Android 16)" };
  const urlAPI = {
    createObjectURL: () => "blob:video",
    revokeObjectURL: () => {},
  };
  const result = await saveRecordingToDevice(video, {
    nav, urlAPI,
    documentRef: { createElement: () => anchor, body: { appendChild: () => {} } },
    defer: () => {},
  });
  assert.equal(result, "download");
  assert.equal(clicks, 1);
  assert.equal(downloadedName, "Test take.mp4");
});
