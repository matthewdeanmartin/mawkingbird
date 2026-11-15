#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
distro=${1:-ubuntu}
case "$distro" in ubuntu|fedora) ;; *) echo 'Usage: bash scripts/build-linux.sh [ubuntu|fedora]' >&2; exit 2;; esac
# Prevent Git Bash from rewriting Linux paths in Docker arguments.
export MSYS_NO_PATHCONV=1
mkdir -p "dist/linux-$distro"
docker buildx build --platform linux/amd64 --progress plain \
  --build-arg "DISTRO=$distro" --build-arg "BUILD_JOBS=${BUILD_JOBS:-6}" \
  --build-context frontend=.frontend --target artifacts \
  --output "type=local,dest=dist/linux-$distro" .
