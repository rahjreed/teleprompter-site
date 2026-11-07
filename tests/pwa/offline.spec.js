import { test, expect } from "@playwright/test";
test("production app installs an offline shell and retrieves scripts offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  const manifest = await page.evaluate(async () =>
    (await fetch("manifest.webmanifest")).json(),
  );
  expect(manifest.name).toBe("Mr. Prompterson");
  expect(manifest.short_name).toBe("Mr. Prompterson");
  expect(manifest.id).toBe("./");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
  const installAssets = await page.evaluate(async () => {
    const manifestUrl = document.querySelector('link[rel="manifest"]').href;
    const manifest = await (await fetch(manifestUrl)).json();
    const iconFiles = await Promise.all(
      manifest.icons.map(async (icon) => {
        const response = await fetch(new URL(icon.src, manifestUrl));
        const bitmap = await createImageBitmap(await response.blob());
        const size = `${bitmap.width}x${bitmap.height}`;
        let mask;
        if (icon.purpose === "maskable") {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          let clippedMarks = 0,
            transparentPixels = 0,
            markPixels = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] !== 255) transparentPixels++;
            // Count the white lines and red record mark outside the 40% safe circle.
            if (data[i] > 170) {
              markPixels++;
              const x = (i / 4) % bitmap.width;
              const y = Math.floor(i / 4 / bitmap.width);
              if (
                Math.hypot(x - bitmap.width / 2, y - bitmap.height / 2) >
                bitmap.width * 0.4
              )
                clippedMarks++;
            }
          }
          mask = { clippedMarks, transparentPixels, markPixels };
        }
        bitmap.close();
        return { size, type: response.headers.get("content-type"), mask };
      }),
    );
    const scope = new URL(manifest.scope, manifestUrl).href;
    const startUrl = new URL(manifest.start_url, manifestUrl).href;
    const registration = await navigator.serviceWorker.ready;
    return {
      iconFiles,
      scope,
      startUrl,
      workerScope: registration.scope,
      secure: isSecureContext,
    };
  });
  expect(installAssets.iconFiles.map((icon) => icon.size)).toEqual(
    manifest.icons.map((icon) => icon.sizes),
  );
  expect(
    installAssets.iconFiles.every((icon) => icon.type?.startsWith("image/png")),
  ).toBe(true);
  const mask =
    installAssets.iconFiles[
      manifest.icons.findIndex((icon) => icon.purpose === "maskable")
    ].mask;
  expect(mask).toMatchObject({ clippedMarks: 0, transparentPixels: 0 });
  expect(mask.markPixels).toBeGreaterThan(1000);
  expect(installAssets.startUrl.startsWith(installAssets.scope)).toBe(true);
  expect(installAssets.workerScope).toBe(installAssets.scope);
  expect(installAssets.secure).toBe(true);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send(
    "Page.getInstallabilityErrors",
  );
  expect(installabilityErrors).toEqual([]);
  await page.getByRole("button", { name: /A fresh start/ }).click();
  await page
    .getByRole("textbox", { name: "Script title" })
    .fill("An offline story");
  await page
    .getByRole("textbox", { name: "Script content" })
    .fill("Still here without a connection.");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await context.setOffline(true);
  await page.goto(installAssets.startUrl);
  await expect(page).toHaveTitle("Mr. Prompterson — Video Teleprompter");
  await expect(
    page.getByRole("heading", { name: "An offline story" }),
  ).toBeVisible();
  const offlineBrand = await page.evaluate(async () => {
    const favicon = await fetch(
      document.querySelector('link[rel="icon"]').href,
    );
    const apple = await fetch(
      document.querySelector('link[rel="apple-touch-icon"]').href,
    );
    const touch = await createImageBitmap(await apple.blob());
    const mascot = await fetch("brand/prompterson/mascot.svg");
    return {
      favicon: favicon.headers.get("content-type"),
      touch: [touch.width, touch.height, apple.headers.get("content-type")],
      mascot: mascot.headers.get("content-type"),
    };
  });
  expect(offlineBrand.favicon).toContain("image/svg+xml");
  expect(offlineBrand.touch).toEqual([180, 180, "image/png"]);
  expect(offlineBrand.mascot).toContain("image/svg+xml");
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).some((key) =>
        /^callista-shell-[a-f0-9]{12}$/.test(key),
      ),
    ),
  ).toBe(true);
});

test("the rebrand keeps data from the existing installation", async ({
  page,
}) => {
  await page.route("**/previous-install", (route) =>
    route.fulfill({
      body: "<p>Previous app fixture</p>",
      contentType: "text/html",
    }),
  );
  await page.goto("/previous-install");
  await page.evaluate(async () => {
    localStorage.setItem("legacy-preference", "kept");
    await caches.open("callista-shell-000000000000");
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("callista-teleprompter", 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        for (const name of ["scripts", "videos", "preferences"]) {
          request.result.createObjectStore(name, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ["scripts", "videos", "preferences"],
          "readwrite",
        );
        tx.objectStore("scripts").put({
          id: "legacy-script",
          title: "Previous script",
          content: "A script from the previous app.",
          tags: [],
          updated: 1,
        });
        tx.objectStore("videos").put({
          id: "legacy-take",
          title: "Previous recording",
          blob: new Blob(["existing recording data"], { type: "video/mp4" }),
          duration: 1,
          created: 1,
        });
        tx.objectStore("preferences").put({
          id: "settings",
          initialized: true,
          size: 45,
          position: 17,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Previous script" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Previous recording" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: /Default text size/ }),
  ).toHaveValue("45");
  const kept = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
    }
    const saved = await new Promise((resolve, reject) => {
      const open = indexedDB.open("callista-teleprompter", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const read = db.transaction(["videos", "preferences"], "readonly");
        const video = read.objectStore("videos").get("legacy-take");
        const settings = read.objectStore("preferences").get("settings");
        read.oncomplete = () => {
          db.close();
          resolve({ video: video.result, position: settings.result.position });
        };
        read.onerror = () => reject(read.error);
      };
    });
    return {
      recording: await saved.video.blob.text(),
      position: saved.position,
      local: localStorage.getItem("legacy-preference"),
      staleShell: await caches.has("callista-shell-000000000000"),
    };
  });
  expect(kept).toEqual({
    recording: "existing recording data",
    position: 17,
    local: "kept",
    staleShell: false,
  });
});
