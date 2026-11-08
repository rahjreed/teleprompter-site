import pkg from "../package.json" with { type: "json" };

export const baseline = pkg.version.replace(/\.0$/, "");
export const tagPrefix = "production/v";

export function planRelease(latest, assigned, live, commit) {
  if (latest?.version === live?.version && latest && latest.commit !== live.commit) {
    throw new Error("Live release does not match its production tag.");
  }
  if (assigned) {
    if (assigned.version !== latest.version) {
      throw new Error("This commit belongs to an older release.");
    }
    return { ...assigned, published: live?.version === assigned.version };
  }
  if (latest ? latest.version !== live?.version : live !== null) {
    throw new Error("Live release and tags disagree. Finish the pending release or restore the latest production deployment.");
  }
  const [series, update] = (latest?.version ?? baseline).split(".");
  return { version: `${series}.${BigInt(update) + 1n}`, commit, published: false };
}
