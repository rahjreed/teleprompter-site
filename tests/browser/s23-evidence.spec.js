import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const KEY = "prompterson-capture-journal-v4";
test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; SM-S916U) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36",
});
async function open(page) {
  await page.goto("/?recordingDiagnostics=1&rawCameraProbe=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
}
async function journal(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}
async function exportAfterHome(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Recording diagnostics", { exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download diagnostics" }).click();
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}
test("portrait tilt leaves app crop stable; changed camera zoom is recorded independently", async ({
  page,
}) => {
  await open(page);
  await page.waitForTimeout(2000);
  const before = await journal(page);
  const initial = before["camera-configuration"];
  await page.locator(".camera-preview").evaluate((video) => {
    const track = video.srcObject.getVideoTracks()[0],
      settings = track.getSettings.bind(track);
    track.getSettings = () => ({ ...settings(), zoom: 1.4 });
    window.dispatchEvent(
      new DeviceOrientationEvent("deviceorientation", { beta: 45, gamma: 15 }),
    );
  });
  await expect
    .poll(
      async () =>
        (await journal(page))["camera-configuration"].camera.settings.zoom,
    )
    .toBe(1.4);
  const after = await journal(page),
    last = after.health.samples.at(-1);
  expect(after["camera-configuration"].geometry).toEqual(initial.geometry);
  expect(last.tilt.beta).toBe(45);
  expect(
    after.events.filter((e) => e.section === "camera-request"),
  ).toHaveLength(1);
  expect(last.preview.matchesVisiblePreview).toBe(true);
  expect(last.preview.elementId).toBe(last.preview.reactElementId);
  await writeFile(
    test.info().outputPath("tilt.json"),
    JSON.stringify(after, null, 2),
  );
});
test("paused visible preview is identified with live track and advancing independent raw frames; no automatic replay", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(2500);
  await page.locator(".camera-preview").evaluate((video) => video.pause());
  await page.waitForTimeout(2500);
  const paused = await journal(page),
    last = paused.health.samples.at(-1),
    prior = paused.health.samples.findLast(
      (s) => !s.preview.paused && s.encoderState === "recording",
    );
  expect(last.preview.paused).toBe(true);
  expect(last.preview.matchesVisiblePreview).toBe(true);
  expect(last.preview.sourceMatchesCamera).toBe(true);
  expect(last.preview.elementId).toBe(last.preview.reactElementId);
  expect(last.preview.tracks.every((t) => t.state === "live")).toBe(true);
  expect(last.preview.currentTime).toBeCloseTo(
    paused["preview-pause"].preview.currentTime,
    1,
  );
  expect(paused["preview-pause"].lastOperation.action).toBe("call:pause");
  expect(paused["preview-pause"].lastOperation.stack).toContain("evaluate");
  if (last.raw.status === "reading") {
    expect(last.raw.frames).toBeGreaterThan(prior.raw.frames + 10);
  } else expect(last.raw.status).toBe("unavailable");
  const pauseAt = paused["preview-pause"].at;
  expect(
    paused.events.filter(
      (e) =>
        e.section === "preview-lifecycle" &&
        e.details.action === "call:play" &&
        e.details.at > pauseAt,
    ),
  ).toHaveLength(0);
  await writeFile(
    test.info().outputPath("paused-preview.json"),
    JSON.stringify(paused, null, 2),
  );
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.locator("video.playback")).toBeVisible({ timeout: 20000 });
});
test("already paused preview cannot start an Android encoder", async ({
  page,
}) => {
  await open(page);
  await page.locator(".camera-preview").evaluate((v) => v.pause());
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera preview is not playing",
  );
  expect((await journal(page))["encoder-started"]).toBeUndefined();
});
test("track interruption keeps available footage and records lifecycle evidence", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(2500);
  await page.locator(".camera-preview").evaluate((v) => {
    const t = v.srcObject.getVideoTracks()[0];
    t.stop();
    t.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator("video.playback")).toBeVisible({ timeout: 20000 });
  expect(
    (await journal(page)).events.some(
      (e) => e.section === "capture-lifecycle" && e.details.event === "ended",
    ),
  ).toBe(true);
});
test("recording checkpoints survive renderer crash and fresh-page export with matching build identity", async ({
  page,
  context,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(
      async () =>
        (await journal(page)).health.samples.some(
          (s) => s.encoderState === "recording" && s.encoderOutput.bytes > 0,
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  const before = await journal(page);
  const cdp = await context.newCDPSession(page),
    crash = page.waitForEvent("crash");
  cdp.send("Page.crash").catch(() => {});
  await crash;
  const fresh = await context.newPage();
  await fresh.goto("/");
  const saved = await exportAfterHome(fresh);
  expect(
    saved.health.samples.some(
      (s) => s.encoderState === "recording" && s.canvasFrames > 0,
    ),
  ).toBe(true);
  expect(saved.events.some((e) => e.id === before.events.at(-1).id)).toBe(true);
  expect(saved.exporter.build.commit).toBe(saved.build.commit);
  expect(
    saved.evidenceSources.every((s) => s.build?.commit === saved.build.commit),
  ).toBe(true);
  await writeFile(
    test.info().outputPath("recovered.json"),
    JSON.stringify(saved, null, 2),
  );
});

test("strict IndexedDB recording checkpoints survive a dedicated browser process crash", async ({}, testInfo) => {
  test.setTimeout(75000);
  const { chromium } = await import("@playwright/test");
  const profile = testInfo.outputPath("isolated-crash-profile");
  const baseURL = testInfo.project.use.baseURL;
  const first = await chromium.launchPersistentContext(profile, {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const tab = await first.newPage();
    await tab.goto(new URL("/?recordingDiagnostics=1", baseURL).href);
    await tab.getByRole("button", { name: "Settings", exact: true }).click();
    await tab.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
    await tab.getByRole("button", { name: "Close dialog" }).click();
    await tab.getByRole("button", { name: "Open camera", exact: true }).click();
    await tab.getByRole("button", { name: "Enable camera & mic" }).click();
    await expect(
      tab.getByRole("button", { name: "Start recording", exact: true }),
    ).toBeEnabled();
    await tab
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    await expect
      .poll(
        () =>
          tab.evaluate(
            () =>
              new Promise((resolve) => {
                const open = indexedDB.open(
                  "prompterson-capture-diagnostics",
                  1,
                );
                open.onsuccess = () => {
                  const db = open.result,
                    tx = db.transaction("snapshots", "readonly"),
                    read = tx.objectStore("snapshots").get("journal-v4");
                  tx.oncomplete = () => {
                    db.close();
                    resolve(
                      read.result?.health.samples.some(
                        (s) =>
                          s.encoderState === "recording" && s.canvasFrames > 0,
                      ),
                    );
                  };
                };
              }),
          ),
        { timeout: 15000 },
      )
      .toBe(true);
    console.info("process-crash: durable camera evidence committed");
    const browser = first.browser(),
      cdp = await browser.newBrowserCDPSession();
    cdp.send("Browser.crash").catch(() => {});
    await expect
      .poll(() => browser.isConnected(), { timeout: 10000 })
      .toBe(false);
    console.info("process-crash: browser disconnected");
    const second = await chromium.launchPersistentContext(profile, {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    });
    try {
      console.info("process-crash: profile reopened");
      const fresh = await second.newPage();
      console.info("process-crash: fresh page created");
      await fresh.goto(baseURL, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      console.info("process-crash: app loaded");
      const saved = await fresh.evaluate(async () => {
        const { createDiagnosticJournal } =
          await import("/src/diagnosticJournal.js");
        const journal = createDiagnosticJournal();
        await journal.flush();
        const recovered = journal
          .snapshot()
          .health.samples.some(
            (s) => s.encoderState === "recording" && s.canvasFrames > 0,
          );
        journal.record("recovery-checkpoint", { recovered });
        await journal.flush();
        return journal.snapshot();
      });
      expect(saved["recovery-checkpoint"].recovered).toBe(true);
      expect(saved.durability).toBe("strict");
      expect(
        saved.health.samples.some(
          (s) => s.encoderState === "recording" && s.canvasFrames > 0,
        ),
      ).toBe(true);
      await writeFile(
        testInfo.outputPath("process-crash-recovery.json"),
        JSON.stringify(saved, null, 2),
      );
    } finally {
      await second.close();
    }
  } finally {
    if (first.browser()?.isConnected()) await first.close().catch(() => {});
  }
});

test("intrinsic dimension changes are distinguished from CSS framing changes", async ({
  page,
}) => {
  await open(page);
  await page.waitForTimeout(1200);
  const initial = (await journal(page))["camera-configuration"];
  await page.locator(".camera-preview").evaluate((video) => {
    Object.defineProperty(video, "videoWidth", {
      configurable: true,
      value: 1280,
    });
    video.dispatchEvent(new Event("resize"));
  });
  const changed = (await journal(page))["camera-configuration"];
  expect(changed.geometry.intrinsic.width).toBe(1280);
  expect(changed.geometry.css).toEqual(initial.geometry.css);
  expect(changed.geometry.coverCrop).not.toEqual(initial.geometry.coverCrop);
  expect(changed.camera.settings).toEqual(initial.camera.settings);
});

test("Android consecutive takes acquire fresh live sessions and playback X releases them to Home", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  await page.context().grantPermissions(["camera", "microphone"]);
  for (let take = 0; take < 3; take++) {
    await expect(
      page.getByRole("button", { name: "Start recording", exact: true }),
    ).toBeEnabled();
    await page.locator(".camera-preview").evaluate((v) => {
      window.previousTakeStream = v.srcObject;
      window.previousTakeElement = v;
    });
    await page
      .getByRole("button", { name: "Start recording", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stop recording", exact: true }),
    ).toBeEnabled();
    await page.waitForTimeout(2000);
    await page
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await expect(page.locator("video.playback")).toBeVisible({
      timeout: 15000,
    });
    if (take < 2) {
      await page
        .getByRole("button", { name: "Record Again", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Start recording", exact: true }),
      ).toBeEnabled();
      expect(
        await page
          .locator(".camera-preview")
          .evaluate((v) => ({
            fresh:
              v !== window.previousTakeElement &&
              v.srcObject !== window.previousTakeStream,
            oldEnded: window.previousTakeStream
              .getTracks()
              .every((t) => t.readyState === "ended"),
            live: v.srcObject.getTracks().every((t) => t.readyState === "live"),
          })),
      ).toEqual({ fresh: true, oldEnded: true, live: true });
    }
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search scripts" }),
  ).toBeVisible();
  await expect(page.locator(".camera-preview")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.previousTakeStream
        .getTracks()
        .every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await expect(page.locator(".video-card")).toHaveCount(3);
});
