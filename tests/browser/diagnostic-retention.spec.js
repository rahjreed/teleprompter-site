import { test, expect } from "@playwright/test";

test("camera startup checkpoint survives a renderer crash and export from a fresh tab", async ({ page, context }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  });
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("prompterson-capture-journal-v3")).phase.name)).toBe("camera-request");
  const cdp = await context.newCDPSession(page);
  const crashed = page.waitForEvent("crash");
  cdp.send("Page.crash").catch(() => {});
  await crashed;
  const recovered = await context.newPage();
  await recovered.goto("/");
  await recovered.getByRole("button", { name: "Settings", exact: true }).click();
  await recovered.getByText("Recording diagnostics", { exact: true }).click();
  const pending = recovered.waitForEvent("download");
  await recovered.getByRole("button", { name: "Download diagnostics" }).click();
  const download = await pending;
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(data.persistence).toBe("localStorage");
  expect(data.events.some(e => e.section === "phase" && e.details.name === "camera-request")).toBe(true);
  expect(data.events.some(e => e.section === "page-load")).toBe(true);
});

test("camera frames and encoder checkpoints persist during a take before Stop", async ({ page }) => {
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled({ timeout: 15000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("prompterson-capture-journal-v3")).health.samples.length)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("prompterson-capture-journal-v3"));
    return saved.health.samples.some(s => s.encoderState === "recording" && s.cameraFrames > 0 && s.canvasFrames > 0);
  })).toBe(true);
  const evidence = await page.evaluate(() => JSON.parse(localStorage.getItem("prompterson-capture-journal-v3")));
  expect(evidence["camera-granted"].cameraTrack).toBeTruthy();
  expect(evidence["encoder-started"].state).toBe("recording");
  expect(evidence.events.some(e => e.section === "encoder-attempt")).toBe(true);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.locator("video.playback")).toBeVisible({ timeout: 20000 });
});

test("journal survives a dedicated browser process crash and profile restart", async ({ browserName }, testInfo) => {
  const { chromium } = await import("@playwright/test");
  const profile = testInfo.outputPath("crash-profile");
  const first = await chromium.launchPersistentContext(profile, {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const tab = await first.newPage();
    await tab.goto("http://127.0.0.1:5187/?recordingDiagnostics=1");
    await expect.poll(() => tab.evaluate(() => JSON.parse(localStorage.getItem("prompterson-capture-journal-v3"))?.performance?.time)).toBeGreaterThan(0);
    // This is a separate browser process, never the runner or the user's browser.
    await tab.getByRole("button", { name: "Open camera", exact: true }).click();
    await tab.getByRole("button", { name: "Enable camera & mic" }).click();
    await expect(tab.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled({ timeout: 15000 });
    await tab.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect(tab.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled({ timeout: 15000 });
    await expect.poll(() => tab.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open("prompterson-capture-diagnostics", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("snapshots", "readonly");
        const read = tx.objectStore("snapshots").get("journal-v3");
        tx.oncomplete = () => {
          db.close();
          resolve(Boolean(read.result?.health?.samples.some(s => s.encoderState === "recording")));
        };
      };
    }))).toBe(true);
    const browser = first.browser();
    const disconnected = new Promise(resolve => browser.once("disconnected", resolve));
    const cdp = await browser.newBrowserCDPSession();
    cdp.send("Browser.crash").catch(() => {});
    await disconnected;
    const second = await chromium.launchPersistentContext(profile);
    try {
      const recovered = await second.newPage();
      await recovered.goto("http://127.0.0.1:5187/?recordingDiagnostics=1");
      await expect.poll(() => recovered.evaluate(async () => {
        const { createDiagnosticJournal } = await import("/src/diagnosticJournal.js");
        const journal = createDiagnosticJournal(); await journal.flush(); return journal.snapshot().events.filter(e => e.section === "page-load").length;
      })).toBeGreaterThanOrEqual(2);
      await recovered.getByRole("button", { name: "Settings", exact: true }).click();
      await recovered.getByText("Recording diagnostics", { exact: true }).click();
      const recoveryDownload = recovered.waitForEvent("download");
      await recovered.getByRole("button", { name: "Download diagnostics" }).click();
      const { readFile } = await import("node:fs/promises");
      const saved = JSON.parse(await readFile(await (await recoveryDownload).path(), "utf8"));
      expect(saved.durability).toBe("strict");
      expect(saved["camera-granted"].cameraTrack).toBeTruthy();
      expect(saved["encoder-started"].state).toBe("recording");
      expect(saved.health.samples.some(s => s.encoderState === "recording")).toBe(true);
      expect(saved.events.filter(e => e.section === "page-load").length).toBeGreaterThanOrEqual(2);
      expect(saved.events.filter(e => e.section === "performance").length).toBeGreaterThanOrEqual(2);
    } finally {
      await second.close();
    }
  } finally {
    await first.close().catch(() => {});
  }
});

test("an idle tab exports another tab's recording evidence", async ({ page, context }) => {
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const camera = await context.newPage();
  await camera.goto("/?recordingDiagnostics=1");
  await camera.getByRole("button", { name: "Open camera", exact: true }).click();
  await camera.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(camera.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled({ timeout: 15000 });
  await camera.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(camera.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled({ timeout: 10000 });
  await camera.waitForTimeout(5000);
  await camera.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(camera.locator("video.playback")).toBeVisible({ timeout: 20000 });
  await camera.close();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Recording diagnostics", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download diagnostics" }).click();
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile(await (await pending).path(), "utf8"));
  expect(exported["encoder-started"].state).toBe("recording");
  expect(exported.capture.cameraTrack).toBeTruthy();
  expect(exported.health.samples.some(s => s.encoderState === "recording" && s.canvasFrames > 0)).toBe(true);
  expect(new Set(exported.events.map(e => e.writerId)).size).toBeGreaterThanOrEqual(2);
});


test("a deliberate preview pause in ready state identifies the visible element and JavaScript caller", async ({ page }) => {
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled({ timeout: 15000 });
  const previous = await page.locator("video.camera-preview").evaluate(video => {
    window.__originalPreviewElement = video;
    return { paused: video.paused, connected: video.isConnected };
  });
  expect(previous.paused).toBe(false);
  expect(previous.connected).toBe(true);
  await page.getByRole("button", { name: "Start scrolling" }).click();
  await expect.poll(() => page.evaluate(() =>
    document.querySelector("video.camera-preview") === window.__originalPreviewElement)).toBe(true);
  await page.evaluate(() => document.querySelector("video.camera-preview").pause());
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("prompterson-capture-journal-v3"))["preview-paused"]?.lastCall?.action)).toBe("pause");
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem("prompterson-capture-journal-v3")));
  const pause = data["preview-paused"];
  expect(pause.phase).toBe("ready");
  expect(pause.connected).toBe(true);
  expect(pause.explicitPauseRecently).toBe(true);
  expect(pause.elementId).toBe(data["preview-last-playback-call"].elementId);
  expect(data["preview-last-playback-call"].stack).toContain("evaluate");
  expect(data["preview-ui-commit"].preview.elementId).toBe(pause.elementId);
  expect(data["encoder-started"]).toBeUndefined();
  expect(data["preview-stream-change"].nextSource).toBeTruthy();
});

test("exported build identity cannot be overwritten by recovered older evidence", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("prompterson-capture-journal-v3", JSON.stringify({
      schema: 3, build: { commit: "old-preview-commit" },
      events: [], health: { samples: [] }, sectionClocks: {},
    }));
  });
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Recording diagnostics", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download diagnostics" }).click();
  const downloaded = await pending;
  const { readFile } = await import("node:fs/promises");
  const evidence = JSON.parse(await readFile(await downloaded.path(), "utf8"));
  expect(evidence.build.commit).not.toBe("old-preview-commit");
  expect(evidence.exportedBy).toEqual(evidence.build);
  expect(evidence.events.some(e => e.section === "page-load")).toBe(true);
});
