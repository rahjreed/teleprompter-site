import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticExport } from "../src/diagnosticExport.js";
import { createDiagnosticJournal } from "../src/diagnosticJournal.js";

test("legacy journal metadata cannot override the exporting application's build", () => {
  const old = { commit: "6cea6f2", version: "1.3" };
  const current = { commit: "e61c4da7", version: "1.3" };
  const saved = {
    build: old,
    browser: "old browser",
    events: [{ section: "page-load", details: { build: old } }],
    health: { samples: [{ cameraFrames: 51, cameraTime: 2.100377 }] },
  };
  const exported = diagnosticExport(saved, {
    build: current,
    browser: "current browser",
    writerId: "exporter",
  });
  assert.deepEqual(exported.build, current);
  assert.equal(exported.browser, "current browser");
  assert.deepEqual(exported.legacyBuild, old);
  assert.deepEqual(exported.evidenceSources[0].build, old);
  assert.equal(
    exported.evidenceSources[1].attribution,
    "unknown legacy evidence",
  );
  assert.equal(exported.health.samples[0].cameraFrames, 51);
  assert.deepEqual(saved.build, old);
});

test("events and frame samples carry their originating build and writer", () => {
  const build = { commit: "new-build" };
  const journal = createDiagnosticJournal({
    storage: null,
    legacyStorage: null,
    build,
  });
  journal.record("health", { cameraFrames: 51 });
  assert.deepEqual(journal.snapshot().events[0].build, build);
  assert.deepEqual(journal.snapshot().health.samples[0].build, build);
  assert.equal(journal.snapshot().health.samples[0].writerId, journal.writerId);
});
