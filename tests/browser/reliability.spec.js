import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("reading panel stays clear of camera controls on a short phone screen and remembers position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  const natural = await page
    .locator(".camera-preview")
    .evaluate((video) => video.srcObject.getAudioTracks()[0].getSettings());
  expect(natural.echoCancellation).toBe(false);
  expect(natural.noiseSuppression).toBe(false);
  expect(natural.autoGainControl).toBe(false);
  await page.getByRole("button", { name: "Adjust teleprompter" }).click();
  const slider = page.getByRole("slider", { name: /Panel position/ });
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("25");
  await page.getByRole("button", { name: "Close studio controls" }).click();
  const panel = await page.locator(".prompter-panel").boundingBox(),
    controls = await page.locator(".camera-tools").boundingBox();
  expect(panel.y + panel.height).toBeLessThan(controls.y);
  await page.getByRole("button", { name: "Scripts", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Adjust teleprompter" }).click();
  await expect(
    page.getByRole("slider", { name: /Panel position/ }),
  ).toHaveValue("25");
});

for (const fixture of [
  { width: 1080, height: 1920, outputWidth: 1080, path: "native" },
  { width: 1080, height: 1440, outputWidth: 720, path: "center crop" },
  { width: 1920, height: 1080, outputWidth: 594, path: "center crop" },
  {
    width: 1080,
    height: 1920,
    outputWidth: 720,
    path: "center crop",
    closeUp: true,
  },
]) {
  test(`${fixture.width}x${fixture.height} ${fixture.closeUp ? "Close-Up" : "Standard"} exports a clean, undistorted portrait file`, async ({
    page,
  }) => {
    await page.addInitScript(({ width, height }) => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0];
        let frameNumber = 0;
        function draw() {
          ctx.fillStyle = "#205030";
          ctx.fillRect(0, 0, width / 2, height);
          ctx.fillStyle = "#502060";
          ctx.fillRect(width / 2, 0, width / 2, height);
          ctx.fillStyle = "#787814";
          ctx.fillRect(width / 2 - 50, height / 2 - 50, 100, 100);
          ctx.fillStyle = "#284838";
          ctx.fillRect(30 + (frameNumber++ % 30), 40, 16, 16);
          track.requestFrame();
        }
        draw();
        setInterval(draw, 1000 / 30);
        const audio = new AudioContext(),
          oscillator = audio.createOscillator(),
          destination = audio.createMediaStreamDestination();
        const gain = audio.createGain();
        gain.gain.value = 0.2;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await audio.resume();
        stream.addTrack(destination.stream.getAudioTracks()[0]);
        window.testCamera = { canvas, audio, oscillator, stream };
        return stream;
      };
    }, fixture);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", {
        value: ({ files }) => files?.length === 1,
      });
      Object.defineProperty(navigator, "share", {
        value: async ({ files }) => {
          window.sharedTake = {
            size: files[0].size,
            type: files[0].type,
            name: files[0].name,
          };
        },
      });
    });
    await page.goto("/?recordingDiagnostics=1");
    await page
      .getByRole("button", { name: "Open camera", exact: true })
      .click();
    await page.getByRole("button", { name: "Enable camera & mic" }).click();
    await expect(
      page.getByRole("button", { name: "Start recording", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".camera-preview")).toHaveClass(/mirrored/);
    const frame = await page.locator(".camera-frame").boundingBox();
    expect(frame.width / frame.height).toBeCloseTo(9 / 16, 3);
    if (fixture.closeUp) {
      await page.getByRole("button", { name: "Adjust teleprompter" }).click();
      await page
        .getByRole("combobox", { name: /Recording framing/ })
        .selectOption("close-up");
      await page.getByRole("button", { name: "Close studio controls" }).click();
    }
    await expect(page.locator(".prompter-scroll")).toContainText(
      "You have something worth sharing.",
    );
    const sourcePixel = await page.locator(".camera-preview").evaluate((v) => {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const x = c.getContext("2d");
      x.drawImage(v, 0, 0);
      return Array.from(
        x.getImageData(
          Math.round(v.videoWidth * 0.25),
          Math.round(v.videoHeight / 2),
          1,
          1,
        ).data,
      );
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
        const at = (x, y = 0.5) =>
          Array.from(
            ctx.getImageData(
              Math.round(canvas.width * x),
              Math.round(canvas.height * y),
              1,
              1,
            ).data,
          );
        let whitePixels = 0;
        let minX = canvas.width,
          minY = canvas.height,
          maxX = 0,
          maxY = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 170 && data[i + 1] > 170 && data[i + 2] > 170)
            whitePixels++;
          if (data[i] > 85 && data[i + 1] > 85 && data[i + 2] < 45) {
            const x = (i / 4) % canvas.width,
              y = Math.floor(i / 4 / canvas.width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        let lastFrame = 0;
        let callbackId;
        function trackPlayback(_now, frame) {
          lastFrame = frame.mediaTime;
          callbackId = video.requestVideoFrameCallback(trackPlayback);
        }
        callbackId = video.requestVideoFrameCallback(trackPlayback);
        await new Promise((resolve) => video.addEventListener("ended", resolve, { once: true }));
        video.cancelVideoFrameCallback(callbackId);
        return {
          left: at(0.25),
          right: at(0.75),
          top: at(0.25, 0.01),
          bottom: at(0.25, 0.99),
          markerWidth: maxX - minX + 1,
          markerHeight: maxY - minY + 1,
          whitePixels,
          width: video.videoWidth,
          height: video.videoHeight,
          videoTailSeconds: video.duration - lastFrame,
        };
      });
    await test.info().attach("decoded-frame-colors", {
      body: JSON.stringify({ sourcePixel, result }),
      contentType: "application/json",
    });
    expect(result.left[1]).toBeGreaterThan(result.left[0] + 20);
    expect(result.right[2]).toBeGreaterThan(result.right[1] + 20);
    expect(result.whitePixels).toBe(0);
    expect(result.top[1]).toBeGreaterThan(60);
    expect(result.bottom[1]).toBeGreaterThan(60);
    expect(result.markerWidth).toBeGreaterThan(70);
    expect(Math.abs(result.markerWidth - result.markerHeight)).toBeLessThan(4);
    expect(result.width).toBe(fixture.outputWidth);
    expect(result.width * 16).toBe(result.height * 9);
    expect(result.videoTailSeconds).toBeLessThan(0.3);

    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloadEvent;
    const extension = download.suggestedFilename().split(".").at(-1);
    const file = test.info().outputPath(`recording.${extension}`);
    await download.saveAs(file);
    const bytes = await readFile(file);
    if (extension === "mp4") expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
    else expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const shared = await page.evaluate(() => window.sharedTake);
    expect(shared.size).toBe(bytes.length);
    expect(shared.type).toContain(`video/${extension}`);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Scripts", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText("Recording diagnostics", { exact: true }).click();
    const diagnostics = JSON.parse(
      await page.locator(".recording-diagnostics pre").textContent(),
    );
    expect(diagnostics.framing.path).toBe(fixture.path);
    expect(diagnostics.export.portrait).toBe(true);
    expect(diagnostics.export.width).toBe(result.width);
    expect(diagnostics.export.height).toBe(result.height);
    expect(diagnostics.export.microphoneLevels.sampledWindows).toBeGreaterThan(
      0,
    );
    expect(diagnostics.export.microphoneLevels.peakDbFS).toBeLessThan(-10);
    expect(diagnostics.export.microphoneLevels.nearClippingWindows).toBe(0);
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
