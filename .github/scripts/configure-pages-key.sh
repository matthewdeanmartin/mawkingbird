#!/usr/bin/env bash
set -euo pipefail
: "${PAGES_DEPLOY_KEY:?Set MASTODON_MOCK_PAGES_DEPLOY_KEY before enabling publishing}"
key="$RUNNER_TEMP/production-pages-key"
known_hosts="$RUNNER_TEMP/github-known-hosts"
printf '%s\n' "$PAGES_DEPLOY_KEY" > "$key"
chmod 600 "$key"
curl --fail --silent --show-error https://api.github.com/meta \
  | jq --raw-output '.ssh_keys[] | "github.com " + .' > "$known_hosts"
echo "GIT_SSH_COMMAND=ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts" >> "$GITHUB_ENV"
