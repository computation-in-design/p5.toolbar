#!/usr/bin/env bash
# Bumps the version header in dist/p5.toolbar.js, commits it, and tags the release —
# all in one command, so the file's version string and the git tag can never drift
# apart the way two separate manual steps could.
#
# Usage: scripts/release.sh <version>, e.g. scripts/release.sh 0.3.2
set -euo pipefail

cd "$(dirname "$0")/.."

# Highest existing version tag, by semver order rather than commit date, so the new
# version can be checked against it below.
LATEST=$(git tag --list 'v*' --sort=-v:refname | head -n1)

if [ -z "${1:-}" ]; then
  echo "Usage: scripts/release.sh <version>   (current: ${LATEST:-none})" >&2
  exit 1
fi
VERSION="$1"

if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Version must look like N.N.N (got '${VERSION}')." >&2
  exit 1
fi

if [ -n "$LATEST" ]; then
  LATEST_NUM=${LATEST#v}
  if [ "$VERSION" = "$LATEST_NUM" ]; then
    echo "v${VERSION} is already tagged." >&2
    exit 1
  fi
  # If semver-sorting the pair doesn't leave the new version last, it's not ahead of
  # the current tag — refuse rather than tag out of order.
  if [ "$(printf '%s\n%s\n' "$LATEST_NUM" "$VERSION" | sort -V | tail -n1)" != "$VERSION" ]; then
    echo "v${VERSION} is not newer than the current v${LATEST_NUM} — refusing to tag out of order." >&2
    exit 1
  fi
fi

sed -i '' "s/p5\.toolbar — v[0-9][0-9.]*/p5.toolbar — v${VERSION}/" dist/p5.toolbar.js

git add dist/p5.toolbar.js
git commit -m "Release v${VERSION}"
git tag "v${VERSION}"

echo "Tagged v${VERSION}. Run 'git push && git push --tags' to publish."
