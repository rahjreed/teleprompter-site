import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeCapture,
  trackEvidence,
  rawCameraProbe,
} from "../src/cameraEvidence.js";
import { requestCamera } from "../src/media.js";
test("camera evidence aliases device IDs consistently while preserving zoom and constraints", () => {
  const actual = {
    deviceId: "private-device",
    groupId: "private-group",
    zoom: 1.4,
    width: 1920,
    advanced: [{ deviceId: { exact: "private-device" } }],
  };
  const safe = sanitizeCapture(actual);
  assert.equal(safe.advanced[0].deviceId.exact, safe.deviceId);
  assert.equal(safe.zoom, 1.4);
  assert.doesNotMatch(JSON.stringify(safe), /private-/);
  assert.equal(
    trackEvidence({
      getSettings() {
        throw new DOMException("no", "NotSupportedError");
      },
    }).settings.unavailable,
    "NotSupportedError",
  );
});
test("Android retains the production camera request without forced zoom, resolution or audio constraints", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Android SamsungBrowser" },
  });
  try {
    let request;
    const track = {
      getCapabilities() {
        return { zoom: { min: 1, max: 8 } };
      },
      applyConstraints() {
        throw Error("must not reconfigure");
      },
    };
    const stream = { getVideoTracks: () => [track], getAudioTracks: () => [] };
    assert.equal(
      await requestCamera(
        { facing: "user", quality: 1080 },
        {
          async getUserMedia(value) {
            request = value;
            return stream;
          },
        },
      ),
      stream,
    );
    assert.deepEqual(request, { audio: true, video: { facingMode: "user" } });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});
test("raw frame probe closes every frame and stops only its own clone", async () => {
  const original = globalThis.MediaStreamTrackProcessor;
  let framesClosed = 0,
    cloneStopped = 0,
    originalStopped = 0,
    resolve;
  globalThis.MediaStreamTrackProcessor = class {
    constructor() {
      this.readable = {
        getReader: () => ({
          read: () =>
            new Promise((r) => {
              resolve = r;
            }),
          cancel: async () => resolve({ done: true }),
        }),
      };
    }
  };
  try {
    const probe = rawCameraProbe(
      {
        clone: () => ({ stop: () => cloneStopped++ }),
        stop: () => originalStopped++,
      },
      true,
      () => {},
    );
    resolve({
      value: {
        timestamp: 123,
        displayWidth: 1920,
        displayHeight: 1080,
        close: () => framesClosed++,
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(probe.snapshot().frames, 1);
    assert.equal(framesClosed, 1);
    probe.stop();
    probe.stop();
    assert.equal(cloneStopped, 1);
    assert.equal(originalStopped, 0);
  } finally {
    globalThis.MediaStreamTrackProcessor = original;
  }
});
