# Publishing Mawkingbird Native

The private `mawkingbird_native` repository is the development and test channel.
This public repository contains a reviewed source snapshot and produces the
public, unsigned desktop installers. Website deployment stays independent; only
publishing a `native-v...` GitHub Release starts the desktop distribution job.
Run the commands below from this repository's root.

## Prepare a reviewed snapshot

1. Write the notes with the
   [changelog runbook](NATIVE_CHANGELOG_RUNBOOK.md). They live in
   `NATIVE_CHANGELOG.md` here; the private repo holds a copy. Windows is
   built locally; Actions builds macOS and Linux.
2. Set the same version in the private `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`, and its generated `src-tauri/Cargo.lock`. The public
   workflow checks all three against the `native-v` tag.
3. From the private checkout, run `make deploy-source` to copy the chosen
   source locally into this repository's `native/` mirror. It deletes whatever is
   there, so first make sure nobody edited the mirror: every change in
   `git log <last native-v tag>..HEAD -- native` must also be in the private repo.
   Afterwards, inspect the public diff and compile it as the workflow does
   (`cargo test --locked` in `native/src-tauri`, after a frontend build). A file
   type the script doesn't list is silently left behind. It does not commit or push.
4. Promote the notes to the release version and copy them back:

   ```sh
   alias k='uvx --no-build --from keepachangelog-manager-fork==6.10.1 kaclm --component native'
   k release --override-version 0.1.0 --dry-run --yes
   k release --override-version 0.1.0 --yes   # then restore the introduction
   k validate
   make native-changelog
   RELEASE_TAG=native-v0.1.0 node .github/scripts/check-native-release.mjs
   ```

   Replace `0.1.0` with the reviewed version. `kaclm` manages this changelog
   and its `native-v` tag namespace; it does not edit Tauri or Cargo files.
   After the assets are attached, update the direct installer links in `README.md`
   and `ui/src/app/settings/app/settings-app.ts`; before that they would 404.

5. Review the complete public diff, then commit and push it yourself. The
   source, version files, and numbered changelog section must be on the commit
   selected for the Release. The push refreshes the Native draft Release. No
   workflow commits or pushes code.

## Create and publish the public Release

`.github/workflows/native-draft-release.yml` creates or refreshes a draft on
`main` when Native source, shared UI, or release notes change. It uses the
version in `native/src-tauri/tauri.conf.json` and requires the matching numbered
changelog section. Promote `[Unreleased]` with `kaclm release` and push that
change before publishing the draft. You can also run it manually from Actions.
To refresh the draft locally instead, run:

```sh
kaclm --component native github-release \
  --repository matthewdeanmartin/mawkingbird --version 0.1.0
```

The command needs a GitHub token. Open the draft under **Releases**, check that
its target is the reviewed public commit and its notes clearly say why to
install this update, then publish it manually. This publication runs
`.github/workflows/native-release.yml` for Windows, macOS, and Linux. The
workflow builds from the release tag and attaches `.exe`/`.msi`, `.dmg`, and
Linux installer files directly to the GitHub Release. Action-run artifacts are
only temporary transfer files between build and attachment jobs. The attachment
job also publishes `mawkingbird-native-dependencies.spdx.json`, generated from
the reviewed UI npm and Native Cargo lockfiles. It records application
dependencies, including build dependencies; it is not an inventory of host OS
libraries. GitHub attests each installer with build provenance and this SBOM.
To verify a downloaded installer against this repository's attestations, run:

```sh
gh attestation verify PATH_TO_INSTALLER -R matthewdeanmartin/mawkingbird
gh attestation verify PATH_TO_INSTALLER -R matthewdeanmartin/mawkingbird \
  --predicate-type https://spdx.dev/Document/v2.3
```

The installers are unsigned, so operating systems may show an untrusted-app
warning. There is no store listing or paid entitlement in this release path.
If a build or attachment fails, inspect that workflow run and rerun the failed
job if the release tag already contains the fix. A tag points to a fixed source
commit: changing `main` does not change a rerun of that tag. If a release was
published before the numbered changelog section was committed, preview
`kaclm --component native release-rollback --tag native-vX.Y.Z --repository
matthewdeanmartin/mawkingbird --dry-run`. After reviewing that it targets only
the failed release and tag, remove them with the same command and `--yes`,
commit and push the promoted changelog, then create and publish a new draft for
the same version. This removes the published Release temporarily; do not apply
it to a release with working assets. Verify assets before announcing a release.
