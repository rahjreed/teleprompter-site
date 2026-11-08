#!/usr/bin/env bash
set -euo pipefail

: "${VERCEL_TOKEN:?Set the production Vercel token}"
: "${VERCEL_ORG_ID:?Set the Vercel organization ID}"
: "${VERCEL_PROJECT_ID:?Set the Vercel project ID}"
live_url=https://teleprompter.callistadigital.com/release.json
live=$(mktemp)
trap 'rm -f "$live"' EXIT
commit=$(git rev-parse HEAD)
git fetch origin --tags

read_live() {
  local status
  status=$(curl --silent --show-error --max-time 20 --output "$live" --write-out '%{http_code}' \
    "$live_url?check=$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")
  case "$status" in
    200) ;;
    404) printf 'null\n' > "$live" ;;
    *) echo "Production release metadata returned HTTP $status" >&2; return 1 ;;
  esac
}

read_live
plan=$(node scripts/plan-production.mjs "$live")
source /dev/stdin <<< "$plan"
if [[ "$published" == true ]]; then
  echo "Version $version is already live for $commit."
  exit 0
fi

vc() {
  npx --yes vercel@48 "$@" --token "$VERCEL_TOKEN"
}

deployment=$(vc deploy --yes --prod --skip-domain \
  --build-env "PROMPTER_RELEASE_VERSION=$version" \
  --build-env "PROMPTER_RELEASE_COMMIT=$commit")
if [[ "$assigned" == false ]]; then
  git tag "$tag" "$commit"
  git push origin "refs/tags/$tag"
fi
vc promote "$deployment" --yes

for attempt in {1..12}; do
  if read_live && node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const [path, version, commit] = process.argv.slice(1);
    const release = JSON.parse(readFileSync(path, "utf8"));
    if (release?.version !== version || release.commit !== commit || release.channel !== "production") process.exit(1);
  ' "$live" "$version" "$commit"; then
    echo "Version $version ($commit) is live."
    exit 0
  fi
  sleep 5
done
echo "Could not verify production version $version at $live_url" >&2
exit 1
