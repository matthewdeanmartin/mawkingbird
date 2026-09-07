#!/usr/bin/env bash
# Publish a built site into a subtree of this repo's gh-pages branch, leaving
# every other subtree untouched. Used by the canary, test and production
# workflows so they can coexist on one Pages site under one custom domain.
#
# Usage:
#   publish-gh-pages.sh <subpath> <source-dir>
#
#   <subpath>     "root" publishes to the branch root while preserving the
#                 sibling subtrees; "standalone" replaces the entire branch
#                 root; any other value (e.g. "canary") publishes to that subdir.
#   <source-dir>  directory of built static files to publish.
#
# Requires GITHUB_REPOSITORY plus either GITHUB_TOKEN (for this repository) or
# PUBLISH_REMOTE (for an already-authenticated Git remote, such as a deploy-key
# SSH URL). GITHUB_SHA / GITHUB_SERVER_URL are supplied by Actions.
set -euo pipefail

subpath="${1:?usage: publish-gh-pages.sh <subpath> <source-dir>}"
source_dir="${2:?usage: publish-gh-pages.sh <subpath> <source-dir>}"
# Only known site owners may select a directory to replace.
case "$subpath" in
  root|standalone|canary|test) ;;
  *) echo "Unknown publishing subpath: $subpath" >&2; exit 2 ;;
esac
source_dir="$(cd "$source_dir" && pwd -P)"
test -f "$source_dir/index.html"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"

branch="gh-pages"
if [ -n "${PUBLISH_REMOTE:-}" ]; then
  remote="$PUBLISH_REMOTE"
else
  : "${GITHUB_TOKEN:?GITHUB_TOKEN is not set and PUBLISH_REMOTE was not provided}"
  server="${GITHUB_SERVER_URL:-https://github.com}"
  host="${server#https://}"
  remote="https://x-access-token:${GITHUB_TOKEN}@${host}/${GITHUB_REPOSITORY}.git"
fi

# The subtrees a production (`root`) publish must not delete. Every sibling app
# has to be named here: one that is missing gets wiped by the next production
# deploy and only reappears when its own workflow next runs, which for anything
# published on the canary trigger is a window rather than a permanent loss — and
# so is very easy to miss.
#
# `ui/scripts/check-subpath-deployments.mjs` checks the other half of this: that
# the 404 shim knows about every subpath the workflows publish.
PRESERVE=('.git' 'canary' 'canary.html' 'test' 'test.html')

# Build the find(1) exclusions from PRESERVE, so the list above is the only
# place a sibling name is written.
preserve_args=()
for name in "${PRESERVE[@]}"; do
  preserve_args+=(! -name "$name")
done

# One publish attempt: clone the branch, lay this subtree down, push.
#
# Returns 0 on success or when there was nothing to publish, and 1 when the push
# was rejected because someone else moved the branch first — see the retry loop
# below for why that is expected rather than exceptional.
publish_once() {
  local work
  work="$(mktemp -d)"
  # Resolve and check the exact temporary target before recursive replacements.
  work="$(cd "$work" && pwd -P)"
  test -n "$work" && test "$work" != / && test -d "$work"

  git clone --depth 1 --branch "$branch" "$remote" "$work" 2>/dev/null || {
    # First run: the branch doesn't exist yet. Start an empty orphan branch.
    echo "gh-pages branch not found; creating a fresh one."
    git clone --depth 1 "$remote" "$work"
    git -C "$work" checkout --orphan "$branch"
    git -C "$work" rm -rf . >/dev/null 2>&1 || true
  }

  if [ "$subpath" = "root" ]; then
    # Production owns the branch root. Clear every top-level entry except the
    # sibling subtrees and their redirect shims, then lay down the new build.
    find "$work" -mindepth 1 -maxdepth 1 "${preserve_args[@]}" -exec rm -rf {} +
    cp -R "$source_dir/." "$work/"
  elif [ "$subpath" = "standalone" ]; then
    # A mirror site owns the whole publishing branch and has no sibling apps or
    # CNAME to preserve.
    find "$work" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
    cp -R "$source_dir/." "$work/"
  else
    # A named subpath (e.g. canary) owns only its own directory.
    local target="$work/$subpath"
    rm -rf "$target"
    mkdir -p "$target"
    cp -R "$source_dir/." "$target/"

    # Root redirect shim so a bare /<subpath> (no trailing slash) reaches the
    # app. GitHub Pages serves /<subpath>.html for the extensionless path
    # /<subpath> before falling back to the production SPA 404.html at root.
    # Production's root-clear preserves this file by name.
    local public_base="${PUBLISH_PUBLIC_BASE:-/$subpath/}"
    case "$public_base" in
      /*/) ;;
      *) echo "PUBLISH_PUBLIC_BASE must start and end with '/': $public_base" >&2; exit 2 ;;
    esac
    cat > "$work/$subpath.html" <<HTML
<!doctype html>
<meta charset="utf-8">
<title>Redirecting to $public_base</title>
<meta http-equiv="refresh" content="0; url=$public_base">
<link rel="canonical" href="$public_base">
<script>location.replace("$public_base" + location.search + location.hash);</script>
<a href="$public_base">Continue to $public_base</a>
HTML
  fi

  cd "$work"
  touch .nojekyll  # keep Pages from running Jekyll over the static build

  git add --all
  if git diff --cached --quiet; then
    echo "No changes to publish for '$subpath'."
    return 0
  fi

  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git commit -m "Deploy ${subpath}: ${GITHUB_REPOSITORY}@${GITHUB_SHA:-unknown}"

  if git push origin "HEAD:${branch}"; then
    echo "Published '$subpath' to ${branch}."
    return 0
  fi
  return 1
}

# Publish, retrying from a fresh clone when another publisher got there first.
#
# ## Why a retry rather than a lock
#
# Several publishers write to gh-pages and each owns a *disjoint subtree*:
# production owns the root, canary owns /canary/, test owns /test/. GitHub's
# `concurrency:` serializes whole workflow RUNS, not jobs — so two jobs in the
# same workflow (canary and test publish on one trigger) sit outside that lock
# entirely and will race. The loser's push is rejected with "fetch first".
#
# Re-cloning is the right response, and specifically better than rebasing: each
# attempt lays this subtree onto whatever the branch holds *now*, which is
# exactly the merge wanted when subtrees do not overlap. A rebase would replay a
# commit built against a tree that no longer exists.
#
# This does not make overlapping writers safe, and is not meant to. Two
# publishers of the *same* subpath still last-write-wins — which is correct,
# because that is one deployment being published twice.
attempt=1
max_attempts=5
until publish_once; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Failed to publish '$subpath' after ${max_attempts} attempts." >&2
    exit 1
  fi
  # Staggered so two racing jobs do not retry in lockstep forever.
  delay=$(( attempt * 3 + RANDOM % 4 ))
  echo "Push rejected (another publisher moved ${branch}). Retrying in ${delay}s..." >&2
  sleep "$delay"
  attempt=$(( attempt + 1 ))
done
