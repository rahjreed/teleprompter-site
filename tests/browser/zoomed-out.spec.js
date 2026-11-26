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


test.describe("iPhone 3:4 Zoomed Out camera target", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  });

  test("switching presets reacquires 3:4 camera and square fallback matches saved video", async ({ page }) => {
    test.setTimeout(80000);
    await page.addInitScript(() => {
      window.iphoneCameraRequests = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.iphoneCameraRequests.push(constraints);
        // Safari can ignore ideal aspect ratio: deliberately return a square.
        const canvas = document.createElement("canvas");
        canvas.width = 1920;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d");
        let frames = 0;
        const draw = () => {
          ctx.fillStyle = "#e88015";
          ctx.fillRect(0, 0, 1920, 1920);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(810 + (++frames % 100), 800, 40, 40);
        };
        draw();
        const stream = canvas.captureStream(30);
        const timer = setInterval(draw, 33);
        const originalStop = stream.getVideoTracks()[0].stop.bind(stream.getVideoTracks()[0]);
        stream.getVideoTracks()[0].stop = () => {
          clearInterval(timer);
          originalStop();
        };
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const destination = audio.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        await audio.resume();
        stream.addTrack(destination.stream.getAudioTracks()[0]);
        return stream;
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Open camera", exact: true }).click();
    await page.getByRole("button", { name: "Enable camera & mic" }).click();
    await expect(page.getByRole("button", { name: "Start recording", exact: true }))
      .toBeEnabled({ timeout: 15000 });

    await page.getByRole("button", { name: "Adjust teleprompter" }).click();
    await page.getByRole("combobox", { name: /Recording framing/ })
      .selectOption("zoomed-out");
    await page.getByRole("button", { name: "Close studio controls" }).click();

    await expect(page.getByRole("button", { name: "Start recording", exact: true }))
      .toBeEnabled({ timeout: 15000 });
    const preview = page.locator("video.camera-preview");
    await expect(preview).toHaveClass(/ios-three-four/);
    await expect(preview).toHaveCSS("object-fit", "cover");
    const widths = await page.evaluate(() =>
      window.iphoneCameraRequests.map((c) => ({
        width: c.video.width?.ideal,
        height: c.video.height?.ideal,
        ratio: c.video.aspectRatio?.ideal,
      })),
    );
    expect(widths).toEqual([
      { width: 1920, height: 1920, ratio: undefined },
      { width: 1440, height: 1920, ratio: 0.75 },
    ]);
    const fraction = await page.evaluate(() => {
      const frame = document.querySelector(".camera-frame");
      const preview = document.querySelector(".camera-preview");
      return preview.getBoundingClientRect().height / frame.getBoundingClientRect().height;
    });
    expect(fraction).toBeCloseTo(0.75, 2);

    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop recording", exact: true }))
      .toBeEnabled({ timeout: 10000 });
    await page.waitForTimeout(2200);
    await page.getByRole("button", { name: "Stop recording", exact: true }).click();
    await expect(page.locator("video.playback")).toBeVisible({ timeout: 25000 });
    const result = await page.locator("video.playback").evaluate(async (video) => {
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        top: [...ctx.getImageData(canvas.width / 2, 10, 1, 1).data],
        center: [...ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data],
        bottom: [...ctx.getImageData(canvas.width / 2, canvas.height - 10, 1, 1).data],
      };
    });
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
    expect(result.top[0]).toBeLessThan(60);
    expect(result.bottom[0]).toBeLessThan(60);
    expect(result.center[0]).toBeGreaterThan(120);
    await page.getByRole("button", { name: "Close dialog" }).click();
  });
});
