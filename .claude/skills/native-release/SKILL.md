---
name: native-release
description: Write the Mawkingbird Native changelog or prepare a Native release. Use when editing NATIVE_CHANGELOG.md, asked what changed since the last native-v tag, or asked about release readiness, installers, versions or tags.
---

# Native changelog and release

Runbooks: `ops/NATIVE_CHANGELOG_RUNBOOK.md` (how to write it), `ops/NATIVE_RELEASE.md`
(the agent contract). Read the contract before any release preparation.

## Changelog

`NATIVE_CHANGELOG.md` at this repo's root is the source of truth. The copy in
`mawkingbird_native` is byte-for-byte; never edit it there.

- An entry tells someone with the last release installed what's different for them.
  Compare against the last `native-v` tag, not against commits. Commit messages here
  are useless.
- Leave out tests, refactors, builds, dependencies, SEO and website-only pages, fixes
  for bugs no release had, anything off behind a flag, and anything that doesn't work
  in Native. Check each claim against `spec/native-transport-gaps.md`.
- One bullet per thing a user notices. Use the words on screen. "Fixed" only if the
  last release got it wrong. "Twitter", never "X".
- New notes go under `[Unreleased]`.

## Release

- GitHub Actions owns version bumps, Unreleased promotion, the version PR, installers
  and release attachments. Don't run `kaclm release`, bump Tauri/Cargo versions, or
  create releases locally to make up for workflow drift. Report the mismatch instead.
- Never commit, push, dispatch, merge, tag or publish without explicit permission.
  Never move or delete a tag.
- Ship, then test. The owner is solo with roughly no users yet, so don't block a
  release on manual acceptance. Say what's untested. Build Windows locally only;
  Actions builds Linux and macOS.
