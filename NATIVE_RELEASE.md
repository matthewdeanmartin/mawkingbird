# Publishing Mawkingbird Native

The private `mawkingbird_native` repository is the development and test channel.
This public repository contains a reviewed source snapshot and produces the
public, unsigned desktop installers. Website deployment stays independent; only
publishing a `native-v...` GitHub Release starts the desktop distribution job.

## Prepare a reviewed snapshot

1. Test the private Native build on the platforms you intend to release. Write
   the release notes yourself in the private Native changelog. Lead with what
   users can now do or why updating helps; keep implementation chores out of the
   public notes unless they affect users.
2. Set the same version in the private `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`, and its generated `src-tauri/Cargo.lock`. The public
   workflow checks all three against the `native-v` tag. Version `0.1.0` is
   already present for the first release.
3. From the private checkout, run `make deploy-source` to copy the chosen
   source locally into this repository's `native/` mirror. Inspect the public
   diff. The copy script does not commit or push anything.
4. Manually copy and edit the private release notes into
   `NATIVE_CHANGELOG.md` here. This file lives outside the mirror so the next
   source copy will not erase your wording. Website changes do not need entries.
5. Install `keepachangelog-manager-fork` if needed (`uv tool install
   keepachangelog-manager-fork`). In this public checkout, validate and promote
   the notes to the release version:

   ```sh
   kaclm --component native validate
   kaclm --component native release --override-version 0.1.0 --dry-run --yes
   kaclm --component native release --override-version 0.1.0 --yes
   RELEASE_TAG=native-v0.1.0 node .github/scripts/check-native-release.mjs
   ```

   Replace `0.1.0` with the reviewed version. `kaclm` manages this changelog
   and its `native-v` tag namespace; it does not edit Tauri or Cargo files.
6. Review the complete public diff, then commit and push it yourself. The
   source, version files, and numbered changelog section must be on the commit
   selected for the Release. No workflow commits or pushes code.

## Create and publish the public Release

Create a draft from the numbered changelog section:

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
only temporary transfer files between build and attachment jobs.

The installers are unsigned, so operating systems may show an untrusted-app
warning. There is no store listing or paid entitlement in this release path.
If a build or attachment fails, inspect that workflow run and rerun the failed
job after fixing the public source. The Release page may be visible before all
installers have finished building; verify its assets before announcing it.
