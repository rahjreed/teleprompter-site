import { productName, attribution } from "./brand";

const release = __PROMPTER_RELEASE__;

export function VersionInfo() {
  return (
    <div className="settings-version fine-print" aria-label="Version information">
      <strong>{productName}</strong>
      <span>Version {release.version}</span>
      <span>{attribution}</span>
      {release.commit && (
        <small title={release.commit}>
          {release.channel === "production" ? "Build" : release.channel === "preview" ? "Preview" : "Local"} {release.commit.slice(0, 8)}
        </small>
      )}
    </div>
  );
}
