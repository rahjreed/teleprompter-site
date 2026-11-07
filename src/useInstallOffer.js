import { useEffect, useState } from "react";

function manualInstructions(ua, isIOS, isAndroid) {
  if (isIOS) {
    if (/CriOS\//i.test(ua)) {
      return "In Chrome, tap Share in the address bar, then Add to Home Screen and Add.";
    }
    if (/Version\/.*Safari\//i.test(ua)) {
      return "In Safari, open Share (or Page Menu → Share), then tap Add to Home Screen. Turn on Open as Web App if shown, then tap Add.";
    }
    return "Choose Add to Home Screen in your browser’s Share menu if available. You can also open this page in Safari and use Share → Add to Home Screen.";
  }

  if (isAndroid) {
    if (/SamsungBrowser\//i.test(ua)) {
      return "In Samsung Internet, tap the + icon in the address bar if shown, or open Menu → Add page to → Home screen.";
    }
    if (/Chrome\//i.test(ua) && !/EdgA\/|OPR\/|; wv\)/i.test(ua)) {
      return "In Chrome, open More (⋮) → Add to Home screen → Install. If you see Install app in the menu, choose it directly.";
    }
    return "Open your Android browser’s menu and choose Install app or Add to Home screen if available.";
  }

  if (/Edg\//i.test(ua)) {
    return "In Edge, select the install icon in the address bar if available, then choose Install.";
  }
  if (/Chrome\//i.test(ua) && !/OPR\/|Vivaldi\//i.test(ua)) {
    return "In Chrome, open More → Cast, save, and share → Install page as app, or use the install icon in the address bar if available.";
  }
  if (/Macintosh/i.test(ua) && /Version\/(?:1[7-9]|[2-9]\d)\b.*Safari\//i.test(ua)) {
    return "In Safari on macOS Sonoma or later, choose Share → Add to Dock, then click Add.";
  }
  if (/Windows/i.test(ua) && Number(ua.match(/Firefox\/(\d+)/i)?.[1]) >= 143) {
    return "In Firefox, click the web apps button in the address bar if available.";
  }
  return "";
}

export function useInstallOffer() {
  // Keep the section absent until the current display mode has been checked.
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua) || navigator.userAgentData?.platform === "Android";
    const instructions = manualInstructions(ua, isIOS, isAndroid);
    const appModes = ["standalone", "minimal-ui", "window-controls-overlay"].map(
      (mode) => window.matchMedia(`(display-mode: ${mode})`),
    );
    const fullscreen = window.matchMedia("(display-mode: fullscreen)");
    const displayQueries = [...appModes, fullscreen];
    let confirmedHere = false;
    let pendingPrompt = null;

    function isInstalled() {
      return confirmedHere || navigator.standalone === true ||
        appModes.some((query) => query.matches) ||
        (fullscreen.matches && !document.fullscreenElement);
    }

    function refresh() {
      const installed = isInstalled();
      if (installed) pendingPrompt = null;
      if (installed || (!pendingPrompt && !instructions)) {
        setOffer(null);
      } else {
        setOffer({ instructions, install: pendingPrompt ? install : null });
      }
    }

    async function install() {
      if (!pendingPrompt || isInstalled()) return;
      const event = pendingPrompt;
      pendingPrompt = null;
      refresh();
      try {
        await event.prompt();
      } catch {
        // This event is single-use. Manual instructions remain available.
      }
    }

    function capturePrompt(event) {
      if (isInstalled() || typeof event.prompt !== "function") return;
      event.preventDefault();
      pendingPrompt = event;
      refresh();
    }

    function confirmInstall() {
      // Confirmation belongs to this page. A separate tab has its own signals.
      confirmedHere = true;
      refresh();
    }

    if (!isIOS) window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", confirmInstall);
    const lifecycle = [
      [window, "pageshow"],
      [window, "focus"],
      [document, "visibilitychange"],
      [document, "resume"],
      [document, "fullscreenchange"],
    ];
    for (const [target, event] of lifecycle) target.addEventListener(event, refresh);
    for (const query of displayQueries) {
      if (query.addEventListener) query.addEventListener("change", refresh);
      else query.addListener(refresh);
    }
    refresh();

    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", confirmInstall);
      for (const [target, event] of lifecycle) target.removeEventListener(event, refresh);
      for (const query of displayQueries) {
        if (query.removeEventListener) query.removeEventListener("change", refresh);
        else query.removeListener(refresh);
      }
    };
  }, []);

  return offer;
}
