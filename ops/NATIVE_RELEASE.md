# Releasing Mawkingbird Native with kaclm and GitHub Actions

## Agent contract: read before release preparation

The maintainer owns the decision to publish. GitHub Actions owns release
versioning, changelog promotion, the version-bump pull request (MR), installer
builds and release attachments. Updating notes or checking readiness does not
authorize an agent to perform those automated steps locally.

- Keep new user-facing notes under `NATIVE_CHANGELOG.md` → `[Unreleased]`.
- Do not run `kaclm release`, rename or empty Unreleased, or date a release heading
  as normal preparation. Do not preempt the automation's version-bump PR.
- Do not manually bump Tauri, Cargo.toml or Cargo.lock, including in the private
  host checkout. Development version files need not already say the next version.
- The draft workflow owns the draft. Do not create/update releases locally with
  `kaclm github-release` or `gh release create` as a substitute.
- Do not commit, push, dispatch workflows, merge, tag or publish without explicit
  authorization for the relevant action. Preparing notes does not authorize them.
- Do not move/delete tags, delete releases or run rollback commands as a workaround.
  Recovery is a separate, explicitly authorized task.
- If workflow code contradicts this contract, report the mismatch and repair the
  automation under an implementation task. Do not compensate with manual bumps
  or promotion. Old runbooks do not override this contract.

The public `native/` directory is a generated snapshot of the private
`../mawkingbird_native` source. Never hand-edit the mirror.

## Intended normal lifecycle

1. **Development:** maintain reviewed notes in Unreleased using the
   [changelog runbook](NATIVE_CHANGELOG_RUNBOOK.md). Validate and copy the notes
   into the private checkout. Prepare/test the shared UI and host.
2. **Source snapshot:** when deployment is authorized, inspect the mirror for
   changes to port back, then run `make deploy-source` in the private checkout.
   Review the public diff. Do not bump versions.
3. **Draft:** after an authorized push, the draft GitHub Action derives the next
   Native release from the changelog and creates/updates the draft. The maintainer
   reviews its proposed version, notes, source commit and `native-v` tag namespace.
   An authorized manual workflow dispatch can also request the draft job.
4. **Publish:** the maintainer publishes the reviewed draft GitHub Release.
   Its `release: published` event starts release automation.
5. **Automation:** the release job performs the kaclm promotion/version bookkeeping,
   opens the version-bump PR/MR, builds Windows/macOS/Linux installers with matching
   embedded versions, and attaches them to that same release. Agents must not create
   competing local promotion or version-bump commits.
6. **Finish:** review the automation PR and merge only when authorized. Synchronize
   its resulting version/changelog state back to the private source before a later
   mirror deployment overwrites it. Verify installer attachments before updating
   direct download links in README and Settings > About.

Verify that the published tag, packaged source, embedded version and automation
PR agree. Opening a PR after publication does not by itself change an existing
tag; the workflow must have an explicit checkout/build/version strategy.

## Automation and mirror synchronization

The draft workflow asks pinned kaclm for the future version and drafts directly
from Unreleased. Its optional `version` dispatch input selects a fresh number if
one was burned. It never changes an already-published release back into a draft.
The draft targets the reviewed source commit.

Publishing runs kaclm promotion in CI, stamps the application version and saves
one metadata overlay. Every installer, the SBOM, and the bookkeeping PR use that
same overlay. The original source tag stays unchanged; the release also attaches
`native-release-metadata.tar` so its generated changes are reproducible. No agent
promotes the local working changelog to prepare a release. Pinned kaclm 6.10.1
replaces the introduction and omits empty Unreleased after promotion; the CI
helper restores both. Keep the isolated regression test when changing kaclm.

The bookkeeping PR is independent of installer builds. If PR creation fails,
Actions emits a prominent warning and builds continue. Enable GitHub Actions PR
creation in the public repository settings; no private repository credentials are
needed. Review/merge the PR when convenient. Reruns preserve an existing branch.

`make deploy-source` locally synchronizes the latest numbered public changelog
version into the private Tauri version, Cargo package version and application's
lock entry, and copies the changelog. It preserves dependency/configuration
changes. It does not fetch, commit or push. A bounded, read-only GitHub release lookup
warns when publication is ahead of local notes (often an unmerged bookkeeping
PR). Lookup failure/offline mode also warns and continues; set
`NATIVE_RELEASE_OFFLINE=1` when intentionally working offline. A stale public checkout, local mirror
changes or inconsistent release metadata produce **loud warnings and continue**;
review the resulting diff. A failed synchronization keeps available private state. A private version newer
than the published notes is preserved with a warning rather than downgraded.
An older version buried in Rust source alone is not a reason to undo a release.

If publication/builds go wrong, diagnose and retry when appropriate or use the
next version number. Never delete/move published tags or roll back a release as
routine repair. Version numbers are cheap; reversing half a release is not.

These workflows and synchronization helpers were updated for 0.3.0. Local tests
are evidence of preparation, not evidence that GitHub has run the new workflow.

## Read-only readiness checks

Use Git Bash from the public repository. Python uses UTF-8; installs use wheels.

```sh
uvx --no-build --from keepachangelog-manager-fork==6.10.1 kaclm --component native validate
make native-changelog-check
node --test native/scripts/release-version.test.mjs
node .github/scripts/test-native-release.mjs  # promotes only an isolated fixture
git status --short
git -C ../mawkingbird_native status --short
gh workflow list --repo matthewdeanmartin/mawkingbird
gh release list --repo matthewdeanmartin/mawkingbird
```

Read the current draft and workflow run, not just local tags: local release tags
can be missing. Report notes reviewed, snapshot current, automated results,
owner-confirmed behavior, untested behavior, known unsupported controls and
workflow discrepancies. Do not interpret a development version as an instruction
to bump it yourself.

## Artifacts, acceptance and recovery

The installer workflow builds unsigned Windows `.exe`/`.msi`, macOS `.dmg`, and
Linux `.deb`/`.rpm`/`.AppImage` packages. Verify matrix results and attachments on
the release, not just temporary Actions artifacts. It also attaches a dependency
SBOM and attests the installers. For example:

```sh
gh attestation verify PATH_TO_INSTALLER -R matthewdeanmartin/mawkingbird
gh attestation verify PATH_TO_INSTALLER -R matthewdeanmartin/mawkingbird --predicate-type https://spdx.dev/Document/v2.3
```

Inspect a failing job and its exact source/tag before proposing recovery. Rerun
only when the tagged source is already correct. Otherwise prefer a fresh version with the fix; document the affected release,
cause and proposed changes for the maintainer. A
failure is not permission to move tags, delete a release, promote notes or bump.

This is a single-maintainer project: do not hold a release merely because every
feature lacks manual verification. Do not advertise features known to fail.

Free third-party services can be flaky. Record an isolated upstream outage (for
example Apertium returning HTTP 500 during the live smoke) as a warning, not a
reason to hold or undo a release. Distinguish it from failures in our own code.
