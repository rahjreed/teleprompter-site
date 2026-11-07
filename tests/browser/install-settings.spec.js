import { expect, test } from "@playwright/test";

const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

async function simulateBrowser(page, options) {
  await page.addInitScript(({ ua, mode = "browser", standalone = false, touches = 0 }) => {
    Object.defineProperties(navigator, {
      userAgent: { configurable: true, value: ua },
      userAgentData: { configurable: true, value: undefined },
      maxTouchPoints: { configurable: true, value: touches },
      standalone: { configurable: true, writable: true, value: standalone },
    });
    const matchMedia = window.matchMedia.bind(window);
    const queries = [];
    window.matchMedia = (query) => {
      const display = query.match(/^\(display-mode: ([\w-]+)\)$/)?.[1];
      if (!display) return matchMedia(query);
      const result = new EventTarget();
      Object.defineProperty(result, "matches", { get: () => display === mode });
      queries.push(result);
      return result;
    };
    window.setTestDisplayMode = (next, emitChange = true) => {
      mode = next;
      if (emitChange) queries.forEach((query) => query.dispatchEvent(new Event("change")));
    };
    window.testPromptCalls = 0;
    window.emitTestInstallPrompt = (outcome = "dismissed") => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => {
        window.testPromptCalls++;
        return { outcome };
      };
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
  }, options);
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Make it your studio" })).toBeVisible();
  return page.getByRole("region", { name: "App installation" });
}

const browserCases = [
  { name: "Android Chrome", ua: android, text: /In Chrome, open More.*Add to Home screen.*Install/ },
  { name: "Samsung Internet", ua: android.replace("Chrome/135", "SamsungBrowser/28.0 Chrome/135"), text: /In Samsung Internet.*Add page to.*Home screen/ },
  { name: "iPhone Safari", ua: iphone, text: /In Safari.*Share.*Add to Home Screen/ },
  { name: "iPad Safari with a desktop user agent", ua: mac, touches: 5, text: /In Safari.*Share.*Add to Home Screen/ },
  { name: "iPhone Chrome", ua: iphone.replace("Version/18.0", "CriOS/135.0.0.0"), text: /In Chrome, tap Share.*Add to Home Screen/ },
  { name: "desktop Chrome", ua: desktop, text: /In Chrome.*Install page as app/ },
  { name: "desktop Edge", ua: `${desktop} Edg/135.0.0.0`, text: /In Edge.*install icon/ },
  { name: "macOS Safari", ua: mac, text: /In Safari on macOS.*Add to Dock/ },
];

for (const { name, text, ...options } of browserCases) {
  test(`${name} shows browser-specific manual install instructions`, async ({ page }) => {
    await simulateBrowser(page, options);
    await page.goto("/");
    const section = await openSettings(page);
    await expect(section).toHaveText(text);
    await expect(section.getByRole("button")).toHaveCount(0);
    if (name.startsWith("iPhone") || name.startsWith("iPad")) {
      expect(await page.evaluate(() => window.emitTestInstallPrompt())).toBe(false);
      await expect(section).toHaveText(text);
    }
  });
}

for (const { name, ...options } of [
  { name: "Android standalone", ua: android, mode: "standalone" },
  { name: "iOS standalone", ua: iphone, mode: "standalone" },
  { name: "older iOS home screen", ua: iphone, standalone: true },
  { name: "Android minimal-ui", ua: android, mode: "minimal-ui" },
  { name: "Android installed fullscreen", ua: android, mode: "fullscreen" },
]) {
  test(`${name} omits the installation section on launch and return`, async ({ page }) => {
    await simulateBrowser(page, options);
    await page.goto("/");
    await expect(await openSettings(page)).toHaveCount(0);
    await page.reload();
    await expect(await openSettings(page)).toHaveCount(0);
  });
}

test("Android uses the deferred prompt, falls back after dismissal, and hides on confirmed install", async ({ page }) => {
  await simulateBrowser(page, { ua: android });
  await page.goto("/");
  const section = await openSettings(page);
  const install = section.getByRole("button", { name: "Install App" });
  expect(await page.evaluate(() => window.emitTestInstallPrompt())).toBe(true);
  await install.click();
  expect(await page.evaluate(() => window.testPromptCalls)).toBe(1);
  await expect(install).toHaveCount(0);
  await expect(section).toContainText("In Chrome");

  await page.evaluate(() => window.emitTestInstallPrompt("accepted"));
  await install.click();
  await expect(section).toContainText("In Chrome");
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(section).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(section).toHaveCount(0);

  // A browser-mode return without a fresh signal must not inherit a stale flag.
  await page.reload();
  await expect(await openSettings(page)).toContainText("In Chrome");
});

test("rechecks display mode on changes, foregrounding and restored pages", async ({ page }) => {
  await simulateBrowser(page, { ua: android });
  await page.goto("/");
  const section = await openSettings(page);
  await expect(section).toBeVisible();
  await page.evaluate(() => window.emitTestInstallPrompt());
  await expect(section.getByRole("button", { name: "Install App" })).toBeVisible();
  await page.evaluate(() => window.setTestDisplayMode("minimal-ui"));
  await expect(section).toHaveCount(0);
  await page.evaluate(() => window.setTestDisplayMode("browser"));
  await expect(section).toContainText("In Chrome");

  for (const event of ["visibilitychange", "resume", "pageshow", "focus"]) {
    await page.evaluate((name) => {
      window.setTestDisplayMode("standalone", false);
      const target = name === "pageshow" || name === "focus" ? window : document;
      target.dispatchEvent(new Event(name));
    }, event);
    await expect(section).toHaveCount(0);
    await page.evaluate(() => window.setTestDisplayMode("browser"));
    await expect(section).toBeVisible();
  }
});
