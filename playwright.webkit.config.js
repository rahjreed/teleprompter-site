import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";
export default defineConfig({
  ...config,
  testDir: "./tests",
  testMatch: ["browser/*.spec.js", "webkit/*.spec.js"],
  outputDir: "./test-results/webkit",
  grep: /create, autosave|permission denial|settings persist|iPhone WebKit retains/,
  use: { ...config.use, browserName: "webkit", launchOptions: {} },
});
