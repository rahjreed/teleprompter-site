import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  GripHorizontal,
  Mic,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  SwitchCamera,
  X,
} from "lucide-react";
import {
  busy,
  formatTime,
  inspectRecording,
  mediaError,
  portraitStream,
  requestCamera,
  supportedMime,
} from "./media";
import { storageStatus } from "./storage";

export default function CameraView({
  script,
  settings,
  updateSettings,
  choose,
  onRecorded,
  onState,
  alert,
}) {
  const video = useRef(null),
    source = useRef(null),
    recorder = useRef(null),
    output = useRef(null),
    timer = useRef(null),
    mounted = useRef(true),
    generation = useRef(0),
    stateRef = useRef("idle"),
    scroll = useRef(null),
    offset = useRef(0),
    started = useRef(0),
    wake = useRef(null),
    callbacks = useRef({});
  const [state, setState] = useState("idle"),
    [error, setError] = useState(""),
    [count, setCount] = useState(3),
    [elapsed, setElapsed] = useState(0),
    [playing, setPlaying] = useState(false),
    [controls, setControls] = useState(false),
    [position, setPosition] = useState(settings.position ?? 5),
    [devices, setDevices] = useState([]),
    [resolution, setResolution] = useState(""),
    [front, setFront] = useState(true);
  callbacks.current = { onRecorded, onState, alert, settings, script };
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
    if (busy(stateRef.current)) return;
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
      transition("ready");
    } catch (e) {
      if (mounted.current && token === generation.current) {
        stopTracks();
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
      const mimeType = supportedMime();
      output.current = portraitStream(
        video.current,
        source.current,
        callbacks.current.settings.quality,
      );
      if (output.current.width / output.current.height > 0.57)
        callbacks.current.alert(
          "Portrait capture is unavailable in this browser. This take will use the camera’s original dimensions.",
        );
      const capture = new MediaRecorder(output.current.stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 6500000,
        audioBitsPerSecond: 128000,
      });
      recorder.current = capture;
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
        const duration = (performance.now() - started.current) / 1000;
        output.current?.cleanup();
        output.current = null;
        recorder.current = null;
        const blob = new Blob(chunks, {
          type: capture.mimeType || chunks[0]?.type || "video/webm",
        });
        if (!blob.size) {
          if (mounted.current) {
            transition("ready");
            setError("No footage was captured. Please try again.");
          }
          return;
        }
        try {
          const metadata = await inspectRecording(blob);
          const item = {
            id: crypto.randomUUID(),
            title: `${recordingScript?.title || "Unscripted"} · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            scriptId: recordingScript?.id || "",
            scriptTitle: recordingScript?.title || "",
            created: Date.now(),
            duration,
            blob,
            ...metadata,
            verified: Boolean(metadata.width && metadata.height),
          };
          await callbacks.current.onRecorded(item);
        } catch {
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
      started.current = performance.now();
      offset.current = 0;
      if (scroll.current) scroll.current.scrollTop = 0;
      capture.start(1000);
      setElapsed(0);
      setPlaying(true);
      setControls(false);
      transition("recording");
    } catch (e) {
      output.current?.cleanup();
      output.current = null;
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
      mounted.current = false;
      generation.current++;
      clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
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
  function adjustPosition(e) {
    if (!drag.current) return;
    const height = e.currentTarget.closest(".camera-stage").clientHeight;
    setPosition(
      Math.max(
        0,
        Math.min(
          25,
          drag.current.position + ((e.clientY - drag.current.y) / height) * 100,
        ),
      ),
    );
  }
  return (
    <main className="camera-stage">
      <video
        ref={video}
        className={`camera-preview ${settings.mirror && front ? "mirrored" : ""}`}
        autoPlay
        muted
        playsInline
      />
      <div className="camera-vignette" />
      <header className="camera-header">
        <span className="studio-wordmark">
          <img src={`${import.meta.env.BASE_URL}brand/callista-mark.png`} alt="" />
          <small>CALLISTA STUDIO</small>
        </span>
        <span
          className={`camera-status ${state === "recording" ? "live" : ""}`}
        >
          <span />
          {state === "recording"
            ? `REC ${formatTime(elapsed)}`
            : "9:16 · PORTRAIT"}
        </span>
      </header>
      {source.current && (
        <div className="prompter-area" style={{ top: `${position + 9}%` }}>
          <button
            className="script-select"
            disabled={busy(state)}
            onClick={choose}
          >
            {script?.title || "Select a script"}
            <ChevronDown size={15} />
          </button>
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
                height: `min(32dvh, max(64px, calc(${91 - position}dvh - 395px - env(safe-area-inset-bottom))))`,
              }}
            >
              {script?.content ||
                "Your words belong here.\n\nSelect a script, or record a spontaneous moment."}
              <div className="reading-space" />
            </div>
            <button
              className="drag-handle"
              aria-label="Drag text panel vertically"
              onPointerDown={(e) => {
                drag.current = { y: e.clientY, position };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={adjustPosition}
              onPointerUp={() => {
                drag.current = null;
                updateSettings({ position });
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              <GripHorizontal size={23} />
            </button>
          </div>
        </div>
      )}
      {!source.current && (
        <div className="camera-intro">
          <span className="camera-intro-icon">
            <Camera size={36} strokeWidth={1.2} />
          </span>
          <p className="eyebrow">A LITTLE PREP. A GREAT TAKE.</p>
          <h1>
            Ready when
            <br />
            you are<span>.</span>
          </h1>
          <p>
            Your script stays near the lens.
            <br />
            Your words stay out of the video.
          </p>
          <button
            className="gold-button"
            onClick={() => enable()}
            disabled={state === "requesting"}
          >
            <Camera size={18} />
            {state === "requesting" ? "Opening camera…" : "Enable camera & mic"}
          </button>
          <small>Camera and microphone access stay on your device.</small>
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
      {controls && (
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
              max={25}
              value={position}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPosition(next);
                updateSettings({ position: next });
              }}
            />
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
      {source.current && (
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
            <button
              aria-label={playing ? "Pause scrolling" : "Start scrolling"}
              disabled={!script}
              onClick={() => {
                offset.current = scroll.current?.scrollTop || 0;
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
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
          <span className="mic-badge">
            <Mic size={15} />
            <Check size={12} />
          </span>
        </div>
      )}
      <div className="record-controls">
        {state === "recording" && (
          <span className="record-timer">● {formatTime(elapsed)}</span>
        )}
        <button
          className={`record-button ${state === "recording" ? "recording" : ""}`}
          aria-label={
            state === "recording" ? "Stop recording" : "Start recording"
          }
          disabled={!["ready", "recording"].includes(state)}
          onClick={state === "recording" ? stopRecording : prepareRecording}
        >
          <span />
        </button>
        <span className="record-caption">
          {state === "recording"
            ? "STOP RECORDING"
            : state === "saving"
              ? "SAVING YOUR TAKE…"
              : "MAKE IT A GREAT TAKE"}
        </span>
        <small>
          {source.current ? resolution : "PRIVATE. LOCAL. ALL YOURS."}
        </small>
      </div>
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
