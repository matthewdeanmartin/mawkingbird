# Mawkingbird Native source mirror

This directory is copied from the private `mawkingbird_native` development
checkout. Host implementation changes here will be overwritten by the next source deployment.
Release versions are imported from the public changelog before copying.

The shared Angular app is in `../ui`. From this directory, use Git Bash:

```sh
cd ../ui && npm ci
cd ../native && MAWKINGBIRD_SOURCE=.. make frontend
make check-host
make test-host
make build-host
```

Local frontend builds record development provenance. GitHub Actions prepares a
version/changelog overlay from the published source tag and builds the release
installers. See `../ops/NATIVE_RELEASE.md` for automation ownership, warnings and
recovery with a fresh version; do not promote Unreleased locally.
