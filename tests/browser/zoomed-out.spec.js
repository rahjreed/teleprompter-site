import { test, expect } from "@playwright/test";

// A camera fixture with a 3:4 picture, so the complete view is wider than
// the center crop used by Standard.
test("Zoomed Out preview and saved 9:16 video include the whole camera picture", async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1440;
      const ctx = canvas.getContext("2d");
      let n = 0;
      function paint() {
        ctx.fillStyle = "#ee8c14";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#1947ce";
        ctx.fillRect(0, 0, 100, canvas.height);
        ctx.fillStyle = "#19c15a";
        ctx.fillRect(canvas.width - 100, 0, 100, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(200 + (n++ % 50), 400, 25, 25);
      }
      paint();
      const stream = canvas.captureStream(30);
      setInterval(paint, 1000 / 30);
      const audio = new AudioContext();
      const osc = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      osc.connect(destination);
      osc.start();
      await audio.resume();
      stream.addTrack(destination.stream.getAudioTracks()[0]);
      return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /Recording framing/ }).selectOption("zoomed-out");
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
  await expect(page.getByText(/Dark borders may appear/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(page.getByRole("button", { name: "Start recording", exact: true }))
    .toBeEnabled({ timeout: 15000 });
  await expect(page.locator("video.camera-preview")).toHaveCSS("object-fit", "contain");
  await page.getByRole("button", { name: "Adjust teleprompter" }).click();
  await expect(page.getByRole("combobox", { name: /Recording framing/ })).toHaveValue("zoomed-out");
  await page.getByRole("button", { name: "Close studio controls" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true }))
    .toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(1900);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.locator("video.playback")).toBeVisible({ timeout: 25000 });
  const output = await page.locator("video.playback").evaluate(async (video) => {
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(video, 0, 0);
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      top: Array.from(ctx.getImageData(c.width / 2, 10, 1, 1).data),
      center: Array.from(ctx.getImageData(c.width / 2, c.height / 2, 1, 1).data),
      bottom: Array.from(ctx.getImageData(c.width / 2, c.height - 10, 1, 1).data),
    };
  });
  expect(output.width).toBe(720);
  expect(output.height).toBe(1280);
  // Unlike Standard, full view preserves the 3:4 feed and places dark
  // bands above and below it instead of cropping the sides.
  expect(output.top[0]).toBeLessThan(60);
  expect(output.bottom[0]).toBeLessThan(60);
  expect(output.center[0]).toBeGreaterThan(100);
  expect(output.center[1]).toBeGreaterThan(50);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /Recording framing/ })).toHaveValue("zoomed-out");
});
