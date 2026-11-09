import { fileName, videoMimeType } from "./media.js";

// A Home Screen iOS app may not honor the synthetic <a download> click used on
// Android. Offer the native iOS share sheet so people can choose Save Video
// or Save to Files without uploading their footage.
export function isAppleMobile(nav = globalThis.navigator) {
  if (!nav) return false;
  return /iPad|iPhone|iPod/i.test(nav.userAgent || "") ||
    (nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1);
}

export async function saveRecordingToDevice(
  video,
  {
    nav = globalThis.navigator,
    documentRef = globalThis.document,
    urlAPI = globalThis.URL,
    FileClass = globalThis.File,
    defer = globalThis.setTimeout,
  } = {},
) {
  const name = fileName(video);
  if (isAppleMobile(nav) && typeof nav.share === "function" &&
      typeof FileClass === "function") {
    const shareData = {
      files: [new FileClass([video.blob], name, { type: videoMimeType(video) })],
    };
    let canShareFile = false;
    try {
      canShareFile = typeof nav.canShare !== "function" || nav.canShare(shareData);
    } catch {
      // Older browsers may throw when asked to share a file.
    }
    if (canShareFile) {
      try {
        await nav.share(shareData);
        return "shared";
      } catch (error) {
        if (error?.name === "AbortError") return "cancelled";
        // A failed async share no longer has a reliable user activation for a
        // download fallback. Ask the user to use Share or Safari instead.
        throw new Error("The iPhone save menu could not open. Try Share or open the app in Safari.");
      }
    }
  }

  // Preserve the existing Android / desktop direct-download behavior.
  const url = urlAPI.createObjectURL(video.blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Do not revoke immediately: mobile browsers may begin download later.
    defer(() => urlAPI.revokeObjectURL(url), 60_000);
  }
  return "download";
}
