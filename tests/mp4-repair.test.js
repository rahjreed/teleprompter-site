import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { finalizeMp4 } from "../src/mp4Repair.js";

function run(command, args, input) {
  const result = spawnSync(command, args, { input, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command}: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

function fragmentedVideo(seconds = 9) {
  return new Blob([run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=blue:s=160x288:r=12:d=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+frag_keyframe+empty_moov",
    "-f", "mp4", "pipe:1",
  ])], { type: "video/mp4" });
}

async function describe(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const result = run("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration:stream=codec_type,codec_name",
    "-of", "json", "-i", "pipe:0",
  ], buffer);
  return JSON.parse(result.toString());
}

test("fragmented 9-second MP4 is finalized with full duration, audio and video", async () => {
  const original = fragmentedVideo(9);
  const originalBytes = await original.arrayBuffer();
  const result = await finalizeMp4(original, 9);
  assert.equal(result.repaired, true);
  assert.equal(result.blob.type, "video/mp4");
  assert.ok(result.duration >= 8.5 && result.duration <= 9.6, `actual ${result.duration}`);
  const info = await describe(result.blob);
  assert.ok(Number(info.format.duration) >= 8.5, `probe: ${JSON.stringify(info)}`);
  assert.ok(info.streams.some((s) => s.codec_type === "video"));
  assert.ok(info.streams.some((s) => s.codec_type === "audio"));
  assert.equal(original.size, originalBytes.byteLength, "Original Blob remains unchanged");
});

test("a genuinely short recording is rejected, not falsely labelled as full-length", async () => {
  const original = fragmentedVideo(4);
  await assert.rejects(finalizeMp4(original, 45), /incomplete/);
});

test("non-MP4 data remains unchanged", async () => {
  const original = new Blob(["webm"], { type: "video/webm" });
  const result = await finalizeMp4(original, 30);
  assert.equal(result.blob, original);
  assert.equal(result.repaired, false);
});
