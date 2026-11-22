import { test } from "node:test";
import assert from "node:assert/strict";
import { createDiagnosticJournal, diagnosticsRequested, createDiagnosticsExport } from "../src/diagnosticJournal.js";
import { startRecorder } from "../src/media.js";

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
test("diagnostic checkpoints persist before the next render and survive a new journal", () => {
  const disk = storage();
  const first = createDiagnosticJournal({ storage: disk, legacyStorage: null });
  first.record("phase", { name: "encoder-start" });
  const recovered = createDiagnosticJournal({ storage: disk, legacyStorage: null });
  assert.equal(recovered.snapshot().phase.name, "encoder-start");
  recovered.record("page-load", { restarted: true });
  assert.equal(recovered.snapshot().events[0].details.name, "encoder-start");
  for (let n = 0; n < 200; n++) recovered.record("health", { frames: n });
  const final = createDiagnosticJournal({ storage: disk, legacyStorage: null }).snapshot();
  assert.equal(final.events.length, 120);
  assert.equal(final.health.samples.length, 60);
  assert.equal(final.health.samples.at(-1).frames, 199);
});
test("diagnostic opt-in persists without the query and storage failures are explicit", () => {
  const disk = storage();
  assert.equal(diagnosticsRequested("?recordingDiagnostics=1", disk), true);
  assert.equal(diagnosticsRequested("", disk), true);
  assert.equal(diagnosticsRequested("?recordingDiagnostics=0", disk), false);
  const failed = createDiagnosticJournal({ storage: { setItem() { throw Error("quota"); } }, legacyStorage: null });
  assert.match(failed.record("phase", { name: "camera-request" }).persistence, /write failed/);
  assert.equal(failed.snapshot().phase.name, "camera-request");
});
test("encoder-start checkpoint is on disk before MediaRecorder.start executes", () => {
  const disk = storage();
  const journal = createDiagnosticJournal({ storage: disk, legacyStorage: null });
  class Recorder {
    static isTypeSupported(type) { return type === "video/mp4"; }
    constructor() { this.mimeType = "video/mp4"; this.state = "inactive"; }
    start() {
      assert.equal(createDiagnosticJournal({ storage: disk, legacyStorage: null }).snapshot().phase.name, "encoder-start");
      this.state = "recording";
    }
  }
  startRecorder({ width: 1080, height: 1920, stream: {} }, Recorder, journal.record);
  assert.equal(journal.snapshot()["encoder-started"].state, "recording");
});

test("an idle journal cannot overwrite another tab's capture evidence", async () => {
  const disk = storage();
  const idle = createDiagnosticJournal({ storage: disk, legacyStorage: null });
  idle.record("page-load", {});
  const camera = createDiagnosticJournal({ storage: disk, legacyStorage: null });
  camera.record("capture", { cameraTrack: { width: 1920 } });
  camera.record("encoder-started", { state: "recording" });
  idle.record("performance", { time: 3000 });
  const recovered = createDiagnosticJournal({ storage: disk, legacyStorage: null }).snapshot();
  assert.equal(recovered.capture?.cameraTrack.width, 1920);
  assert.equal(recovered["encoder-started"]?.state, "recording");
});

test("a recovered journal cannot mislabel the currently exporting build", () => {
  const historical = { build: { commit: "old-sha", version: "1.3" },
    events: [{ section: "page-load", details: { build: { commit: "old-sha" } } }] };
  const build = { commit: "new-sha", version: "1.3", channel: "preview" };
  const exported = createDiagnosticsExport(historical, build, "Android test browser");
  assert.deepEqual(exported.build, build);
  assert.deepEqual(exported.exportedBy, build);
  assert.equal(exported.events[0].details.build.commit, "old-sha");
  assert.equal(exported.browser, "Android test browser");
});
