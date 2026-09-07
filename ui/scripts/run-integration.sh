#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Ignore local uv projects/sources and PYTHONPATH; require the released wheel.
uv run --isolated --no-project --no-config \
  --default-index https://pypi.org/simple \
  --no-build-package mastodon-mock \
  --with-requirements integration/requirements.txt \
  python -I integration/run.py
