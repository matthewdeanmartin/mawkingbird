#!/usr/bin/env bash
# Offline integration test; all publishing goes to a new local bare repository.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd -P)"
fixture="$(mktemp -d)"
fixture="$(cd "$fixture" && pwd -P)"
git init --bare "$fixture/remote.git" >/dev/null
git init -b gh-pages "$fixture/seed" >/dev/null
git -C "$fixture/seed" config user.name 'Pages test'
git -C "$fixture/seed" config user.email 'pages-test@example.invalid'
mkdir -p "$fixture/seed/canary" "$fixture/seed/test" "$fixture/build"
printf 'old-root' > "$fixture/seed/index.html"
printf 'mawkingbird.com' > "$fixture/seed/CNAME"
printf 'old-canary' > "$fixture/seed/canary/index.html"
printf 'old-test' > "$fixture/seed/test/index.html"
printf 'canary-shim' > "$fixture/seed/canary.html"
printf 'test-shim' > "$fixture/seed/test.html"
git -C "$fixture/seed" add .
git -C "$fixture/seed" commit -m fixture >/dev/null
git -C "$fixture/seed" remote add origin "$fixture/remote.git"
git -C "$fixture/seed" push origin gh-pages >/dev/null
export GITHUB_REPOSITORY=matthewdeanmartin/mawkingbird
export PUBLISH_REMOTE="$fixture/remote.git"
export GITHUB_SHA=offline-fixture
printf 'new-root' > "$fixture/build/index.html"
printf 'mawkingbird.com' > "$fixture/build/CNAME"
bash "$repo_root/.github/scripts/publish-gh-pages.sh" root "$fixture/build"
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:canary/index.html)" = old-canary
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:test/index.html)" = old-test
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:canary.html)" = canary-shim
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:test.html)" = test-shim
mkdir "$fixture/sub-build"
printf 'new-canary' > "$fixture/sub-build/index.html"
PUBLISH_PUBLIC_BASE=/mawkingbird/canary/ bash "$repo_root/.github/scripts/publish-gh-pages.sh" canary "$fixture/sub-build"
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:index.html)" = new-root
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:CNAME)" = mawkingbird.com
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:test/index.html)" = old-test
git --git-dir="$PUBLISH_REMOTE" show gh-pages:canary.html | grep -F '/mawkingbird/canary/' >/dev/null
printf 'new-test' > "$fixture/sub-build/index.html"
bash "$repo_root/.github/scripts/publish-gh-pages.sh" test "$fixture/sub-build"
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:canary/index.html)" = new-canary
test "$(git --git-dir="$PUBLISH_REMOTE" show gh-pages:test/index.html)" = new-test
if bash "$repo_root/.github/scripts/publish-gh-pages.sh" ../escape "$fixture/build"; then
  echo 'Invalid subpath was accepted' >&2
  exit 1
fi
echo "PASS: root/canary/test preservation, mirror shim, invalid path rejection. Fixture: $fixture"
