# Linux quality builds

Run from Git Bash in mawkingbird_native:

```bash
# Refresh the real shared Angular assets first when shared source changes:
MAWKINGBIRD_SOURCE=../mawkingbird make frontend
bash scripts/build-linux.sh ubuntu
bash scripts/build-linux.sh fedora
```

Docker Desktop must use Linux containers. The builds target linux/amd64 and
export to `dist/linux-ubuntu` and `dist/linux-fedora`. Each output contains the
optimized executable, frontend development provenance, Cargo.lock, ELF metadata,
and resolved shared-library list. These are dynamically linked desktop binaries,
not installers or headless services. The final scratch stage is an export vehicle,
not a runnable container. Run on the corresponding desktop distribution with
WebKitGTK 4.1, GTK3 and OpenSSL installed.

Ubuntu 24.04 LTS covers the Debian family; Fedora 44 covers the independent RPM
family. Both base images and Rust 1.97.1 are pinned to manifest digests. OS package
repositories still move: this is not a bit-for-bit reproducible package snapshot.
Refresh pins and rebuild OS layers periodically for security updates.

## Layer and cache design

1. Distro packages are installed before application input, so source edits cannot
   invalidate the expensive OS dependency layer. BuildKit builds only the selected
   distro stage.
2. Copy the pinned official Rust toolchain independently of application source.
3. Copy Cargo.toml/Cargo.lock and fetch dependencies. The tiny main is only to
   let Cargo recognize a target during fetch; it is never compiled or exported.
4. Copy real Rust source and the separate `frontend` context. `.dockerignore`
   excludes Windows targets, Git history, credentials, specs and unrelated files.
5. Keep Cargo registry downloads and compiled target objects in persistent
   BuildKit caches. Target cache IDs include distro and architecture to avoid ABI
   contamination. Registry caches are also distro-specific so parallel builds do not wait
   on one long-held registry mount. Locked mounts protect same-distro builds. Six Cargo jobs by default
   limit compiler memory pressure; override with BUILD_JOBS.
6. Test in release mode, then build in release mode, reusing the same dependency
   compilation. Export the binary outside the cache mount and fail on unresolved
   dynamic libraries. Unchanged reruns reuse the completed build layer entirely.

BuildKit caches are local to the builder. A clean machine still pays the full
first compile. Do not prune caches routinely. To refresh only distro packages,
use `docker buildx build --no-cache-filter ubuntu ...` (or fedora) with the same
arguments as the script. Source changes reuse object caches without this option.

## Scope

The named frontend context requires `.frontend/browser/index.html` and existing
provenance; no placeholder frontend is accepted. It is an explicit development
snapshot, not a promise that assets match the current shared working tree.
The unit suite skips its declared live OAuth test and Windows-only credential
checks on Linux. GUI startup, desktop keyring integration, installation, signing,
and AppImage/deb/rpm packaging are separate acceptance checks.

The existing RustSec findings in `sprint/07-rust-security-and-distributions.md`
remain unresolved. Security auditing is a separate manual workflow; neither
these local builds nor the distribution workflow depends on its result.

## Initial results (2026-11-14)

Both Ubuntu 24.04 and Fedora 44 completed release-mode tests and executable builds:
**50 passed, zero failed, one intentionally ignored**, with no Rust warnings in
the final builds and no unresolved shared libraries. Logs are retained beside
local binaries as `dist/linux-{ubuntu,fedora}/build.log`.

Final unchanged rebuilds took **1.59 seconds (Ubuntu)** and **1.39 seconds
(Fedora)** on this machine. These are warm BuildKit cache results, not cold build
estimates. The first Ubuntu dependency/test compilation took about three minutes,
plus system package downloads and executable linking.

A Linux-only unused-variable warning was fixed in the shared startup function.
Testing also caught stale application reuse when different source snapshots used
a target cache. The build now touches first-party source and build.rs before
Cargo runs, forcing the application to recompile whenever that Docker step is
invalidated. Dependency artifacts remain cached; unchanged Docker runs still
skip the entire step.

**Next:** launch both binaries on real desktops, check native networking and
keyring integration, then package and installation-test deb/rpm distributions.
