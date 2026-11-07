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
  supportedMime,
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
test("MIME negotiation uses browser support and falls back to browser default", () => {
  assert.equal(
    supportedMime({ isTypeSupported: (t) => t === "video/mp4" }),
    "video/mp4",
  );
  assert.equal(supportedMime({ isTypeSupported: () => false }), "");
  assert.throws(() => supportedMime(null), /not supported/);
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
  assert.equal(constraints.audio, true);
  assert.equal(constraints.video.height.ideal, 1920);
  assert.equal(constraints.video.width.ideal, 1920);
  assert.equal(constraints.video.aspectRatio, undefined);
  assert.deepEqual(constraints.video.resizeMode, { exact: 'none' });
  assert.equal(constraints.video.facingMode.ideal, "user");
});
test("camera zoom resets to 1x when supported and tolerates unsupported zoom", async () => {
  const applied = [];
  const track = { getCapabilities: () => ({ zoom: { min: 1, max: 8 } }), applyConstraints: async constraints => applied.push(constraints) };
  const stream = { getVideoTracks: () => [track] };
  assert.equal(await requestCamera({ quality: '1080', facing: 'user' }, { getUserMedia: async () => stream }), stream);
  assert.deepEqual(applied, [{ advanced: [{ zoom: 1 }] }]);
  track.applyConstraints = async () => { throw new DOMException('Unsupported', 'NotSupportedError'); };
  assert.equal(await requestCamera({ quality: '1080', facing: 'user' }, { getUserMedia: async () => stream }), stream);
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
