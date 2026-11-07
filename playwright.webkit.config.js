import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";
export default defineConfig({
  ...config,
  outputDir: "./test-results/webkit",
  grep: /create, autosave|permission denial|settings persist/,
  use: { ...config.use, browserName: "webkit", launchOptions: {} },
});
