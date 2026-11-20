import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("three consecutive recordings including a full 60-second take retain camera, microphone and full MP4 timeline", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/?recordingDiagnostics=1");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("combobox", { name: /Countdown/ }).selectOption("0");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  const results = [];
  for (const seconds of [3, 60, 3]) {
    await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled();
    const initial = await page.locator(".camera-preview").evaluate(v => v.getVideoPlaybackQuality().totalVideoFrames);
    await page.waitForTimeout(seconds * 1000);
    const frames = await page.locator(".camera-preview").evaluate(v => ({
      count: v.getVideoPlaybackQuality().totalVideoFrames,
      camera: v.srcObject.getVideoTracks()[0].readyState,
      audio: v.srcObject.getAudioTracks()[0].readyState,
    }));
    expect(frames.count).toBeGreaterThan(initial + seconds * 5);
    expect(frames.camera).toBe("live");
    expect(frames.audio).toBe("live");
    await page.getByRole("button", { name: "Stop recording", exact: true }).click();
    await expect(page.locator("video.playback")).toBeVisible({ timeout: 20000 });
    await expect.poll(() => page.locator("video.playback").evaluate(v => Number.isFinite(v.duration) ? v.duration : 0)).toBeGreaterThan(seconds - 1);
    const metadata = await page.locator("video.playback").evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }));
    expect(metadata.width * 16).toBe(metadata.height * 9);
    await page.locator("video.playback").evaluate(v => { v.currentTime = v.duration - 0.5; return v.play(); });
    await expect.poll(() => page.locator("video.playback").evaluate(v => v.currentTime)).toBeGreaterThan(seconds - 1);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const download = await downloading;
    const file = test.info().outputPath(`take-${results.length}.mp4`);
    expect(download.suggestedFilename()).toMatch(/\.mp4$/);
    await download.saveAs(file);
    const probe = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name",
      "-of", "json", file,
    ], { encoding: "utf8" }));
    expect(Number(probe.format.duration)).toBeGreaterThan(seconds - 1);
    expect(probe.streams.some(s => s.codec_type === "video" && s.codec_name === "h264")).toBe(true);
    expect(probe.streams.some(s => s.codec_type === "audio" && s.codec_name === "aac")).toBe(true);
    results.push({ seconds, frames, metadata, probe });
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
  await writeFile(test.info().outputPath("repeated-recordings.json"), JSON.stringify(results, null, 2));
});

test("stalled optional video-frame callbacks do not freeze the canvas recorder", async ({ page }) => {
  const { execFileSync } = await import("node:child_process");
  const baseline = execFileSync("git", ["show", "4e185fe:src/media.js"], { encoding: "utf8" });
  await page.route("**/baseline-media.js", route => route.fulfill({ body: baseline, contentType: "application/javascript" }));
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    document.body.append(video);
    await video.play();
    video.requestVideoFrameCallback = () => 123;
    video.cancelVideoFrameCallback = () => {};
    const prototype = CanvasRenderingContext2D.prototype;
    const originalDraw = prototype.drawImage;
    let count = 0;
    prototype.drawImage = function(...args) { count++; return originalDraw.apply(this, args); };
    const result = [];
    try {
      for (const path of ["/baseline-media.js", "/src/media.js"]) {
        const { portraitStream } = await import(path);
        count = 0;
        const take = portraitStream(video, stream, "1080", "standard");
        await new Promise(resolve => setTimeout(resolve, 1200));
        result.push(count);
        take.cleanup();
        if (stream.getAudioTracks()[0].readyState !== "live") throw Error("Cleanup stopped source audio");
      }
    } finally {
      prototype.drawImage = originalDraw;
      stream.getTracks().forEach(track => track.stop());
      video.remove();
    }
    return result;
  });
  expect(results[0]).toBe(1);
  expect(results[1]).toBeGreaterThan(5);
});

test("a hung storage estimate cannot block countdown or recording", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.estimate = () => new Promise(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await page.getByRole("button", { name: "Enable camera & mic" }).click();
  await expect(page.getByRole("button", { name: "Start recording", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled({ timeout: 10000 });
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.locator("video.playback")).toBeVisible({ timeout: 15000 });
});
