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
  expect(manifest.icons).toHaveLength(3);
  for (const icon of manifest.icons)
    expect((await page.request.get(`/${icon.src}`)).ok()).toBe(true);
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
  await page.reload();
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
