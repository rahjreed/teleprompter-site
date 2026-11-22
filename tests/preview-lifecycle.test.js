import { test } from "node:test";
import assert from "node:assert/strict";
import { tracePreviewLifecycle } from "../src/previewLifecycle.js";

class FakeVideo extends EventTarget {
  constructor() {
    super();
    this.srcObject = null;
    this.paused = true;
    this.ended = false;
    this.isConnected = true;
    this.readyState = 4;
    this.currentTime = 0;
    this.videoWidth = 1080;
    this.videoHeight = 1920;
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
  load() {}
  getBoundingClientRect() { return { width: 320, height: 568 }; }
}

test("preview playback trace captures paused calls, stream changes and phase without changing playback", async () => {
  const video = new FakeVideo(), events = [];
  const originalPause = video.pause;
  let phase = "ready";
  const trace = tracePreviewLifecycle(video, (section, details) => events.push({ section, details }), () => phase);
  const firstId = trace.elementId;
  video.srcObject = {};
  trace.poll();
  await video.play();
  trace.poll();
  phase = "countdown";
  video.pause();
  trace.poll();
  assert.equal(video.paused, true);
  assert.equal(trace.snapshot().elementId, firstId);
  assert.equal(events.find(e => e.section === "preview-stream-change")?.details.nextSource, "stream-1");
  assert.equal(events.find(e => e.section === "preview-last-playback-call" && e.details.action === "pause")?.details.phase, "countdown");
  assert.ok(events.some(e => e.section === "preview-paused" && e.details.explicitPauseRecently));
  trace.stop();
  assert.equal(video.pause, originalPause);
});

test("native preview pause is logged even without a JavaScript pause() call", () => {
  const video = new FakeVideo(), events = [];
  const trace = tracePreviewLifecycle(video, (section, details) => events.push({ section, details }));
  video.paused = false;
  trace.poll();
  video.paused = true;
  video.dispatchEvent(new Event("pause"));
  const pause = events.find(e => e.section === "preview-paused" && e.details.trigger === "media-event");
  assert.ok(pause);
  assert.equal(pause.details.explicitPauseRecently, false);
  trace.stop();
});

test("React-style state updates do not replace the traced video element", () => {
  const video = new FakeVideo(), events = [];
  let phase = "ready";
  const trace = tracePreviewLifecycle(video, (section, details) => events.push({ section, details }), () => phase);
  const id = trace.elementId;
  phase = "countdown";
  trace.poll();
  phase = "recording";
  trace.poll();
  assert.equal(trace.elementId, id);
  assert.equal(events.filter(e => e.section === "preview-element" && e.details.event === "attached").length, 1);
  trace.stop();
  assert.equal(events.filter(e => e.section === "preview-element" && e.details.event === "detached").length, 1);
});
