import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { planRelease, tagPrefix } from "./release-version.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
const tags = git("tag", "--list", `${tagPrefix}*`, "--sort=-version:refname")
  .split("\n").filter(Boolean);
if (tags.some((tag) => !/^production\/v1\.[1-9]\d*$/.test(tag))) {
  throw new Error("Invalid production release tag.");
}
const record = (tag) => tag ? {
  version: tag.slice(tagPrefix.length),
  commit: git("rev-list", "-1", tag),
} : null;
const latest = record(tags[0]);
const assigned = record(tags.find((tag) => git("rev-list", "-1", tag) === commit));
const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (live !== null && (live.channel !== "production" ||
    !/^1\.[1-9]\d*$/.test(live.version) || !/^[a-f0-9]{40}$/.test(live.commit))) {
  throw new Error("Invalid live production metadata.");
}
if (latest && !assigned) git("merge-base", "--is-ancestor", latest.commit, commit);
const release = planRelease(latest, assigned, live, commit);
console.log(`version=${release.version}`);
console.log(`tag=${tagPrefix}${release.version}`);
console.log(`assigned=${Boolean(assigned)}`);
console.log(`published=${release.published}`);
