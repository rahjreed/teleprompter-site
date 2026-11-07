export function captureDetails(stream, video) {
  function readTrack(track) {
    const settings = { ...track?.getSettings() };
    delete settings.deviceId;
    delete settings.groupId;
    return settings;
  }
  return {
    cameraTrack: readTrack(stream.getVideoTracks()[0]),
    microphoneTrack: readTrack(stream.getAudioTracks()[0]),
    decodedCameraFrame: { width: video.videoWidth, height: video.videoHeight },
  };
}

export function encoderDetails(recorder) {
  const codecs =
    recorder.mimeType
      .match(/codecs\s*=\s*"?([^";]+)/i)?.[1]
      .split(",")
      .map((codec) => codec.trim()) || [];
  const audioCodec = codecs.find((codec) =>
    /^(mp4a|opus|vorbis|aac|flac|pcm)/i.test(codec),
  );
  return {
    mimeType: recorder.mimeType,
    videoCodec: codecs.find((codec) => codec !== audioCodec) || "not reported",
    audioCodec: audioCodec || "not reported",
    videoBitsPerSecondTarget: recorder.videoBitsPerSecond,
    audioBitsPerSecondTarget: recorder.audioBitsPerSecond,
  };
}

// Observe microphone levels locally. The analyser is never part of the recorder input.
export function measureMicrophone(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  let audio;
  try {
    audio = new AudioContext();
    const analyser = audio.createAnalyser();
    const input = audio.createMediaStreamSource(stream);
    input.connect(analyser);
    audio.resume().catch(() => {});
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0,
      highestRms = 0,
      windows = 0,
      nearClippingWindows = 0;
    const timer = setInterval(() => {
      if (audio.state !== "running") return;
      analyser.getFloatTimeDomainData(samples);
      let windowPeak = 0,
        power = 0;
      for (const sample of samples) {
        windowPeak = Math.max(windowPeak, Math.abs(sample));
        power += sample * sample;
      }
      windows++;
      if (windowPeak >= 0.99) nearClippingWindows++;
      peak = Math.max(peak, windowPeak);
      highestRms = Math.max(highestRms, Math.sqrt(power / samples.length));
    }, 50);
    return () => {
      clearInterval(timer);
      input.disconnect();
      audio.close().catch(() => {});
      const db = (amplitude) =>
        amplitude ? Math.round(20 * Math.log10(amplitude) * 10) / 10 : null;
      return {
        sampledWindows: windows,
        peakDbFS: db(peak),
        highestWindowRmsDbFS: db(highestRms),
        nearClippingWindows,
      };
    };
  } catch {
    audio?.close().catch(() => {});
    return null;
  }
}
