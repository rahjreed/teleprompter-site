import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  AlignLeft,
  GripHorizontal,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  SwitchCamera,
  X,
} from "lucide-react";
import {
  busy,
  framingScale,
  formatTime,
  inspectRecording,
  cameraPermission,
  mediaError,
  portraitStream,
  requestCamera,
  startRecorder,
} from "./media";
import {
  captureDetails,
  encoderDetails,
  measureMicrophone,
} from "./recordingDiagnostics";
import { storageStatus } from "./storage";
import { finalizeMp4 } from "./mp4Repair";
import { attribution, mascot, productName, tagline } from "./brand";

// Keep the persisted 0–25 slider scale while allowing a wider physical range.
const POSITION_MAX = 25;
const PROMPT_TRAVEL = 0.4;

export default function CameraView({
  script,
  settings,
  updateSettings,
  choose,
  onRecorded,
  onState,
  onDiagnostics,
  alert,
}) {
  const video = useRef(null),
    source = useRef(null),
    recorder = useRef(null),
    output = useRef(null),
    stopMeter = useRef(null),
    timer = useRef(null),
    mounted = useRef(true),
    generation = useRef(0),
    stateRef = useRef("idle"),
    scroll = useRef(null),
    offset = useRef(0),
    started = useRef(0),
    wake = useRef(null),
    callbacks = useRef({});
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [introComplete, setIntroComplete] = useState(false);
  const [state, setState] = useState("idle"),
    [error, setError] = useState(""),
    [count, setCount] = useState(3),
    [elapsed, setElapsed] = useState(0),
    [playing, setPlaying] = useState(false),
    [controls, setControls] = useState(false),
    [position, setPosition] = useState(settings.position ?? 0),
    [devices, setDevices] = useState([]),
    [resolution, setResolution] = useState(""),
    [front, setFront] = useState(true);
  callbacks.current = {
    onRecorded,
    onState,
    onDiagnostics,
    alert,
    settings,
    script,
  };
  function reportError(stage, error) {
    callbacks.current.onDiagnostics?.("error", {
      stage,
      message: mediaError(error),
    });
  }
  function transition(next) {
    stateRef.current = next;
    if (mounted.current) setState(next);
    callbacks.current.onState(next);
  }
  function stopTracks() {
    source.current?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    source.current = null;
    if (video.current) video.current.srcObject = null;
  }
  function cancelCountdown() {
    clearInterval(timer.current);
    timer.current = null;
    if (stateRef.current === "countdown")
      transition(source.current ? "ready" : "idle");
  }
  function stopRecording() {
    if (
      recorder.current?.state === "recording" ||
      recorder.current?.state === "paused"
    ) {
      transition("saving");
      setPlaying(false);
      recorder.current.stop();
    }
  }
  async function enable(patch = {}) {
    if (busy(stateRef.current) || stateRef.current === "requesting") return;
    const token = ++generation.current;
    stopTracks();
    setError("");
    transition("requesting");
    try {
      const prefs = { ...callbacks.current.settings, ...patch };
      const stream = await requestCamera(prefs);
      if (!mounted.current || token !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      source.current = stream;
      const trackSettings = stream.getVideoTracks()[0].getSettings();
      setFront(
        trackSettings.facingMode
          ? trackSettings.facingMode === "user"
          : prefs.facing === "user",
      );
      video.current.srcObject = stream;
      await video.current.play();
      if (!mounted.current || token !== generation.current) return;
      if (onDiagnostics)
        onDiagnostics("capture", captureDetails(stream, video.current));
      setResolution(
        `${trackSettings.width || video.current.videoWidth} × ${trackSettings.height || video.current.videoHeight} source`,
      );
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (!mounted.current) return;
          cancelCountdown();
          stopRecording();
          setError(
            "Camera or microphone was disconnected. Your available footage is being kept.",
          );
          reportError(
            "capture",
            new Error("Camera or microphone disconnected."),
          );
          if (!busy(stateRef.current)) transition("error");
        };
      });
      navigator.mediaDevices
        .enumerateDevices()
        .then(
          (items) =>
            mounted.current &&
            setDevices(items.filter((d) => d.kind === "videoinput")),
        )
        .catch(() => {});
      setIntroComplete(true);
      try {
        localStorage.setItem("prompterson-camera-intro-complete", "1");
      } catch {
        // Capture still works when browser storage is unavailable.
      }
      transition("ready");
    } catch (e) {
      if (mounted.current && token === generation.current) {
        stopTracks();
        reportError("capture", e);
        setError(mediaError(e));
        transition("error");
      }
    }
  }
  async function beginRecording() {
    try {
      if (
        !source.current
          ?.getVideoTracks()
          .some((t) => t.readyState === "live") ||
        !source.current?.getAudioTracks().some((t) => t.readyState === "live")
      )
        throw new Error(
          "Camera or microphone stopped. Enable them again before recording.",
        );
      const preferences = callbacks.current.settings;
      const take = portraitStream(
        video.current,
        source.current,
        preferences.quality,
        preferences.framing,
      );
      output.current = take;
      if (onDiagnostics) {
        onDiagnostics("capture", captureDetails(source.current, video.current));
        onDiagnostics("framing", {
          preset: preferences.framing,
          microphone: preferences.microphone,
          path: take.path,
          sourceCrop: take.crop,
          encoderFrame: { width: take.width, height: take.height },
        });
        onDiagnostics("export", null);
        stopMeter.current = measureMicrophone(source.current);
      }
      started.current = performance.now();
      const capture = startRecorder(take);
      recorder.current = capture;
      capture.onstart = () =>
        callbacks.current.onDiagnostics?.("encoder", encoderDetails(capture));
      const chunks = [];
      let bytes = 0;
      const recordingScript = callbacks.current.script;
      capture.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 400 * 1024 * 1024 && capture.state === "recording") {
            callbacks.current.alert(
              "Take stopped at the memory limit. Save this take and start another.",
            );
            stopRecording();
          }
        }
      };
      capture.onerror = (e) => {
        reportError("recording", e.error || new Error("Encoder error."));
        callbacks.current.alert(
          `Recording interrupted: ${e.error?.message || "encoder error"}. Available footage will be kept.`,
        );
        stopRecording();
      };
      capture.onstop = async () => {
        if (mounted.current) {
          setPlaying(false);
          transition("saving");
        }
        const elapsed = (performance.now() - started.current) / 1000;
        const microphoneLevels = stopMeter.current?.();
        stopMeter.current = null;
        output.current?.cleanup();
        output.current = null;
        recorder.current = null;
        const rawBlob = new Blob(chunks, {
          type: chunks[0]?.type || capture.mimeType || "video/webm",
        });
        if (!rawBlob.size) {
          if (mounted.current) {
            transition("ready");
            setError("No footage was captured. Please try again.");
            reportError("recording", new Error("No footage was captured."));
          }
          return;
        }
        try {
          let blob = rawBlob;
          let duration = elapsed;
          let needsRepair = false;
          try {
            const finalized = await finalizeMp4(rawBlob, elapsed);
            blob = finalized.blob;
            if (finalized.duration != null) duration = finalized.duration;
          } catch (repairError) {
            needsRepair = true;
            reportError("mp4-finalization", repairError);
            callbacks.current.alert(
              `Video finalization needs attention: ${repairError.message} The original recording was saved in your library.`,
            );
          }
          const { mediaDuration, ...metadata } = await inspectRecording(blob);
          if (!needsRepair && (!/^video\/mp4(?:;|$)/i.test(blob.type)) && mediaDuration > 0)
            duration = mediaDuration;
          const verified = Boolean(metadata.width && metadata.height);
          callbacks.current.onDiagnostics?.("export", {
            width: metadata.width ?? null,
            height: metadata.height ?? null,
            portrait: verified && metadata.width * 16 === metadata.height * 9,
            mimeType: blob.type,
            bytes: blob.size,
            duration,
            averageFileBitsPerSecond:
              duration > 0 ? Math.round((blob.size * 8) / duration) : null,
            durationSource:
              needsRepair ? "unverified capture timer" : "finalized media timeline",
            needsRepair,
            microphoneLevels,
          });
          const item = {
            id: crypto.randomUUID(),
            title: `${recordingScript?.title || "Unscripted"} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            scriptId: recordingScript?.id || "",
            scriptTitle: recordingScript?.title || "",
            created: Date.now(),
            duration,
            blob,
            ...metadata,
            verified,
            needsRepair,
          };
          await callbacks.current.onRecorded(item);
        } catch (error) {
          reportError("export", error);
          callbacks.current.alert(
            "Could not finish processing the take. Please keep this page open.",
          );
        } finally {
          if (mounted.current)
            transition(
              source.current?.getVideoTracks()[0]?.readyState === "live"
                ? "ready"
                : "error",
            );
        }
      };
      offset.current = 0;
      if (scroll.current) scroll.current.scrollTop = 0;
      setElapsed(0);
      setPlaying(true);
      setControls(false);
      transition("recording");
    } catch (e) {
      stopMeter.current?.();
      stopMeter.current = null;
      output.current?.cleanup();
      output.current = null;
      reportError("recording", e);
      setError(mediaError(e));
      transition(source.current ? "ready" : "error");
    }
  }
  async function prepareRecording() {
    if (stateRef.current !== "ready") return;
    transition("countdown");
    let status;
    try {
      status = await storageStatus();
    } catch {
      callbacks.current.alert(
        "Storage capacity could not be checked. Download your take immediately afterward.",
      );
    }
    if (stateRef.current !== "countdown" || !mounted.current) return;
    if (status?.low)
      callbacks.current.alert(
        "Storage is low. Keep this take short and download it immediately afterward.",
      );
    const seconds = Number(callbacks.current.settings.countdown);
    setCount(seconds);
    if (!seconds) return beginRecording();
    let remaining = seconds;
    timer.current = setInterval(() => {
      remaining--;
      setCount(remaining);
      if (remaining <= 0) {
        clearInterval(timer.current);
        timer.current = null;
        beginRecording();
      }
    }, 1000);
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let remembered = false;
    try {
      remembered = localStorage.getItem("prompterson-camera-intro-complete") === "1";
    } catch {
      // Permission checks still work when browser storage is unavailable.
    }
    cameraPermission().then((permission) => {
      if (cancelled) return;
      setIntroComplete(remembered || permission === "granted");
      setCheckingAccess(false);
      if (permission === "granted" || (permission === "unknown" && remembered)) {
        enable();
      } else if (permission === "denied") {
        setError(mediaError({ name: "NotAllowedError" }));
        transition("error");
      }
    });
    const interrupted = () => {
      if (document.visibilityState === "hidden") {
        cancelCountdown();
        if (stateRef.current === "recording") {
          callbacks.current.alert(
            "Recording stopped because the app was backgrounded. Your take is being saved.",
          );
          stopRecording();
        }
      } else if (source.current && navigator.wakeLock)
        navigator.wakeLock
          .request("screen")
          .then((lock) => {
            wake.current = lock;
          })
          .catch(() => {});
    };
    const pagehide = () => {
      cancelCountdown();
      stopRecording();
      stopTracks();
    };
    document.addEventListener("visibilitychange", interrupted);
    window.addEventListener("pagehide", pagehide);
    return () => {
      cancelled = true;
      mounted.current = false;
      generation.current++;
      clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopMeter.current?.();
      stopMeter.current = null;
      output.current?.cleanup();
      stopTracks();
      wake.current?.release().catch(() => {});
      document.removeEventListener("visibilitychange", interrupted);
      window.removeEventListener("pagehide", pagehide);
      callbacks.current.onState("idle");
    };
  }, []);
  useEffect(() => {
    if (state === "ready" && navigator.wakeLock && !wake.current)
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (mounted.current) wake.current = lock;
          else lock.release();
        })
        .catch(() => {});
  }, [state]);
  useEffect(() => {
    if (state !== "recording") return;
    const interval = setInterval(
      () => setElapsed((performance.now() - started.current) / 1000),
      250,
    );
    const storageTimer = setInterval(
      () =>
        storageStatus()
          .then((s) => {
            if (s.low && stateRef.current === "recording") {
              callbacks.current.alert(
                "Recording stopped because storage is low. Download this take now.",
              );
              stopRecording();
            }
          })
          .catch(() => {}),
      15000,
    );
    return () => {
      clearInterval(interval);
      clearInterval(storageTimer);
    };
  }, [state]);
  useEffect(() => {
    offset.current = 0;
    if (scroll.current) scroll.current.scrollTop = 0;
    setPlaying(false);
  }, [script?.id]);
  useEffect(() => {
    if (!playing || !script) return;
    let frame, last;
    const tick = (time) => {
      if (last !== undefined && scroll.current) {
        offset.current += (Math.min(time - last, 80) * settings.speed) / 1000;
        scroll.current.scrollTop = offset.current;
        if (
          scroll.current.scrollTop >=
          scroll.current.scrollHeight - scroll.current.clientHeight - 1
        ) {
          setPlaying(false);
          return;
        }
      }
      last = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, script, settings.speed]);
  const drag = useRef(null);
  const promptMinHeight =
    44 + Math.max(64, Math.ceil(settings.size * 1.45) + 10);
  function savePosition(next) {
    setPosition(next);
    updateSettings({ position: next });
  }
  function adjustPosition(e) {
    const gesture = drag.current;
    if (gesture?.pointerId !== e.pointerId || !gesture.travel) return;
    gesture.latest = Math.max(
      0,
      Math.min(
        POSITION_MAX,
        gesture.position +
          ((e.clientY - gesture.y) * POSITION_MAX) / gesture.travel,
      ),
    );
    setPosition(gesture.latest);
  }
  function finishDrag(e) {
    if (drag.current?.pointerId !== e.pointerId) return;
    const { latest } = drag.current;
    drag.current = null;
    savePosition(latest);
  }
  const recording = state === "recording";
  const scrollToggle = (
    <button
      className="scroll-toggle"
      aria-label={playing ? "Pause scrolling" : "Start scrolling"}
      disabled={!script}
      onClick={() => {
        offset.current = scroll.current?.scrollTop || 0;
        setPlaying(!playing);
      }}
    >
      {playing ? <Pause size={19} /> : <Play size={19} />}
    </button>
  );
  const recordButton = (
    <button
      className={`record-button ${recording ? "recording" : ""}`}
      aria-label={recording ? "Stop recording" : "Start recording"}
      disabled={state !== "ready" && !recording}
      onClick={recording ? stopRecording : prepareRecording}
    >
      <span />
    </button>
  );
  return (
    <main className="camera-stage">
      <div className="camera-frame">
        <video
          ref={video}
          className={`camera-preview ${settings.mirror && front ? "mirrored" : ""}`}
          style={{ "--framing-scale": framingScale(settings.framing) }}
          onResize={() => {
            const take = output.current;
            if (
              stateRef.current === "recording" &&
              take?.path === "native" &&
              (video.current.videoWidth !== take.width ||
                video.current.videoHeight !== take.height)
            ) {
              reportError(
                "recording",
                new Error("Camera orientation changed during capture."),
              );
              callbacks.current.alert(
                "Camera orientation changed. Saving the current take.",
              );
              stopRecording();
            }
          }}
          autoPlay
          muted
          playsInline
        />
      </div>
      <div className="camera-vignette" />
      {source.current && (
        <div
          className="prompter-lane"
          style={{
            "--prompt-progress": position / POSITION_MAX,
            "--prompt-travel-cap": `${PROMPT_TRAVEL * 100}dvh`,
            "--prompt-min-height": `${promptMinHeight}px`,
          }}
        >
          <div className="prompter-area">
            <div
              className="prompter-panel"
              style={{ background: `rgba(0,0,0,${settings.opacity / 100})` }}
            >
              <div
                className="prompter-scroll"
                ref={scroll}
                onWheel={() => {
                  setPlaying(false);
                  offset.current = scroll.current.scrollTop;
                }}
                onTouchStart={() => setPlaying(false)}
                onTouchEnd={() => {
                  offset.current = scroll.current.scrollTop;
                }}
                style={{
                  fontSize: settings.size,
                  textAlign: settings.alignment,
                }}
              >
                {script?.content ||
                  "Your words belong here.\n\nSelect a script, or record a spontaneous moment."}
                <div className="reading-space" />
              </div>
              <button
                className="drag-handle"
                aria-label="Drag text panel vertically"
                title="Drag to move the script, or use the arrow keys"
                onPointerDown={(e) => {
                  if (!e.isPrimary) return;
                  const lane = e.currentTarget.closest(".prompter-lane");
                  const stage = lane.closest(".camera-stage");
                  const travel = Math.max(
                    0,
                    Math.min(
                      stage.clientHeight * PROMPT_TRAVEL,
                      lane.clientHeight - promptMinHeight,
                    ),
                  );
                  drag.current = {
                    pointerId: e.pointerId,
                    y: e.clientY,
                    position,
                    latest: position,
                    travel,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={adjustPosition}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onLostPointerCapture={finishDrag}
                onKeyDown={(e) => {
                  const next = {
                    ArrowUp: Math.max(0, position - 1),
                    ArrowDown: Math.min(POSITION_MAX, position + 1),
                    Home: 0,
                    End: POSITION_MAX,
                  }[e.key];
                  if (next === undefined) return;
                  e.preventDefault();
                  savePosition(next);
                }}
              >
                <GripHorizontal size={23} />
              </button>
            </div>
          </div>
        </div>
      )}
      {!source.current && !checkingAccess && !error && (
        <div className="camera-intro">
          {!introComplete && (
            <>
              <span className="camera-intro-icon">
                <img src={mascot} alt="Mr. Prompterson" />
              </span>
              <p className="eyebrow">{attribution}</p>
              <h1>{productName}</h1>
              <p>{tagline}</p>
            </>
          )}
          <button
            className="primary-button"
            onClick={() => enable()}
            disabled={state === "requesting"}
          >
            <Camera size={18} />
            {state === "requesting" ? "Opening camera…" : "Enable camera & mic"}
          </button>
          {!introComplete && <small>Camera and microphone access stay on your device.</small>}
        </div>
      )}
      {error && (
        <div className="camera-error" role="alert">
          <span>{error}</span>
          <button onClick={() => enable()} disabled={busy(state)}>
            Try again
          </button>
          <button
            aria-label="Dismiss camera error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {controls && !busy(state) && (
        <div className="camera-settings">
          <div className="camera-settings-heading">
            <strong>Your reading rhythm</strong>
            <button
              aria-label="Close studio controls"
              onClick={() => setControls(false)}
            >
              <X size={18} />
            </button>
          </div>
          {[
            ["Text size", "size", 20, 64, "px"],
            ["Speed", "speed", 5, 100, "px/s"],
            ["Background", "opacity", 0, 90, "%"],
          ].map(([label, key, min, max, unit]) => (
            <label className="range-label" key={key}>
              <span>
                {label}
                <strong>
                  {settings[key]} {unit}
                </strong>
              </span>
              <input
                aria-label={label}
                type="range"
                min={min}
                max={max}
                value={settings[key]}
                onChange={(e) =>
                  updateSettings({ [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label className="range-label">
            <span>
              Panel position<strong>{Math.round(position)}%</strong>
            </span>
            <input
              type="range"
              min={0}
              max={POSITION_MAX}
              value={position}
              onChange={(e) => savePosition(Number(e.target.value))}
            />
          </label>
          <label className="select-label">
            Recording framing
            <select
              disabled={busy(state)}
              value={settings.framing}
              onChange={(e) => updateSettings({ framing: e.target.value })}
            >
              <option value="standard">Standard</option>
              <option value="close-up">Close-Up</option>
            </select>
          </label>
          <label className="select-label">
            Camera
            <select
              disabled={busy(state)}
              value={settings.deviceId}
              onChange={(e) => {
                const patch = { deviceId: e.target.value };
                updateSettings(patch);
                enable(patch);
              }}
            >
              <option value="">
                {settings.facing === "user"
                  ? "Front camera (default)"
                  : "Back camera (default)"}
              </option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || "Camera"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {source.current && !busy(state) && (
        <div className="camera-tools">
          <button
            aria-label="Switch camera"
            disabled={busy(state)}
            onClick={() => {
              const patch = {
                facing: front ? "environment" : "user",
                deviceId: "",
              };
              updateSettings(patch);
              enable(patch);
            }}
          >
            <SwitchCamera size={22} />
          </button>
          <div className="reading-tools">
            {scrollToggle}
            <button
              aria-label="Restart script"
              onClick={() => {
                offset.current = 0;
                scroll.current.scrollTop = 0;
              }}
            >
              <RotateCcw size={18} />
            </button>
            <button
              aria-label="Adjust teleprompter"
              onClick={() => setControls(!controls)}
            >
              <SlidersHorizontal size={19} />
            </button>
          </div>
          <button
            aria-label="Select script"
            title={script?.title || "Select script"}
            onClick={choose}
          >
            <AlignLeft size={22} />
          </button>
        </div>
      )}
      {recording ? (
        <div className="active-recording-controls">
          <span className="record-timer">● REC {formatTime(elapsed)}</span>
          <div className="record-actions">
            {scrollToggle}
            {recordButton}
          </div>
        </div>
      ) : state === "saving" ? (
        <p className="active-recording-controls record-caption" role="status">
          Saving your take…
        </p>
      ) : state !== "countdown" && source.current ? (
        <div className="record-controls">
          {recordButton}
          <small>{resolution}</small>
        </div>
      ) : null}
      {state === "countdown" && (
        <div className="countdown-overlay">
          <strong>{count || "Go"}</strong>
          <button className="secondary-button" onClick={cancelCountdown}>
            Cancel countdown
          </button>
        </div>
      )}
    </main>
  );
}
