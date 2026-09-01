#!/usr/bin/env bash
# Bumps the version header in dist/p5.toolbar.js, commits it, and tags the release —
# all in one command, so the file's version string and the git tag can never drift
# apart the way two separate manual steps could.
#
# It does NOT push — that stays a deliberate manual step. The tag is annotated and
# push.followTags is enabled, so the `git push` you run next carries the tag with it;
# no separate `git push --tags`.
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

# One-time local setup so a plain `git push` carries the release tag with it — the tag
# is annotated (below) specifically so push.followTags will pick it up. Harmless to
# re-run; only sets it if unset.
if [ "$(git config --get push.followTags || true)" != "true" ]; then
  git config push.followTags true
fi

git add dist/p5.toolbar.js
git commit -m "Release v${VERSION}"
git tag -a "v${VERSION}" -m "Release v${VERSION}"

echo "Tagged v${VERSION}. Run 'git push' to publish (the tag rides along)."
echo "Then purge jsDelivr's @latest cache:"
echo "  curl -s 'https://purge.jsdelivr.net/gh/computation-in-design/p5.toolbar@latest/dist/p5.toolbar.js' >/dev/null"
