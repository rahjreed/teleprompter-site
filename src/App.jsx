import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowUpRight,
  Camera,
  Check,
  Clapperboard,
  Copy,
  Download,
  HardDrive,
  Info,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Video,
  X,
  Share2,
} from "lucide-react";
import { VersionInfo } from "./VersionInfo";
import { usePwaUpdate } from "./usePwaUpdate";
import {
  defaults,
  filterScripts,
  list,
  put,
  remove,
  storageStatus,
} from "./storage";
import { busy, fileName, formatTime, videoMimeType } from "./media";
import { isAppleMobile, saveRecordingToDevice } from "./videoSave";
import CameraView from "./CameraView";
import { useInstallOffer } from "./useInstallOffer";
import {
  attribution,
  mascot,
  productIcon,
  productName,
  tagline,
} from "./brand";

const starter = {
  id: "welcome",
  title: "Your first great take",
  content:
    "You have something worth sharing.\n\nTake a breath. Look into the lens. And talk to one person.\n\nWith Mr. Prompterson, your words are right where you need them. No memorizing. No starting over because you lost your place.\n\nMake this script your own, find your pace, and press record.\n\nShow up as yourself. We’ll keep the words moving.",
  tags: ["Personal"],
  updated: 0,
};
const diagnosticsEnabled =
  new URLSearchParams(window.location.search).get("recordingDiagnostics") ===
  "1";
export function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
export function Range({ label, value, onChange, min, max, unit = "" }) {
  return (
    <label className="range-label">
      <span>
        {label}
        <strong>
          {value}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function Sheet({ title, close, children, wide = false }) {
  const panel = useRef(null),
    closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = panel.current.querySelectorAll(
            "button:not(:disabled),input,textarea,select,a[href]",
          ),
          first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="backdrop" onClick={close}>
      <section
        className={`sheet ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <h2>{title}</h2>
          <IconButton label="Close dialog" onClick={close}>
            <X />
          </IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}
export default function App() {
  const [view, setView] = useState("scripts"),
    [scripts, setScripts] = useState([]),
    [videos, setVideos] = useState([]),
    [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false),
    [storageReady, setStorageReady] = useState(false),
    [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [modal, setModal] = useState(null),
    [editor, setEditor] = useState(null),
    [saveState, setSaveState] = useState("Saved on this device");
  const [selected, setSelected] = useState("welcome"),
    [recordState, setRecordState] = useState("idle"),
    [notice, setNotice] = useState(""),
    [storage, setStorage] = useState({}),
    [newTag, setNewTag] = useState(""),
    [rename, setRename] = useState("");
  const installOffer = useInstallOffer();
  const updateWaiting = usePwaUpdate();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [diagnostics, setDiagnostics] = useState({});
  function recordDiagnostics(section, details) {
    console.info(`[${productName} recording]`, section, details);
    setDiagnostics((previous) =>
      section === "error"
        ? {
            ...previous,
            errors: [...(previous.errors || []), details].slice(-10),
          }
        : { ...previous, [section]: details },
    );
  }
  const revision = useRef(0),
    pendingWrites = useRef(new Set()),
    settingsRef = useRef(defaults);
  const active = scripts.find((s) => s.id === selected);
  function track(promise) {
    pendingWrites.current.add(promise);
    promise
      .finally(() => pendingWrites.current.delete(promise))
      .catch(() => {});
    return promise;
  }
  useEffect(() => {
    let mounted = true;
    Promise.all([list("scripts"), list("videos"), list("preferences")])
      .then(async ([s, v, p]) => {
        if (!mounted) return;
        const pref = p.find((i) => i.id === "settings");
        if (!pref?.initialized && !s.length) {
          await put("scripts", starter);
          s = [starter];
        }
        const next = { ...defaults, ...pref, initialized: true };
        await put("preferences", { ...next, id: "settings" });
        if (mounted) {
          setScripts(s);
          setVideos(v);
          settingsRef.current = next;
          setSettings(next);
          setStorageReady(true);
        }
      })
      .catch(() =>
        setNotice(
          "Local storage could not open. Check browser storage permissions. Changes cannot be saved.",
        ),
      )
      .finally(() => mounted && setReady(true));
    storageStatus()
      .then(setStorage)
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    const unload = (e) => {
      if (
        busy(recordState) ||
        pendingWrites.current.size ||
        videos.some((v) => v.unsaved) ||
        saveState.startsWith("Not saved")
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [recordState, videos, saveState]);
  function updateSettings(patch) {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    track(
      put("preferences", { ...next, id: "settings", initialized: true }),
    ).catch(() =>
      setNotice("Settings could not be saved. Check free storage."),
    );
  }
  async function saveScript(next) {
    const version = ++revision.current;
    setEditor(next);
    setScripts((previous) => [
      ...previous.filter((s) => s.id !== next.id),
      next,
    ]);
    setSaveState("Saving…");
    try {
      await track(put("scripts", next));
      if (version === revision.current) setSaveState("Saved on this device");
    } catch {
      setSaveState("Not saved — storage error");
      setNotice(
        "Your script could not be saved. Keep the editor open and copy your text before leaving.",
      );
    }
  }
  function createScript() {
    saveScript({
      id: crypto.randomUUID(),
      title: "",
      content: "",
      tags: [],
      updated: Date.now(),
    });
  }
  function navigate(next) {
    if (busy(recordState))
      return setNotice(
        "Stop or cancel the recording before leaving the camera.",
      );
    setView(next);
    setSearch("");
  }
  async function onRecorded(video) {
    setVideos((previous) => [video, ...previous]);
    setModal({ type: "play", video });
    try {
      await put("videos", video);
      setVideos((previous) =>
        previous.map((v) => (v.id === video.id ? { ...v, saved: true } : v)),
      );
    } catch {
      setVideos((previous) =>
        previous.map((v) => (v.id === video.id ? { ...v, unsaved: true } : v)),
      );
      setNotice(
        "This take could not be saved locally. Download or share it now before closing this page.",
      );
    }
    storageStatus()
      .then(setStorage)
      .catch(() => {});
  }
  async function download(video) {
    try {
      const result = await saveRecordingToDevice(video);
      if (result === "download" && isAppleMobile()) {
        setNotice("If iPhone opens a video preview, use Share to choose Save Video or Save to Files.");
      }
    } catch (error) {
      setNotice(error.message || "Video could not be saved. Try Share instead.");
    }
  }
  async function deleteItem(store, item) {
    try {
      await remove(store, item.id);
      (store === "scripts" ? setScripts : setVideos)((items) =>
        items.filter((x) => x.id !== item.id),
      );
      setModal(null);
    } catch {
      setNotice("Could not delete. Please try again.");
    }
  }
  const visible = filterScripts(scripts, search, tag).sort(
    (a, b) => b.updated - a.updated,
  );
  return (
    <div
      className={`app ${view === "camera" ? "camera-mode" : ""} ${recordState === "recording" ? "camera-recording" : ""}`}
    >
      {view !== "camera" && (
        <header className="brand-bar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              navigate("scripts");
            }}
          >
            <img className="brand-logo" src={productIcon} alt="" />
            <span className="brand-wordmark">
              <span className="brand-name">{productName}</span>
              <small>{attribution}</small>
            </span>
          </a>
          <div className="brand-right">
            <span className="local-badge">
              <span /> YOUR PRIVATE STUDIO
            </span>
            <IconButton
              label="Settings"
              onClick={() => setModal({ type: "settings" })}
            >
              <Settings size={20} />
            </IconButton>
          </div>
        </header>
      )}
      {view === "scripts" && (
        <main className="library">
          <div className="page-heading">
            <div>
              <p className="eyebrow">WORDS FIRST. CONFIDENCE FOLLOWS.</p>
              <h1>
                Your scripts<span>.</span>
              </h1>
              <p className="subtitle">{tagline}</p>
            </div>
            <button
              className="primary-button desktop-create"
              disabled={!storageReady}
              onClick={createScript}
            >
              <Plus size={18} /> New script
            </button>
          </div>
          {ready &&
            !search &&
            !tag &&
            scripts.every((script) => script.id === starter.id) && (
              <section
                className="product-welcome"
                aria-label={`Welcome to ${productName}`}
              >
                <div>
                  <p className="brand-kicker">Your video teleprompter</p>
                  <h2>Meet {productName}</h2>
                  <p>
                    Put your script by the lens and record at your own pace.
                  </p>
                </div>
                <img
                  src={mascot}
                  alt="Mr. Prompterson, your recording assistant"
                />
              </section>
            )}
          <div className="library-toolbar">
            <label className="search">
              <Search size={20} />
              <input
                aria-label="Search scripts"
                placeholder="Find your next great take…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={16} />
                </button>
              )}
            </label>
            <button
              aria-label="Filter and tags"
              className="filter-button"
              onClick={() => setModal({ type: "tags" })}
            >
              <SlidersHorizontal size={18} />
              <span>Filter & tags</span>
              {tag && <span className="filter-dot" />}
            </button>
          </div>
          <div className="section-meta">
            <div className="chips">
              <button
                className={!tag ? "chip active" : "chip"}
                onClick={() => setTag("")}
              >
                All scripts <span>{scripts.length}</span>
              </button>
              {settings.tags.map((t) => (
                <button
                  key={t}
                  className={tag === t ? "chip active" : "chip"}
                  onClick={() => setTag(tag === t ? "" : t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="autosave">
              <ShieldCheck size={14} /> Saved locally
            </span>
          </div>
          {!ready ? (
            <p className="empty">Opening your studio…</p>
          ) : (
            <div className="script-grid">
              <button
                className="create-card"
                disabled={!storageReady}
                onClick={createScript}
              >
                <span className="create-plus">
                  <Plus size={30} strokeWidth={1.3} />
                </span>
                <strong>A fresh start</strong>
                <span>Write something worth sharing</span>
                <span className="create-caption">
                  CREATE A SCRIPT <ArrowUpRight size={14} />
                </span>
              </button>
              {visible.map((s, index) => (
                <article className="script-card" key={s.id}>
                  <button
                    className="card-open"
                    onClick={() => {
                      setEditor(s);
                      setSaveState("Saved on this device");
                    }}
                  >
                    <span className="card-top">
                      <span className="script-number">
                        SCRIPT {String(index + 1).padStart(2, "0")}
                      </span>
                      <AlignLeft size={17} />
                    </span>
                    <h2>{s.title || "Untitled script"}</h2>
                    <p>{s.content || "Your next idea starts here…"}</p>
                    <span className="card-tags">
                      {s.tags.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </span>
                  </button>
                  <div className="card-footer">
                    <span>
                      {s.content.trim().split(/\s+/).filter(Boolean).length}{" "}
                      words ·{" "}
                      {Math.max(
                        1,
                        Math.ceil(
                          s.content.trim().split(/\s+/).filter(Boolean).length /
                            130,
                        ),
                      )}{" "}
                      min
                    </span>
                    <IconButton
                      label={`Actions for ${s.title || "Untitled script"}`}
                      onClick={() => setModal({ type: "actions", script: s })}
                    >
                      <MoreHorizontal size={20} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
          )}
          {ready && !visible.length && (search || tag) && (
            <p className="empty">
              No scripts match. Try another search or tag.
            </p>
          )}
          <div className="studio-note">
            <span className="note-icon">
              <Sparkles size={20} />
            </span>
            <div>
              <strong>Your voice. Just a little more prepared.</strong>
              <p>
                Write your script, find your rhythm, and make your next take
                your best.
              </p>
            </div>
            <span className="note-line" />
          </div>
          <div className="privacy-note">
            <ShieldCheck size={14} />
            <span>
              Only on this device. No account, no uploads, just you. Clearing
              browser data removes your scripts and videos.
            </span>
          </div>
        </main>
      )}
      {view === "camera" && (
        <CameraView
          script={active}
          settings={settings}
          updateSettings={updateSettings}
          choose={() => setModal({ type: "choose" })}
          onRecorded={onRecorded}
          onState={setRecordState}
          onDiagnostics={diagnosticsEnabled ? recordDiagnostics : undefined}
          alert={setNotice}
        />
      )}
      {view === "videos" && (
        <main className="library">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MADE BY YOU. READY TO SHARE.</p>
              <h1>
                Your takes<span>.</span>
              </h1>
              <p className="subtitle">Good words deserve to be seen.</p>
            </div>
            <span className="count-badge">{videos.length} takes</span>
          </div>
          <div className="storage-note">
            <HardDrive size={18} />
            <span>
              {storage.low
                ? "Storage is low. Download your takes and remove older videos."
                : "Videos stay in this browser. Download a copy — clearing browser data removes local recordings."}
            </span>
            <button
              onClick={async () => {
                try {
                  const granted = await navigator.storage?.persist?.();
                  setNotice(
                    granted
                      ? "Persistent storage granted. Keep downloaded backups too."
                      : "This browser manages storage automatically. Download important takes.",
                  );
                } catch {
                  setNotice(
                    "Storage protection is unavailable. Download important takes.",
                  );
                }
              }}
            >
              Protect storage
            </button>
          </div>
          {!videos.length && (
            <div className="empty-videos">
              <span>
                <Clapperboard size={40} strokeWidth={1.2} />
              </span>
              <h2>Your story starts with a take.</h2>
              <p>Record with a script. Find your videos here.</p>
              <button
                className="primary-button"
                onClick={() => navigate("camera")}
              >
                <Camera size={18} /> Open camera
              </button>
            </div>
          )}
          {[...new Set(videos.map((v) => v.scriptId || "unscripted"))].map(
            (group) => (
              <section key={group} className="video-group">
                <h2>
                  {videos.find((v) => (v.scriptId || "unscripted") === group)
                    ?.scriptTitle || "Unscripted takes"}
                </h2>
                <div className="video-grid">
                  {videos
                    .filter((v) => (v.scriptId || "unscripted") === group)
                    .map((v) => (
                      <article className="video-card" key={v.id}>
                        <button
                          className="thumbnail"
                          aria-label={`Play ${v.title}`}
                          onClick={() => setModal({ type: "play", video: v })}
                        >
                          {v.thumbnail ? (
                            <img src={v.thumbnail} alt="" />
                          ) : (
                            <Video size={32} />
                          )}
                          <span className="play-circle">▶</span>
                          <span className="duration">
                            {formatTime(v.duration)}
                          </span>
                        </button>
                        <div className="video-card-info">
                          <div>
                            <h3>{v.title}</h3>
                            <small>
                              {v.unsaved
                                ? "Not saved — download now"
                                : new Date(v.created).toLocaleDateString()}{" "}
                              ·{" "}
                              {v.verified
                                ? `${v.width} × ${v.height}`
                                : "Dimensions unverified"}
                            </small>
                          </div>
                          <IconButton
                            label={`Video options for ${v.title}`}
                            onClick={() => {
                              setRename(v.title);
                              setModal({ type: "video-actions", video: v });
                            }}
                          >
                            <MoreHorizontal />
                          </IconButton>
                        </div>
                      </article>
                    ))}
                </div>
              </section>
            ),
          )}
        </main>
      )}
      {!busy(recordState) && (
        <nav className="bottom-nav" aria-label="Main navigation">
          <button
            className={view === "scripts" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("scripts")}
          >
            <AlignLeft size={22} />
            <span>Scripts</span>
          </button>
          <button
            className={`camera-nav ${view === "camera" ? "selected" : ""}`}
            aria-label="Open camera"
            onClick={() => navigate("camera")}
          >
            <span>
              <Camera size={25} />
            </span>
            <small>Studio</small>
          </button>
          <button
            className={view === "videos" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("videos")}
          >
            <Clapperboard size={22} />
            <span>Videos</span>
          </button>
        </nav>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <IconButton
            label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </IconButton>
        </div>
      )}
      {updateWaiting && !updateDismissed && !notice && !modal && !editor &&
        view !== "camera" && !busy(recordState) && (
          <div className="toast" role="status">
            <span>Update ready. Close all app windows and reopen when convenient.</span>
            <IconButton label="Dismiss update notification" onClick={() => setUpdateDismissed(true)}>
              <X size={17} />
            </IconButton>
          </div>
        )}
      {editor && !modal && (
        <Sheet
          title="Script editor"
          wide
          close={() => {
            if (!saveState.startsWith("Not saved")) setEditor(null);
            else
              setNotice(
                "Copy your text first, or retry saving with another edit.",
              );
          }}
        >
          <div className="editor-status">
            <span
              className={saveState.startsWith("Not saved") ? "danger-text" : ""}
            >
              <Check size={14} />
              {saveState}
            </span>
            <span>
              {editor.content.trim().split(/\s+/).filter(Boolean).length} words
            </span>
          </div>
          <input
            className="title-input"
            aria-label="Script title"
            placeholder="Give your story a title"
            value={editor.title}
            onChange={(e) =>
              saveScript({
                ...editor,
                title: e.target.value,
                updated: Date.now(),
              })
            }
          />
          <textarea
            className="script-input"
            aria-label="Script content"
            placeholder="What would you like to say?"
            value={editor.content}
            onChange={(e) =>
              saveScript({
                ...editor,
                content: e.target.value,
                updated: Date.now(),
              })
            }
          />
          <div className="editor-tags">
            <Tag size={16} />
            {settings.tags.map((t) => (
              <button
                key={t}
                className={`chip ${editor.tags.includes(t) ? "active" : ""}`}
                onClick={() =>
                  saveScript({
                    ...editor,
                    tags: editor.tags.includes(t)
                      ? editor.tags.filter((x) => x !== t)
                      : [...editor.tags, t],
                    updated: Date.now(),
                  })
                }
              >
                {t}
              </button>
            ))}
            <button className="chip" onClick={() => setModal({ type: "tags" })}>
              <Plus size={14} /> Tag
            </button>
          </div>
          <button
            className="primary-button full"
            disabled={saveState !== "Saved on this device"}
            onClick={() => {
              setSelected(editor.id);
              setEditor(null);
              navigate("camera");
            }}
          >
            <Camera size={18} /> Record with this script
          </button>
        </Sheet>
      )}
      {modal && (
        <Sheet
          title={
            {
              settings: "Make it your studio",
              about: `About ${productName}`,
              tags: "Organize your scripts",
              choose: "Choose your script",
              actions: "Script options",
              "video-actions": "Take options",
              play: modal.video?.title,
              delete: "Delete permanently?",
            }[modal.type]
          }
          close={() =>
            setModal(modal.type === "about" ? { type: "settings" } : null)
          }
          wide={modal.type === "play"}
        >
          {modal.type === "settings" && (
            <div className="settings-list">
              <Range
                label="Default text size"
                min={20}
                max={64}
                value={settings.size}
                unit=" px"
                onChange={(size) => updateSettings({ size })}
              />
              <Range
                label="Scroll speed"
                min={5}
                max={100}
                value={settings.speed}
                unit=" px/s"
                onChange={(speed) => updateSettings({ speed })}
              />
              <Range
                label="Text background"
                min={0}
                max={90}
                value={settings.opacity}
                unit="%"
                onChange={(opacity) => updateSettings({ opacity })}
              />
              <label className="select-label">
                Text alignment
                <select
                  value={settings.alignment}
                  onChange={(e) =>
                    updateSettings({ alignment: e.target.value })
                  }
                >
                  {["left", "center", "right"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="select-label">
                Countdown
                <select
                  value={settings.countdown}
                  onChange={(e) =>
                    updateSettings({ countdown: Number(e.target.value) })
                  }
                >
                  {[0, 3, 5, 10].map((n) => (
                    <option value={n} key={n}>
                      {n ? `${n} seconds` : "Off"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-label">
                Preferred quality
                <select
                  value={settings.quality}
                  onChange={(e) => updateSettings({ quality: e.target.value })}
                >
                  <option value="1080">Full HD · 1080 × 1920</option>
                  <option value="720">HD · 720 × 1280</option>
                </select>
              </label>
              <label className="select-label">
                Recording framing
                <select
                  value={settings.framing}
                  onChange={(e) => updateSettings({ framing: e.target.value })}
                >
                  <option value="standard">Standard</option>
                  <option value="close-up">Close-Up</option>
                </select>
              </label>
              <label className="select-label">
                Microphone
                <select
                  value={settings.microphone}
                  onChange={(e) =>
                    updateSettings({ microphone: e.target.value })
                  }
                >
                  <option value="natural">Natural</option>
                  <option value="voice">Voice Cleanup</option>
                </select>
              </label>
              <label className="select-label">
                Default camera
                <select
                  value={settings.facing}
                  onChange={(e) =>
                    updateSettings({ facing: e.target.value, deviceId: "" })
                  }
                >
                  <option value="user">Front camera</option>
                  <option value="environment">Back camera</option>
                </select>
              </label>
              <label className="select-label">
                Mirror selfie preview
                <input
                  type="checkbox"
                  checked={settings.mirror}
                  onChange={(e) => updateSettings({ mirror: e.target.checked })}
                />
              </label>
              <p className="fine-print">
                Close-Up uses a tighter crop and can lower output resolution.
                Voice Cleanup uses your browser’s microphone processing.
              </p>
              {diagnosticsEnabled && (
                <details className="recording-diagnostics">
                  <summary>Recording diagnostics</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        browser: navigator.userAgent,
                        platform:
                          navigator.userAgentData?.platform ||
                          navigator.platform,
                        ...diagnostics,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
              {installOffer && (
                <section aria-label="App installation">
                  {installOffer.install ? (
                    <button
                      className="primary-button full"
                      onClick={installOffer.install}
                    >
                      Install App
                    </button>
                  ) : (
                    <p className="fine-print">{installOffer.instructions}</p>
                  )}
                </section>
              )}
              <button
                className="option-row"
                onClick={() => setModal({ type: "about" })}
              >
                <Info size={18} /> About {productName}
              </button>
              {updateWaiting && (
                <p className="fine-print" role="status">
                  Update ready. When you finish recording, close all app windows and reopen online.
                </p>
              )}
              <VersionInfo />
            </div>
          )}
          {modal.type === "about" && (
            <div className="product-about">
              <img src={mascot} alt="Illustrated portrait of Mr. Prompterson" />
              <h3>{productName} — Video Teleprompter</h3>
              <p>{tagline}</p>
              <VersionInfo />
            </div>
          )}
          {modal.type === "tags" && (
            <>
              <p className="muted">A little order for all your ideas.</p>
              <form
                className="tag-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newTag.trim();
                  if (name && !settings.tags.includes(name))
                    updateSettings({ tags: [...settings.tags, name] });
                  setNewTag("");
                }}
              >
                <input
                  aria-label="New tag"
                  placeholder="New tag name"
                  maxLength={32}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!newTag.trim()}
                >
                  Add
                </button>
              </form>
              <button
                className="option-row"
                onClick={() => {
                  setTag("");
                  setModal(null);
                }}
              >
                <AlignLeft />
                All scripts{!tag && <Check />}
              </button>
              {settings.tags.map((t) => (
                <button
                  className="option-row"
                  key={t}
                  onClick={() => {
                    setTag(t);
                    setModal(null);
                  }}
                >
                  <Tag size={19} />
                  {t}
                  {tag === t && <Check />}
                </button>
              ))}
            </>
          )}
          {modal.type === "choose" && (
            <>
              <button
                className="option-row"
                onClick={() => {
                  setSelected("");
                  setModal(null);
                }}
              >
                <Camera />
                Record without a script
              </button>
              {scripts.map((s) => (
                <button
                  className="option-row"
                  key={s.id}
                  onClick={() => {
                    setSelected(s.id);
                    setModal(null);
                  }}
                >
                  <AlignLeft />
                  <span>{s.title || "Untitled script"}</span>
                  {selected === s.id && <Check />}
                </button>
              ))}
            </>
          )}
          {modal.type === "actions" && (
            <>
              <button
                className="option-row"
                onClick={() => {
                  setEditor(modal.script);
                  setModal(null);
                }}
              >
                <AlignLeft />
                Edit script
              </button>
              <button
                className="option-row"
                onClick={() => {
                  setSelected(modal.script.id);
                  setModal(null);
                  navigate("camera");
                }}
              >
                <Camera />
                Record with this script
              </button>
              <button
                className="option-row"
                onClick={async () => {
                  const copy = {
                    ...modal.script,
                    id: crypto.randomUUID(),
                    title: `${modal.script.title || "Untitled"} (copy)`,
                    updated: Date.now(),
                  };
                  try {
                    await put("scripts", copy);
                    setScripts((s) => [...s, copy]);
                    setModal(null);
                  } catch {
                    setNotice("Script could not be duplicated. Check storage.");
                  }
                }}
              >
                <Copy />
                Duplicate script
              </button>
              <button
                className="option-row danger-text"
                onClick={() =>
                  setModal({
                    type: "delete",
                    store: "scripts",
                    item: modal.script,
                  })
                }
              >
                <Trash2 />
                Delete script
              </button>
            </>
          )}
          {modal.type === "video-actions" && (
            <>
              <label className="rename-label">
                Take title
                <input
                  value={rename}
                  aria-label="Take title"
                  onChange={(e) => setRename(e.target.value)}
                />
              </label>
              <button
                className="primary-button full"
                disabled={!rename.trim()}
                onClick={async () => {
                  const next = { ...modal.video, title: rename.trim() };
                  try {
                    await put("videos", next);
                    setVideos((v) =>
                      v.map((x) => (x.id === next.id ? next : x)),
                    );
                    setModal(null);
                  } catch {
                    setNotice("Title could not be saved. Check storage.");
                  }
                }}
              >
                Save title
              </button>
              <button
                className="option-row"
                onClick={() => download(modal.video)}
              >
                <Download />
                {isAppleMobile() ? "Save video to iPhone" : "Download video"}
              </button>
              <VideoShareButton
                video={modal.video}
                download={download}
                alert={setNotice}
                option
              />
              <button
                className="option-row danger-text"
                onClick={() =>
                  setModal({
                    type: "delete",
                    store: "videos",
                    item: modal.video,
                  })
                }
              >
                <Trash2 />
                Delete video
              </button>
            </>
          )}
          {modal.type === "delete" && (
            <>
              <p className="muted">
                “{modal.item.title || "Untitled"}” will be removed from this
                device. This cannot be undone.
              </p>
              <button
                className="danger-button full"
                onClick={() => deleteItem(modal.store, modal.item)}
              >
                Delete permanently
              </button>
            </>
          )}
          {modal.type === "play" && (
            <Playback
              video={videos.find((v) => v.id === modal.video.id) || modal.video}
              download={download}
              alert={setNotice}
              recordAgain={view === "camera" ? () => setModal(null) : undefined}
              saving={recordState === "saving"}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}
function Playback({ video, download, alert, recordAgain, saving }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(video.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [video.blob]);
  return (
    <>
      <video className="playback" src={url} controls playsInline />
      <p className="fine-print">
        {video.verified
          ? `${video.width} × ${video.height} verified from saved video`
          : "Export dimensions could not be verified in this browser."}{" "}
        · {formatTime(video.duration)} ·{" "}
        {(video.blob.size / 1024 / 1024).toFixed(1)} MB
      </p>
      {video.verified && video.width * 16 !== video.height * 9 && (
        <p className="fine-print">
          This take’s saved dimensions differ from 9:16.
        </p>
      )}
      {video.unsaved && (
        <p className="fine-print">Not saved locally. Download this take before closing.</p>
      )}
      <div className="button-pair">
        <button className="primary-button" onClick={() => download(video)}>
          <Download size={18} />
          {isAppleMobile() ? "Save to iPhone" : "Download"}
        </button>
        <VideoShareButton video={video} download={download} alert={alert} />
      </div>
      {recordAgain && (
        <button className="secondary-button" onClick={recordAgain} disabled={saving}>
          Record Again
        </button>
      )}
    </>
  );
}

function VideoShareButton({ video, download, alert, option = false }) {
  const name = fileName(video);
  const type = videoMimeType(video);
  const blob = video.blob;
  const file = useMemo(
    () => typeof File === "function" ? new File([blob], name, { type }) : null,
    [blob, name, type],
  );
  const sharing = useRef(false);

  async function share() {
    if (sharing.current) return;
    const data = { files: [file] };
    try {
      if (!file || typeof navigator.share !== "function" ||
          (typeof navigator.canShare === "function" && !navigator.canShare(data))) {
        download(video);
        return;
      }
      sharing.current = true;
      await navigator.share(data);
    } catch (error) {
      if (error.name !== "AbortError") {
        alert("This video could not be shared here. Use Download to save a copy.");
      }
    } finally {
      sharing.current = false;
    }
  }

  return (
    <button className={option ? "option-row" : "secondary-button"} onClick={share}>
      <Share2 size={option ? 24 : 18} />
      {option ? "Share video" : "Share"}
    </button>
  );
}
