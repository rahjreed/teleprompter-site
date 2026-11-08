import { useEffect, useState } from "react";

export function usePwaUpdate() {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

    let disposed = false;
    let cleanup;
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" })
      .then((registration) => {
        if (disposed) return;
        let installing;
        const checkWaiting = () =>
          setWaiting(Boolean(registration.waiting && navigator.serviceWorker.controller));
        const watchInstall = () => {
          installing?.removeEventListener("statechange", checkWaiting);
          installing = registration.installing;
          installing?.addEventListener("statechange", checkWaiting);
          checkWaiting();
        };
        const checkForUpdate = () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {});
          }
        };
        watchInstall();
        registration.addEventListener("updatefound", watchInstall);
        navigator.serviceWorker.addEventListener("controllerchange", checkWaiting);
        document.addEventListener("visibilitychange", checkForUpdate);
        window.addEventListener("pageshow", checkForUpdate);
        cleanup = () => {
          installing?.removeEventListener("statechange", checkWaiting);
          registration.removeEventListener("updatefound", watchInstall);
          navigator.serviceWorker.removeEventListener("controllerchange", checkWaiting);
          document.removeEventListener("visibilitychange", checkForUpdate);
          window.removeEventListener("pageshow", checkForUpdate);
        };
      })
      .catch(console.error);

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return waiting;
}
