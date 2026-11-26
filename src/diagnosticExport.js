export function diagnosticExport(
  snapshot,
  { build, browser, writerId, exportedAt = new Date().toISOString() },
) {
  const sources = new Map();
  for (const entry of [
    ...(snapshot.events || []),
    ...(snapshot.health?.samples || []),
  ]) {
    const sourceBuild =
      entry.build ||
      (entry.section === "page-load" ? entry.details?.build : null);
    const key = `${entry.writerId || "legacy"}:${sourceBuild?.commit || "unknown"}`;
    sources.set(key, {
      writerId: entry.writerId || null,
      build: sourceBuild,
      attribution: sourceBuild ? "recorded" : "unknown legacy evidence",
    });
  }
  const { build: legacyBuild, browser: legacyBrowser, ...history } = snapshot;
  return {
    ...history,
    ...(legacyBuild ? { legacyBuild } : {}),
    ...(legacyBrowser ? { legacyBrowser } : {}),
    evidenceSources: [...sources.values()],
    browser,
    build,
    exportedAt,
    exporter: { writerId, build },
  };
}
