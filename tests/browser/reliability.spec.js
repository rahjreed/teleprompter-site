import { test, expect } from "@playwright/test";

test("reading panel stays clear of camera controls on a short phone screen and remembers position", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await page.getByRole('button', { name: 'Enable camera & mic' }).click();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Adjust teleprompter' }).click();
  const slider = page.getByRole('slider', { name: /Panel position/ });
  await slider.focus(); await slider.press('End'); await expect(slider).toHaveValue('25');
  await page.getByRole('button', { name: 'Close studio controls' }).click();
  const panel = await page.locator('.prompter-panel').boundingBox(), controls = await page.locator('.camera-tools').boundingBox();
  expect(panel.y + panel.height).toBeLessThan(controls.y);
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await page.getByRole('button', { name: 'Enable camera & mic' }).click();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Adjust teleprompter' }).click();
  await expect(page.getByRole('slider', { name: /Panel position/ })).toHaveValue('25');
});

for (const dimensions of [{ width: 360, height: 640 }, { width: 640, height: 480 }, { width: 640, height: 360 }]) {
test(`export preserves full ${dimensions.width}x${dimensions.height} camera view without mirroring or interface pixels`, async ({
  page,
}) => {
  await page.addInitScript(({ width, height }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      function draw() {
        ctx.fillStyle = "#205030";
        ctx.fillRect(0, 0, width / 2, height);
        ctx.fillStyle = "#502060";
        ctx.fillRect(width / 2, 0, width / 2, height);
        ctx.fillStyle = '#641414'; ctx.fillRect(0, 0, width * .08, height);
        ctx.fillStyle = '#141478'; ctx.fillRect(width * .92, 0, width * .08, height);
        requestAnimationFrame(draw);
      }
      draw();
      const stream = canvas.captureStream(30);
      const audio = new AudioContext(),
        oscillator = audio.createOscillator(),
        destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      await audio.resume();
      stream.addTrack(destination.stream.getAudioTracks()[0]);
      window.testCamera = { canvas, audio, oscillator, stream };
      return stream;
    };
  }, dimensions);
  await page.goto("/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".camera-preview")).toHaveClass(/mirrored/);
  await expect(page.locator(".camera-preview")).toHaveCSS('object-fit', 'contain');
  await expect(page.locator(".prompter-scroll")).toContainText(
    "You have something worth sharing.",
  );
  const sourcePixel = await page.locator(".camera-preview").evaluate((v) => {
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const x = c.getContext("2d");
    x.drawImage(v, 0, 0);
    return Array.from(x.getImageData(Math.round(v.videoWidth * .25), Math.round(v.videoHeight / 2), 1, 1).data);
  });
  expect(sourcePixel[1]).toBeGreaterThan(60);
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.getByText(/verified from saved video/)).toBeVisible();
  const result = await page
    .locator("video.playback")
    .evaluate(async (video) => {
      await video.play();
      await new Promise((resolve) =>
        video.requestVideoFrameCallback
          ? video.requestVideoFrameCallback(resolve)
          : setTimeout(resolve, 300),
      );
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const at = (x) =>
        Array.from(
          ctx.getImageData(Math.round(canvas.width * x), Math.round(canvas.height / 2), 1, 1).data,
        );
      let brightest = 0;
      for (let i = 0; i < data.length; i += 4)
        brightest = Math.max(brightest, data[i], data[i + 1], data[i + 2]);
      return {
        left: at(0.25),
        right: at(0.75),
        leftEdge: at(.02),
        rightEdge: at(.98),
        brightest,
        width: video.videoWidth,
        height: video.videoHeight,
      };
    });
  await test
    .info()
    .attach("decoded-frame-colors", {
      body: JSON.stringify({ sourcePixel, result }),
      contentType: "application/json",
    });
  expect(result.left[1]).toBeGreaterThan(result.left[0] + 20);
  expect(result.right[2]).toBeGreaterThan(result.right[1] + 20);
  expect(result.brightest).toBeLessThan(140);
  expect(result.leftEdge[0]).toBeGreaterThan(result.leftEdge[1] + 40);
  expect(result.rightEdge[2]).toBeGreaterThan(result.rightEdge[0] + 60);
  expect(result.width / result.height).toBeCloseTo(9 / 16, 3);
  if (dimensions.width === 360) { expect(result.width).toBe(360); expect(result.height).toBe(640); }
});
}

test("interruption stops and saves the current take; leaving releases devices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args);
      window.lastStream = stream;
      return stream;
    };
  });
  await page.goto("/");
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
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/verified from saved video/)).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Scripts", exact: true }).click();
  expect(
    await page.evaluate(() =>
      window.lastStream.getTracks().every((t) => t.readyState === "ended"),
    ),
  ).toBe(true);
});

test("settings persist and mobile/desktop layouts fit without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: /Text alignment/ })
    .selectOption("left");
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("5");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: /Text alignment/ }),
  ).toHaveValue("left");
  await expect(page.getByRole("combobox", { name: /Countdown/ })).toHaveValue(
    "5",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "test-results/scripts-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/scripts-desktop.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
