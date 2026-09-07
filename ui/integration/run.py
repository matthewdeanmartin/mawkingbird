"""Run the Angular HTTP integration suite against the isolated PyPI package."""

from __future__ import annotations

import importlib.metadata
import os
import shutil
import subprocess
from pathlib import Path

import mastodon_mock
from mastodon_mock.testing import MockServer


def main() -> int:
    """Start a disposable server, run the client tests, and always stop it."""
    ui = Path(__file__).resolve().parents[1]
    distribution = importlib.metadata.distribution("mastodon-mock")
    package_path = Path(mastodon_mock.__file__).resolve()
    if distribution.read_text("direct_url.json") is not None:
        raise RuntimeError(
            "Integration tests require the PyPI wheel, not a direct/local install"
        )
    if package_path.is_relative_to(ui.parent.parent):
        raise RuntimeError(f"Refusing a workspace package: {package_path}")
    expected = (ui / "integration/requirements.txt").read_text().split("==")[-1].strip()
    if distribution.version != expected:
        raise RuntimeError(
            f"Expected mastodon-mock {expected}, got {distribution.version}"
        )
    node = shutil.which("node")
    if node is None:
        raise RuntimeError(
            "Node.js is required; run this command from Git Bash on Windows"
        )
    print(f"PyPI mastodon-mock {distribution.version}: {package_path}", flush=True)
    with MockServer() as server:
        print(f"Disposable mock server: {server.base_url}", flush=True)
        result = subprocess.run(
            [
                node,
                str(ui / "node_modules/@angular/cli/bin/ng.js"),
                "run",
                "ui:integration",
            ],
            cwd=ui,
            env={**os.environ, "MASTODON_MOCK_URL": server.base_url},
            check=False,
        )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
