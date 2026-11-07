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
  expect(manifest.name).toBe("Callista Teleprompter");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toHaveLength(3);
  const installAssets = await page.evaluate(async () => {
    const manifestUrl = document.querySelector('link[rel="manifest"]').href;
    const manifest = await (await fetch(manifestUrl)).json();
    const iconSizes = await Promise.all(
      manifest.icons.map(async (icon) => {
        const response = await fetch(new URL(icon.src, manifestUrl));
        const bitmap = await createImageBitmap(await response.blob());
        const size = `${bitmap.width}x${bitmap.height}`;
        bitmap.close();
        return size;
      }),
    );
    const scope = new URL(manifest.scope, manifestUrl).href;
    const startUrl = new URL(manifest.start_url, manifestUrl).href;
    const registration = await navigator.serviceWorker.ready;
    return {
      iconSizes,
      scope,
      startUrl,
      workerScope: registration.scope,
      secure: isSecureContext,
    };
  });
  expect(installAssets.iconSizes).toEqual(
    manifest.icons.map((icon) => icon.sizes),
  );
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
  await expect(
    page.getByRole("heading", { name: "An offline story" }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).some((key) =>
        /^callista-shell-[a-f0-9]{12}$/.test(key),
      ),
    ),
  ).toBe(true);
});
