# Mawkingbird Native source mirror

This directory is copied from the private `mawkingbird_native` development
checkout. Changes here will be overwritten by the next source deployment.

The shared Angular app is in `../ui`. From this directory, use Git Bash:

```sh
cd ../ui && npm ci
cd ../native && MAWKINGBIRD_SOURCE=.. make frontend
make check-host
make test-host
make build-host
```

The frontend build currently records development provenance. Release build and
distribution gates still need to be defined in this public repository.
