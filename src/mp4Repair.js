import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

function inspectBlob(blob) {
  return new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
}

// Browser MediaRecorder produces fragmented MP4 files whose timestamps/duration
// can be misread by Android Photos and other players. Rewrite the container
// without re-encoding to preserve the actual audio/video samples and duration.
// Never overwrite the source Blob: failed repairs must leave footage intact.
export async function finalizeMp4(blob, expectedSeconds = null) {
  if (!/^video\/mp4(?:;|$)/i.test(blob.type)) {
    return { blob, duration: null, repaired: false };
  }

  const input = inspectBlob(blob);
  const originalDuration = await input.computeDuration();
  if (!Number.isFinite(originalDuration) || originalDuration <= 0) {
    throw new Error("Could not read the recording timeline. The original video was preserved.");
  }
  if (expectedSeconds >= 10 && originalDuration < expectedSeconds * 0.8) {
    throw new Error(
      `The captured video appears incomplete (${Math.round(originalDuration)}s of ${Math.round(expectedSeconds)}s). The original was preserved.`,
    );
  }

  const videoTracks = await input.getVideoTracks();
  const audioTracks = await input.getAudioTracks();
  if (videoTracks.length < 1 || audioTracks.length < 1) {
    throw new Error("The captured video or microphone track is missing. The original was preserved.");
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({
    input,
    output,
    copy: { mode: "forced" },
  });
  if (!conversion.isValid || conversion.discardedTracks.length) {
    throw new Error("Video/audio tracks cannot be copied safely. The original was preserved.");
  }
  await conversion.execute();
  if (!output.target.buffer?.byteLength) {
    throw new Error("The finalized video is empty. The original was preserved.");
  }
  const finalBlob = new Blob([output.target.buffer], { type: "video/mp4" });
  const finalized = inspectBlob(finalBlob);
  const duration = await finalized.computeDuration();
  const finalVideo = await finalized.getVideoTracks();
  const finalAudio = await finalized.getAudioTracks();
  if (!Number.isFinite(duration) || duration <= 0 ||
      Math.abs(duration - originalDuration) > Math.max(2, originalDuration * 0.05) ||
      finalVideo.length !== videoTracks.length ||
      finalAudio.length !== audioTracks.length) {
    throw new Error("Could not verify the full repaired video and audio. The original was preserved.");
  }
  return { blob: finalBlob, duration, repaired: true };
}
