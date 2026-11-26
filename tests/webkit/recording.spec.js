import { test, expect } from "@playwright/test";
test("iPhone WebKit retains wide camera request and live portrait canvas recording", async ({
  page,
}) => {
  test.setTimeout(70000);
  const support = await page.evaluate(() => ({
    canvas: typeof HTMLCanvasElement.prototype.captureStream,
    recorder: typeof MediaRecorder,
    audio: typeof AudioContext,
  }));
  await test
    .info()
    .attach("webkit-media-support", {
      body: JSON.stringify(support),
      contentType: "application/json",
    });
  test.skip(
    support.canvas !== "function" || support.recorder !== "function",
    "This Windows WebKit runtime has no camera/canvas recording backend; physical iPhone recording verification is required.",
  );
  await page.addInitScript(() => {
    window.requests = [];
    if (!navigator.mediaDevices)
      Object.defineProperty(navigator, "mediaDevices", {
        value: { enumerateDevices: async () => [] },
      });
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      window.requests.push(constraints);
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      let n = 0;
      function draw() {
        ctx.fillStyle = ["red", "lime", "blue"][Math.floor(n++ / 15) % 3];
        ctx.fillRect(0, 0, 1280, 1920);
      }
      draw();
      const timer = setInterval(draw, 33),
        stream = canvas.captureStream(30);
      const audio = new (window.AudioContext || window.webkitAudioContext)(),
        osc = audio.createOscillator(),
        gain = audio.createGain(),
        dest = audio.createMediaStreamDestination();
      gain.gain.value = 0.1;
      osc.connect(gain).connect(dest);
      osc.start();
      await audio.resume();
      stream.addTrack(dest.stream.getAudioTracks()[0]);
      window.fixture = { stream, timer, audio };
      return stream;
    };
  });
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  const request = await page.evaluate(() => window.requests[0]);
  expect(request.video.width.ideal).toBe(1920);
  expect(request.video.height.ideal).toBe(1920);
  expect(request.video.resizeMode.exact).toBe("none");
  expect(request.video.aspectRatio).toBeUndefined();
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(35000);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.locator("video.playback")).toBeVisible({ timeout: 15000 });
  const evidence = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("prompterson-capture-journal-v4")),
  );
  expect(
    evidence.health.samples.some((s) => s.canvas?.fallbackEnabled === false),
  ).toBe(true);
  expect(evidence.export.width).toBe(1080);
  expect(evidence.export.height).toBe(1920);
  expect(evidence.export.duration).toBeGreaterThan(33);
  expect(evidence.export.microphoneLevels.highestWindowRmsDbFS).toBeGreaterThan(
    -40,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await (await download).saveAs(test.info().outputPath("webkit.mp4"));
  await page.evaluate(async () => {
    clearInterval(window.fixture.timer);
    window.fixture.stream.getTracks().forEach((t) => t.stop());
    await window.fixture.audio.close();
  });
});
