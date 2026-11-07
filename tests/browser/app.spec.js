import { test, expect } from "@playwright/test";

test("create, autosave, reload, search, tag, duplicate and delete a script", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /A fresh start/ }).click();
  await page
    .getByRole("textbox", { name: "Script title" })
    .fill("My saved story");
  await page
    .getByRole("textbox", { name: "Script content" })
    .fill("A unique phrase to remember.");
  await page.getByRole("button", { name: "Work", exact: true }).last().click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Search scripts" })
    .fill("unique phrase");
  await expect(
    page.getByRole("heading", { name: "My saved story" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first great take" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Actions for My saved story", exact: true })
    .click();
  await page.getByRole("button", { name: "Duplicate script" }).click();
  await expect(
    page.getByRole("heading", { name: "My saved story (copy)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Actions for My saved story (copy)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Delete script", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My saved story (copy)", exact: true }),
  ).toHaveCount(0);
});

test("countdown cancellation, camera+audio recording, portrait export, playback, download and retrieval", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: "Microphone", exact: true }).selectOption("voice");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  const voice = await page.locator(".camera-preview").evaluate((video) => video.srcObject.getAudioTracks()[0].getSettings());
  expect(voice.echoCancellation).toBe(true);
  expect(voice.noiseSuppression).toBe(true);
  expect(voice.autoGainControl).toBe(true);
  await page.screenshot({ path: "test-results/studio-mobile.png" });
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel countdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel countdown" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled({ timeout: 10000 });
  await expect(
    page.getByRole("button", { name: "Scripts", exact: true }),
  ).toBeDisabled();
  await page.waitForTimeout(2300);
  await page.getByRole("button", { name: "Pause scrolling" }).click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/verified from saved video/)).toBeVisible();
  const metadata = await page.locator("video.playback").evaluate(async (v) => {
    await v.play();
    return {
      width: v.videoWidth,
      height: v.videoHeight,
      audio: v.captureStream ? v.captureStream().getAudioTracks().length : -1,
    };
  });
  expect(metadata.width / metadata.height).toBeCloseTo(9 / 16, 2);
  expect(metadata.audio).toBe(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(mp4|webm)$/);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await expect(page.locator(".video-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await expect(page.locator(".video-card")).toHaveCount(1);
});

test("permission denial is actionable and does not begin recording", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", { value: {} });
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(page.getByRole("alert")).toContainText("permission was denied");
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeDisabled();
});

test("storage failure retains the take with an immediate download", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /A fresh start/ }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "videos")
        throw new DOMException("Full", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled({ timeout: 10000 });
  await page.waitForTimeout(1100);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(
    page.getByText("Not saved locally. Download this take before closing."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download", exact: true }),
  ).toBeEnabled();
});
