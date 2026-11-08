import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { baseline } from "./scripts/release-version.mjs";

function buildInfo() {
  const { PROMPTER_RELEASE_VERSION, PROMPTER_RELEASE_COMMIT, VERCEL_ENV, VERCEL_GIT_COMMIT_SHA } = process.env;
  if (PROMPTER_RELEASE_VERSION || PROMPTER_RELEASE_COMMIT) {
    if (VERCEL_ENV === "preview" || !/^1\.[1-9]\d*$/.test(PROMPTER_RELEASE_VERSION) ||
      !/^[a-f0-9]{40}$/.test(PROMPTER_RELEASE_COMMIT)) {
      throw new Error("Invalid production release metadata.");
    }
    return { version: PROMPTER_RELEASE_VERSION, commit: PROMPTER_RELEASE_COMMIT, channel: "production" };
  }
  let commit = VERCEL_GIT_COMMIT_SHA;
  if (!commit) {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      commit = null;
    }
  }
  return { version: baseline, commit, channel: VERCEL_ENV === "preview" ? "preview" : "local" };
}

export default defineConfig(() => {
  const release = buildInfo();
  return {
    define: { __PROMPTER_RELEASE__: JSON.stringify(release) },
    plugins: [
      react(),
      {
        name: "prompterson-release",
        apply: "build",
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "release.json", source: JSON.stringify(release) });
        },
      },
    ],
  };
});
