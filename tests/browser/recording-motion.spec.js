import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

for (const mode of ["baseline", "normal", "callback-stall", "no-video-callback"]) {
  test(`${mode}: decoded MP4 image changes throughout capture`, async ({ page }) => {
    test.setTimeout(140000);
    if (mode === "baseline") {
      const baseline = execFileSync("git", ["show", "6cea6f2:src/media.js"], { encoding: "utf8" });
      await page.route("**/src/media.js", route => route.fulfill({ body: baseline, contentType: "application/javascript" }));
    }
    await page.addInitScript(() => {
      window.freezeCallbacksAt = Infinity;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(now => {
        if (performance.now() < window.freezeCallbacksAt) callback(now);
      });
      const callback = HTMLVideoElement.prototype.requestVideoFrameCallback;
      if (callback) HTMLVideoElement.prototype.requestVideoFrameCallback = function(fn) {
        return callback.call(this, (now, metadata) => {
          if (performance.now() < window.freezeCallbacksAt) fn(now, metadata);
        });
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d");
        const started = performance.now();
        const colors = ["rgb(210,30,30)", "rgb(30,210,30)", "rgb(30,30,210)"];
        function draw() {
          ctx.fillStyle = colors[Math.floor((performance.now() - started) / 500) % colors.length];
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        draw();
        const stream = canvas.captureStream(30);
        const timer = setInterval(draw, 1000 / 30);
        const audio = new AudioContext(), oscillator = audio.createOscillator();
        const gain = audio.createGain(), destination = audio.createMediaStreamDestination();
        gain.gain.value = 0.1;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await audio.resume();
        stream.addTrack(destination.stream.getAudioTracks()[0]);
        window.sourceFixture = { stream, timer, audio, oscillator };
        return stream;
      };
    });
    if (mode === "no-video-callback") await page.addInitScript(() => {
      HTMLVideoElement.prototype.requestVideoFrameCallback = undefined;
      HTMLVideoElement.prototype.cancelVideoFrameCallback = undefined;
    });
    await page.goto("/?recordingDiagnostics=1");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Open camera", exact: true }).click();
    await page.getByRole("button", { name: "Enable camera & mic" }).click();
    await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled({ timeout: 10000 });
    const seconds = mode === "baseline" ? 9 : 40;
    if (mode === "baseline" || mode === "callback-stall") await page.evaluate(() => { window.freezeCallbacksAt = performance.now() + 3000; });
    await page.waitForTimeout(seconds * 1000);
    await page.getByRole("button", { name: "Stop recording", exact: true }).click();
    await expect(page.locator("video.playback")).toBeVisible({ timeout: 25000 });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await pending;
    const path = test.info().outputPath(`${mode}.mp4`);
    await download.saveAs(path);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height,duration", "-of", "json", path], { encoding: "utf8" }));
    const pixels = execFileSync("ffmpeg", ["-v", "error", "-i", path, "-vf", "fps=1,scale=1:1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    const colors = [];
    for (let n = 0; n < pixels.length; n += 3) {
      const color = [...pixels.subarray(n, n + 3)];
      colors.push(color.indexOf(Math.max(...color)));
    }
    const evidence = await page.evaluate(() => JSON.parse(localStorage.getItem("prompterson-capture-journal-v3")));
    await writeFile(test.info().outputPath("motion-evidence.json"), JSON.stringify({ mode, probe, colors, health: evidence.health }, null, 2));
    expect(Number(probe.format.duration)).toBeGreaterThan(seconds - 1);
    expect(probe.streams.some(s => s.codec_name === "h264" && s.width === 1080 && s.height === 1920)).toBe(true);
    expect(probe.streams.some(s => s.codec_name === "aac")).toBe(true);
    if (mode === "baseline") {
      // A valid duration does not mean that the picture stayed fresh.
      expect(colors.length, "video frames end around the injected 3-second stall despite full file duration").toBeLessThan(6);
    } else {
      expect(colors.length).toBeGreaterThan(37);
      for (let start = 0; start + 5 <= colors.length; start += 5) {
        expect(new Set(colors.slice(start, start + 5)).size, `image changes at ${start}s`).toBeGreaterThanOrEqual(2);
      }
      const health = evidence.health.samples.filter(s => s.encoderState === "recording");
      expect(health.some(s => s.encoderOutput?.bytes > 0)).toBe(true);
      expect(health.at(-1).canvas.framesDrawn).toBeGreaterThan(health[0].canvas.framesDrawn + 100);
      if (mode === "callback-stall") expect(health.at(-1).canvas.timerFallbackDraws).toBeGreaterThan(20);
    }
    await page.evaluate(async () => {
      clearInterval(window.sourceFixture.timer);
      window.sourceFixture.stream.getTracks().forEach(t => t.stop());
      await window.sourceFixture.audio.close();
    });
  });
}
