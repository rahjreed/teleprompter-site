import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pwa",
  outputDir: "./test-results/pwa",
  timeout: 30000,
  workers: 1,
  use: { baseURL: "http://localhost:5174", headless: true },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 5174",
    url: "http://localhost:5174",
    reuseExistingServer: true,
  },
});
